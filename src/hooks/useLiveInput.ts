// Live input: the effectful glue between physical input (computer keyboard +
// Web MIDI controllers) and the app. It owns the set of currently-held notes
// and the keyboard octave, and pushes note-on / note-off out through callbacks
// (wired to the synth by the caller). The pure mapping lives in
// `lib/midi/input.ts`; everything here is DOM / Web MIDI side effects.
//
// Web MIDI isn't in the standard TS DOM lib, so its objects are typed `any`.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  KEY_TO_SEMITONE,
  KEYBOARD_BASE_MIDI,
  OCTAVE_DOWN_KEY,
  OCTAVE_UP_KEY,
  OCTAVE_MIN,
  OCTAVE_MAX,
  parseMidiMessage,
} from "../lib/midi/input";

export interface MidiDevice {
  id: string;
  name: string;
}

/** Sentinel device id meaning "listen to every connected input". */
export const ALL_INPUTS = "all";

export interface LiveInput {
  /** Currently-held MIDI notes, ascending. */
  heldNotes: number[];
  /** Keyboard octave offset (each step = 12 semitones). */
  octaveOffset: number;
  /** Clamped setter for the octave offset. */
  setOctaveOffset: (n: number) => void;
  /** Connected Web MIDI inputs (empty until access is granted). */
  midiDevices: MidiDevice[];
  /** Selected input id, or {@link ALL_INPUTS}. */
  midiInputId: string;
  setMidiInputId: (id: string) => void;
  /** Whether the browser exposes the Web MIDI API at all. */
  midiSupported: boolean;
  /** Whether Web MIDI access has been granted this session. */
  midiEnabled: boolean;
}

interface Options {
  /** Only listen while true (i.e. while in Live mode). */
  enabled: boolean;
  onNoteOn: (midi: number, velocity: number) => void;
  onNoteOff: (midi: number) => void;
}

const clampOctave = (n: number): number =>
  Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, n));

export function useLiveInput({ enabled, onNoteOn, onNoteOff }: Options): LiveInput {
  const [heldNotes, setHeldNotes] = useState<number[]>([]);
  const [octaveOffset, setOctaveOffsetRaw] = useState(0);
  const [midiDevices, setMidiDevices] = useState<MidiDevice[]>([]);
  const [midiInputId, setMidiInputId] = useState<string>(ALL_INPUTS);
  const [midiSupported] = useState(
    () => typeof navigator !== "undefined" && "requestMIDIAccess" in navigator
  );
  const [midiEnabled, setMidiEnabled] = useState(false);

  // Held notes live in a ref (mutated synchronously from event handlers) and are
  // mirrored to state for rendering.
  const heldRef = useRef<Set<number>>(new Set());
  // Keep latest callbacks / mutable values without re-subscribing listeners.
  const onRef = useRef(onNoteOn);
  const offRef = useRef(onNoteOff);
  const octRef = useRef(octaveOffset);
  const enabledRef = useRef(enabled);
  const inputIdRef = useRef(midiInputId);
  onRef.current = onNoteOn;
  offRef.current = onNoteOff;
  octRef.current = octaveOffset;
  enabledRef.current = enabled;
  inputIdRef.current = midiInputId;

  const setOctaveOffset = useCallback((n: number) => {
    setOctaveOffsetRaw(clampOctave(n));
  }, []);

  const press = useCallback((midi: number, velocity: number) => {
    if (heldRef.current.has(midi)) return;
    heldRef.current.add(midi);
    setHeldNotes([...heldRef.current].sort((a, b) => a - b));
    onRef.current(midi, velocity);
  }, []);

  const release = useCallback((midi: number) => {
    if (!heldRef.current.has(midi)) return;
    heldRef.current.delete(midi);
    setHeldNotes([...heldRef.current].sort((a, b) => a - b));
    offRef.current(midi);
  }, []);

  const releaseAll = useCallback(() => {
    heldRef.current.forEach((m) => offRef.current(m));
    heldRef.current.clear();
    setHeldNotes([]);
  }, []);

  /* ----- computer keyboard ----- */
  useEffect(() => {
    if (!enabled) {
      releaseAll();
      return;
    }
    // Remember which physical key produced which note, so a key-up releases the
    // exact note it pressed even if the octave changed while it was held.
    const downKeys = new Map<string, number>();

    const isTypingTarget = (el: EventTarget | null): boolean => {
      const t = el as HTMLElement | null;
      if (!t) return false;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "SELECT" ||
        tag === "TEXTAREA" ||
        t.isContentEditable === true
      );
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === OCTAVE_DOWN_KEY) {
        e.preventDefault();
        setOctaveOffsetRaw((o) => clampOctave(o - 1));
        return;
      }
      if (key === OCTAVE_UP_KEY) {
        e.preventDefault();
        setOctaveOffsetRaw((o) => clampOctave(o + 1));
        return;
      }
      if (KEY_TO_SEMITONE[key] === undefined) return;
      e.preventDefault();
      if (e.repeat || downKeys.has(key)) return; // ignore auto-repeat
      const midi = KEYBOARD_BASE_MIDI + octRef.current * 12 + KEY_TO_SEMITONE[key];
      downKeys.set(key, midi);
      press(midi, 100);
    };

    const onKeyUp = (e: KeyboardEvent): void => {
      const key = e.key.toLowerCase();
      const midi = downKeys.get(key);
      if (midi === undefined) return;
      downKeys.delete(key);
      release(midi);
    };

    // Losing focus drops every key-up, so release everything to avoid stuck notes.
    const onBlur = (): void => {
      downKeys.clear();
      releaseAll();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      releaseAll();
    };
  }, [enabled, press, release, releaseAll]);

  /* ----- Web MIDI ----- */
  useEffect(() => {
    if (!enabled || !midiSupported) return;
    let cancelled = false;
    let access: any = null;
    const attached = new Map<string, (ev: any) => void>();

    const handleMessage = (inputId: string) => (ev: any): void => {
      if (!enabledRef.current) return;
      const sel = inputIdRef.current;
      if (sel !== ALL_INPUTS && sel !== inputId) return;
      const m = parseMidiMessage(ev.data);
      if (m.type === "noteon") press(m.note, m.velocity);
      else if (m.type === "noteoff") release(m.note);
    };

    const sync = (a: any): void => {
      const devices: MidiDevice[] = [];
      a.inputs.forEach((inp: any) => {
        devices.push({ id: inp.id, name: inp.name || "MIDI input" });
        // Attach once per port; new controllers connected mid-session land here too.
        if (!attached.has(inp.id)) {
          const fn = handleMessage(inp.id);
          inp.addEventListener("midimessage", fn);
          attached.set(inp.id, fn);
        }
      });
      if (!cancelled) setMidiDevices(devices);
    };

    (navigator as any)
      .requestMIDIAccess()
      .then((a: any) => {
        if (cancelled) return;
        access = a;
        setMidiEnabled(true);
        sync(a);
        a.onstatechange = () => sync(a);
      })
      .catch(() => {
        if (!cancelled) setMidiEnabled(false);
      });

    return () => {
      cancelled = true;
      if (access) {
        access.onstatechange = null;
        access.inputs.forEach((inp: any) => {
          const fn = attached.get(inp.id);
          if (fn) inp.removeEventListener("midimessage", fn);
        });
      }
      attached.clear();
    };
  }, [enabled, midiSupported, press, release]);

  return {
    heldNotes,
    octaveOffset,
    setOctaveOffset,
    midiDevices,
    midiInputId,
    setMidiInputId,
    midiSupported,
    midiEnabled,
  };
}
