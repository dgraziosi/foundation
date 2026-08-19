import { dueTone, type DueTone } from "../format";

export function TypeTag({ type }: { type: string }) {
  return <span className="pill">{type}</span>;
}

export function StatusTag({ status }: { status: string }) {
  return <span className="pill">{status}</span>;
}

export function DueChip({ due, tone }: { due: string; tone?: DueTone }) {
  const resolved = tone ?? dueTone(due);
  return <span className={`due ${resolved}`}>due {due}</span>;
}
