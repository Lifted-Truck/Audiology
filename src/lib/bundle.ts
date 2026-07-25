// Bundles — a patch travelling together with the MIDI it was made for, as a single
// .zip you can hand to someone. A patch alone is settings; a bundle is settings +
// the material they were tuned against, so the recipient opens exactly what you saw.
//
// Layout inside the archive:
//   bundle.json      manifest — version + what's inside
//   patch.json       the Patch (identical to a standalone "Save patch" file)
//   midi/<name>.mid  the loaded MIDI, when there is one
//
// Pure, React-free, Node-testable. We write the ZIP ourselves rather than take a
// dependency: the payloads are small (a JSON blob + a MIDI file), so STORE (no
// compression) is fine, and a from-scratch writer is ~80 lines against a library's
// install-and-audit cost. Reading accepts STORE *and* DEFLATE, since a recipient may
// have unzipped and re-zipped the bundle with a normal archiver, which compresses.
//
// Deliberately NO wall-clock read: every entry gets a fixed DOS timestamp so the same
// inputs produce byte-identical output (the reproducible-core rule). Archivers show
// 1980-01-01 on the entries; the manifest carries the real provenance if we ever need it.

import { sanitizePatch, toPatch, type Patch, type PatchState } from "./patch";

/** Bump when the archive layout changes incompatibly. */
export const BUNDLE_VERSION = 1;

export interface BundleManifest {
  bundleVersion: number;
  /** Path of the patch inside the archive (always "patch.json" in v1). */
  patch: string;
  /** Path of the MIDI inside the archive, or null when the bundle is settings-only. */
  midi: string | null;
}

export interface BundleInput {
  patch: PatchState;
  /** The loaded MIDI, or null to bundle settings only. */
  midi: { name: string; bytes: ArrayBuffer | Uint8Array } | null;
  /** Optional patch name recorded in patch.json. */
  name?: string;
}

export interface BundleContents {
  patch: PatchState;
  midi: { name: string; bytes: Uint8Array } | null;
  /** Non-fatal problems (missing/!valid parts). A bundle always opens to *something*. */
  warnings: string[];
}

// ----- crc32 (ZIP's integrity field) -------------------------------------------

const CRC_TABLE = /* @__PURE__ */ (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ----- little-endian byte sink --------------------------------------------------

class Sink {
  private parts: Uint8Array[] = [];
  length = 0;
  push(b: Uint8Array) { this.parts.push(b); this.length += b.length; }
  u16(n: number) { this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff])); }
  u32(n: number) { this.push(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff])); }
  concat(): Uint8Array {
    const out = new Uint8Array(this.length);
    let o = 0;
    for (const p of this.parts) { out.set(p, o); o += p.length; }
    return out;
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();
const u8 = (b: ArrayBuffer | Uint8Array) => (b instanceof Uint8Array ? b : new Uint8Array(b));

/** Fixed DOS date/time (1980-01-01 00:00) — keeps output reproducible; see header note. */
const DOS_TIME = 0;
const DOS_DATE = 33; // (1980-1980)<<9 | 1<<5 | 1

// ----- zip writer (STORE only) --------------------------------------------------

interface Entry { name: string; data: Uint8Array }

function writeZip(entries: Entry[]): Uint8Array {
  const out = new Sink();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const offset = out.length;
    out.u32(0x04034b50);      // local file header signature
    out.u16(10);              // version needed (1.0 — STORE)
    out.u16(0x800);           // flags: UTF-8 filenames
    out.u16(0);               // method: STORE
    out.u16(DOS_TIME); out.u16(DOS_DATE);
    out.u32(crc);
    out.u32(e.data.length);   // compressed size (== uncompressed under STORE)
    out.u32(e.data.length);
    out.u16(nameBytes.length);
    out.u16(0);               // extra field length
    out.push(nameBytes);
    out.push(e.data);
    central.push({ name: nameBytes, crc, size: e.data.length, offset });
  }

  const cdStart = out.length;
  for (const c of central) {
    out.u32(0x02014b50);      // central directory header signature
    out.u16(0x031e);          // version made by (UNIX, 3.0)
    out.u16(10);
    out.u16(0x800);
    out.u16(0);
    out.u16(DOS_TIME); out.u16(DOS_DATE);
    out.u32(c.crc);
    out.u32(c.size); out.u32(c.size);
    out.u16(c.name.length);
    out.u16(0); out.u16(0);   // extra, comment
    out.u16(0);               // disk number start
    out.u16(0);               // internal attributes
    out.u32(0);               // external attributes
    out.u32(c.offset);
    out.push(c.name);
  }
  const cdSize = out.length - cdStart;

  out.u32(0x06054b50);        // end of central directory
  out.u16(0); out.u16(0);
  out.u16(central.length); out.u16(central.length);
  out.u32(cdSize); out.u32(cdStart);
  out.u16(0);                 // comment length
  return out.concat();
}

// ----- zip reader (STORE + DEFLATE) ---------------------------------------------

