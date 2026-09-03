import type { Activity, WriterIdentity } from "@foundation/schema";

export type WriteContext = {
  writer?: WriterIdentity;
  destructive?: boolean;
};

export const DESTRUCTIVE: WriteContext = { destructive: true };

export function writerFrom(
  ctx: WriteContext | undefined,
  fallback?: { actor?: Activity["actor"]; actor_label?: string | null },
): WriterIdentity {
  if (ctx?.writer) {
    return ctx.writer;
  }
  return {
    actor: fallback?.actor ?? "agent",
    actor_label: fallback?.actor_label ?? null,
  };
}
