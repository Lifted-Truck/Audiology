// Bundle invariants (lib/bundle.ts) — a patch + its MIDI as one shareable .zip.
// Two classes of oracle here: (1) our own round-trip, and (2) a REAL archiver
// (python's zipfile) opening what we wrote — because a self-consistent reader
// would happily round-trip a malformed archive that no other tool can open, and
// the whole point of a bundle is that someone else opens it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildBundle, readBundle, midiEntryName, BUNDLE_VERSION } from "../src/lib/bundle.ts";
import { DEFAULT_PATCH, PATCH_VERSION } from "../src/lib/patch.ts";

const FAKE_MIDI = new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96]); // MThd header

/** The external-archiver oracle needs a python; tests skip (not fail) without one. */
function findPython(): string | null {
  for (const c of ["python3", "python"]) {
    try { execFileSync(c, ["-c", "import zipfile"], { stdio: "ignore" }); return c; } catch { /* try next */ }
  }
  return null;
}

const sampleState = {
  ...DEFAULT_PATCH,
  root: 7,
  scaleName: "Dorian",
  followKey: true,
  views: { ...DEFAULT_PATCH.views, interpret: true },
};

test("round-trip: patch + midi survive a bundle write/read", async () => {
  const zip = buildBundle({ patch: sampleState, midi: { name: "My Song.mid", bytes: FAKE_MIDI }, name: "demo" });
  const out = await readBundle(zip);
  assert.deepEqual(out.patch, sampleState);
  assert.ok(out.midi);
  assert.equal(out.midi.name, "My Song");
  assert.deepEqual(out.midi.bytes, FAKE_MIDI);
  assert.deepEqual(out.warnings, []);
});

test("settings-only bundle (no midi) reads back with midi = null", async () => {
  const out = await readBundle(buildBundle({ patch: DEFAULT_PATCH, midi: null }));
  assert.equal(out.midi, null);
  assert.deepEqual(out.patch, DEFAULT_PATCH);
  assert.deepEqual(out.warnings, []);
});

test("deterministic: identical inputs produce byte-identical archives", () => {
  const a = buildBundle({ patch: sampleState, midi: { name: "x.mid", bytes: FAKE_MIDI } });
  const b = buildBundle({ patch: sampleState, midi: { name: "x.mid", bytes: FAKE_MIDI } });
  assert.deepEqual(a, b); // no wall-clock in the core — see the header note in bundle.ts
});

test("midiEntryName strips paths/extensions and refuses to escape midi/", () => {
  assert.equal(midiEntryName("song.mid"), "midi/song.mid");
  assert.equal(midiEntryName("/tmp/deep/Nested Song.MIDI"), "midi/Nested Song.mid");
  // Traversal is stripped entirely (last path segment only) — never "midi/../..".
  assert.equal(midiEntryName("../../etc/passwd"), "midi/passwd.mid");
  assert.ok(!midiEntryName("../../etc/passwd").includes(".."));
  assert.ok(midiEntryName("").startsWith("midi/"));
});

test("a real archiver (python zipfile) can open what we write", (t) => {
  const python = findPython();
  if (!python) return t.skip("no python available for the external-archiver oracle");

  const dir = mkdtempSync(join(tmpdir(), "audiology-bundle-"));
  try {
    const zipPath = join(dir, "b.zip");
    writeFileSync(zipPath, buildBundle({ patch: sampleState, midi: { name: "Song.mid", bytes: FAKE_MIDI }, name: "demo" }));
    // testzip() returns the first corrupt entry (CRCs verified), or None when all are sound.
    const script = `
import json, zipfile
z = zipfile.ZipFile(${JSON.stringify(zipPath)})
assert z.testzip() is None, "CRC/structure check failed"
names = sorted(z.namelist())
patch = json.loads(z.read("patch.json"))
print(json.dumps({
  "names": names,
  "patchVersion": patch["patchVersion"],
  "name": patch.get("name"),
  "scaleName": patch["scaleName"],
  "bundleVersion": json.loads(z.read("bundle.json"))["bundleVersion"],
  "midiBytes": list(z.read("midi/Song.mid")),
}))`;
    const res = JSON.parse(execFileSync(python, ["-c", script], { encoding: "utf8" }));
    assert.deepEqual(res.names, ["bundle.json", "midi/Song.mid", "patch.json"]);
    assert.equal(res.patchVersion, PATCH_VERSION);
    assert.equal(res.bundleVersion, BUNDLE_VERSION);
    assert.equal(res.name, "demo");
    assert.equal(res.scaleName, "Dorian");
    assert.deepEqual(Uint8Array.from(res.midiBytes), FAKE_MIDI);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("reads a DEFLATE-compressed bundle (someone re-zipped it with a normal archiver)", (t) => {
  const python = findPython();
  if (!python) return t.skip("no python available to produce a compressed archive");

  const dir = mkdtempSync(join(tmpdir(), "audiology-deflate-"));
  try {
    const zipPath = join(dir, "c.zip");
    // Highly repetitive payload so DEFLATE definitely engages (a tiny file can store).
    const script = `
import json, zipfile
patch = ${JSON.stringify(JSON.stringify({ patchVersion: 1, ...sampleState }))}
with zipfile.ZipFile(${JSON.stringify(zipPath)}, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("bundle.json", json.dumps({"bundleVersion": 1, "patch": "patch.json", "midi": "midi/s.mid"}))
    z.writestr("patch.json", patch)
    z.writestr("midi/s.mid", bytes(${JSON.stringify(Array.from(FAKE_MIDI))}) + b"\\x00" * 4096)`;
    execFileSync(python, ["-c", script]);
    return import("node:fs").then(async (fs) => {
      const out = await readBundle(fs.readFileSync(zipPath));
      assert.equal(out.patch.scaleName, "Dorian");
      assert.ok(out.midi);
      assert.equal(out.midi.bytes.length, FAKE_MIDI.length + 4096);
      rmSync(dir, { recursive: true, force: true });
    });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
});

test("tolerant: patch-less and malformed-patch bundles still open, with warnings", async (t) => {
  const python = findPython();
  if (!python) return t.skip("no python available to build the degenerate archives");

  const dir = mkdtempSync(join(tmpdir(), "audiology-tolerant-"));
  try {
    const noPatch = join(dir, "nopatch.zip");
    const badPatch = join(dir, "badpatch.zip");
    execFileSync(python, ["-c", `
import zipfile
with zipfile.ZipFile(${JSON.stringify(noPatch)}, "w") as z:
    z.writestr("midi/only.mid", b"MThd")
with zipfile.ZipFile(${JSON.stringify(badPatch)}, "w") as z:
    z.writestr("patch.json", "{not json at all")`]);

    const fs = await import("node:fs");

    // No patch.json at all → defaults + a warning, and the MIDI is still recovered.
    const a = await readBundle(fs.readFileSync(noPatch));
    assert.deepEqual(a.patch, DEFAULT_PATCH);
    assert.ok(a.warnings.some((w) => /no patch\.json/.test(w)), a.warnings.join("; "));
    assert.equal(a.midi?.name, "only");

    // Unparseable patch.json → defaults + a warning rather than a throw.
    const b = await readBundle(fs.readFileSync(badPatch));
    assert.deepEqual(b.patch, DEFAULT_PATCH);
    assert.ok(b.warnings.some((w) => /not valid JSON/.test(w)), b.warnings.join("; "));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rejects a non-zip with a clear message", async () => {
  await assert.rejects(() => readBundle(new Uint8Array([1, 2, 3, 4])), /not a \.zip archive/);
});