const rdU16 = (d: DataView, o: number) => d.getUint16(o, true);
const rdU32 = (d: DataView, o: number) => d.getUint32(o, true);

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  // DecompressionStream is present in browsers and Node 18+. If a bundle arrives
  // DEFLATE-compressed somewhere it isn't, say so plainly rather than fail obscurely.
  const DS = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream;
  if (!DS) throw new Error("this bundle is compressed and DecompressionStream is unavailable here");
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Parse a ZIP into name→bytes. Reads the central directory (the authoritative index). */
async function readZip(zip: Uint8Array): Promise<Map<string, Uint8Array>> {
  const d = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // Find the end-of-central-directory record — scan back from the tail (it carries a
  // variable-length comment, so its position isn't fixed).
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 0xffff; i--) {
    if (rdU32(d, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("not a .zip archive (no end-of-central-directory record)");

  const count = rdU16(d, eocd + 10);
  let p = rdU32(d, eocd + 16);
  const files = new Map<string, Uint8Array>();

  for (let i = 0; i < count; i++) {
    if (rdU32(d, p) !== 0x02014b50) throw new Error("corrupt central directory");
    const method = rdU16(d, p + 10);
    const compSize = rdU32(d, p + 20);
    const nameLen = rdU16(d, p + 28);
    const extraLen = rdU16(d, p + 30);
    const commentLen = rdU16(d, p + 32);
    const localOff = rdU32(d, p + 42);
    const name = dec.decode(zip.subarray(p + 46, p + 46 + nameLen));

    // The local header repeats name/extra with its own lengths — data starts after them.
    const lNameLen = rdU16(d, localOff + 26);
    const lExtraLen = rdU16(d, localOff + 28);
    const dataAt = localOff + 30 + lNameLen + lExtraLen;
    const raw = zip.subarray(dataAt, dataAt + compSize);

    if (method === 0) files.set(name, raw);
    else if (method === 8) files.set(name, await inflateRaw(raw));
    else throw new Error(`unsupported compression method ${method} for "${name}"`);

    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ----- the bundle API -----------------------------------------------------------

/** Sanitize a MIDI filename for the archive (no paths, always .mid). */
export function midiEntryName(name: string): string {
  const base = (name.split(/[\\/]/).pop() || "song").replace(/\.midi?$/i, "").replace(/[^\w \-.]+/g, "_").trim();
  return "midi/" + (base || "song") + ".mid";
}

/** Build a .zip bundle (patch + optional MIDI). Deterministic for identical inputs. */
export function buildBundle({ patch, midi, name }: BundleInput): Uint8Array {
  const midiPath = midi ? midiEntryName(midi.name) : null;
  const manifest: BundleManifest = { bundleVersion: BUNDLE_VERSION, patch: "patch.json", midi: midiPath };
  const entries: Entry[] = [
    { name: "bundle.json", data: enc.encode(JSON.stringify(manifest, null, 2)) },
    { name: "patch.json", data: enc.encode(JSON.stringify(toPatch(patch, name), null, 2)) },
  ];
  if (midi && midiPath) entries.push({ name: midiPath, data: u8(midi.bytes) });
  return writeZip(entries);
}

/**
 * Open a bundle. Tolerant by design — a missing or malformed part yields defaults plus
 * a warning rather than an error, so a hand-edited or partial bundle still opens (the
 * same full-replace, never-crash contract as `sanitizePatch`).
 */
export async function readBundle(zip: ArrayBuffer | Uint8Array): Promise<BundleContents> {
  const files = await readZip(u8(zip));
  const warnings: string[] = [];

  let manifest: BundleManifest | null = null;
  const mf = files.get("bundle.json");
  if (mf) {
    try { manifest = JSON.parse(dec.decode(mf)) as BundleManifest; }
    catch { warnings.push("bundle.json is unreadable — falling back to conventional paths"); }
  }
  if (manifest && manifest.bundleVersion > BUNDLE_VERSION) {
    warnings.push(`bundle was written by a newer version (v${manifest.bundleVersion}); reading what this build understands`);
  }

  // Patch: manifest path first, then the conventional name.
  const patchBytes = (manifest?.patch ? files.get(manifest.patch) : undefined) ?? files.get("patch.json");
  let patch: PatchState;
  if (!patchBytes) {
    warnings.push("no patch.json in the bundle — using default settings");
    patch = sanitizePatch({});
  } else {
    let parsed: unknown = null;
    try { parsed = JSON.parse(dec.decode(patchBytes)) as Patch; }
    catch { warnings.push("patch.json is not valid JSON — using default settings"); }
    patch = sanitizePatch(parsed);
  }

  // MIDI: manifest path first, else the first entry under midi/.
  let midiPath = manifest?.midi ?? null;
  if (midiPath && !files.has(midiPath)) {
    warnings.push(`manifest points at "${midiPath}", which isn't in the bundle`);
    midiPath = null;
  }
  if (!midiPath) midiPath = [...files.keys()].find((k) => /^midi\/.+\.midi?$/i.test(k)) ?? null;

  const midiBytes = midiPath ? files.get(midiPath) : undefined;
  const midi = midiPath && midiBytes
    ? { name: (midiPath.split("/").pop() || "song.mid").replace(/\.midi?$/i, ""), bytes: midiBytes }
    : null;

  return { patch, midi, warnings };
}
