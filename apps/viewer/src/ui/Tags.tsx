import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { dueTone, type DueTone } from "../format";
import { useThemeLane } from "../theme";
import { identityFor, typeColors, typeIcon, type TypeIdentity } from "../type-meta";

export function TypeTag({
  type,
  types,
}: {
  type: string;
  types?: Array<TypeIdentity & { slug: string }>;
}) {
  const lane = useThemeLane();
  const identity = identityFor(type, types);
  const Icon = typeIcon(identity);
  const colors = typeColors(identity, lane);
  return (
    <Badge
      variant="outline"
      className="gap-1 border-transparent"
      style={{ background: colors.tint === "transparent" ? undefined : colors.tint, color: colors.ink }}
    >
      <Icon size={12} strokeWidth={2} />
      {type}
    </Badge>
  );
}

export function StatusTag({ status }: { status: string }) {
  return <Badge variant="outline">{status}</Badge>
}

export function DueChip({ due, tone }: { due: string; tone?: DueTone }) {
  const resolved = tone ?? dueTone(due);
  return (
    <Badge
      variant={resolved === "overdue" ? "overdue" : "outline"}
      className={cn(resolved === "future" && "text-muted-foreground")}
    >
      {due}
    </Badge>
  );
}
