// Small presentational primitives shared across the control panels. CSS classes
// match the originals so the look is unchanged.

import React from "react";

export function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="field">
      <span className="field-lbl">{label}</span>
      {children}
    </div>
  );
}

export interface SegOption<T> {
  v: T;
  l: React.ReactNode;
}

export function Seg<T extends string | number | boolean>({
  options,
  value,
  onChange,
  small,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  small?: boolean;
}) {
  return (
    <div className={"seg" + (small ? " sm" : "")}>
      {options.map((o) => (
        <button
          key={String(o.v)}
          className={"seg-btn" + (value === o.v ? " on" : "")}
          onClick={() => onChange(o.v)}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Sel({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="sel-wrap">
      <select className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <span className="sel-arrow">{"▾"}</span>
    </div>
  );
}

export function PcChips({
  value,
  onChange,
  noteName,
  disabledFn,
  outFn,
}: {
  value: number;
  onChange: (pc: number) => void;
  noteName: (pc: number) => string;
  disabledFn?: (pc: number) => boolean;
  outFn?: (pc: number) => boolean;
}) {
  return (
    <div className="px-pcrow">
      {Array.from({ length: 12 }, (_, pc) => {
        const dis = disabledFn ? disabledFn(pc) : false;
        const out = outFn ? outFn(pc) : false;
        return (
          <button
            key={pc}
            disabled={dis}
            className={"px-pc" + (value === pc ? " sel" : "") + (out ? " out" : "") + (dis ? " dis" : "")}
            onClick={() => onChange(pc)}
          >
            {noteName(pc)}
          </button>
        );
      })}
    </div>
  );
}

export function Dot({ c, t, ring }: { c: string; t: React.ReactNode; ring?: boolean }) {
  return (
    <span className="px-leg-item">
      <span
        className="px-leg-dot"
        style={{ background: ring ? "transparent" : c, border: ring ? "1px solid " + c : "none" }}
      />
      {t}
    </span>
  );
}
