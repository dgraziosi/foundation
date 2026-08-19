import { Badge } from "@/components/ui/badge";
import { dueTone, type DueTone } from "../format";

export function TypeTag({ type }: { type: string }) {
  return <Badge variant="outline">{type}</Badge>;
}

export function StatusTag({ status }: { status: string }) {
  return <Badge variant="outline">{status}</Badge>;
}

export function DueChip({ due, tone }: { due: string; tone?: DueTone }) {
  const resolved = tone ?? dueTone(due);
  return (
    <Badge variant={resolved === "overdue" ? "overdue" : "outline"} className={resolved === "future" ? "text-muted-foreground" : undefined}>
      due {due}
    </Badge>
  );
}
