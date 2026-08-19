import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dueTone, type DueTone } from "../format";
import { useThemeLane } from "../theme";
import { typeColors, typeIcon } from "../type-meta";

export function TypeTag({ type, knownSlugs }: { type: string; knownSlugs?: string[] }) {
  const lane = useThemeLane();
  const Icon = typeIcon(type);
  const colors = typeColors(type, lane, knownSlugs);
  return (
    <Badge
      variant="outline"
      className="gap-1 border-transparent"
      style={{ background: colors.tint, color: colors.ink }}
    >
      <Icon size={12} strokeWidth={2} />
      {type}
    </Badge>
  );
}

export function StatusTag({ status }: { status: string }) {
  return <Badge variant="outline">{status}</Badge>;
}

export function DueChip({ due, tone }: { due: string; tone?: DueTone }) {
  const resolved = tone ?? dueTone(due);
  return (
    <Badge
      variant={resolved === "overdue" ? "overdue" : "outline"}
      className={cn(resolved === "future" && "text-muted-foreground")}
    >
      due {due}
    </Badge>
  );
}
