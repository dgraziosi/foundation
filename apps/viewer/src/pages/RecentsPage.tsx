import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fetchOntology, fetchRecents } from "../api";
import { RECENCY_GROUPS, recencyGroup, relativeTime } from "../format";
import { useShell } from "../shell/context";
import { useThemeLane } from "../theme";
import { typeColors, typeIcon } from "../type-meta";
import { LoadError, Placeholders, Quiet } from "../ui/States";

export function RecentsPage() {
  const { openDetail } = useShell();
  const lane = useThemeLane();
  const recents = useQuery({ queryKey: ["recents"], queryFn: () => fetchRecents() });
  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const rows = recents.data?.rows ?? [];

  return (
    <ScrollArea className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-md p-lg">
        <h1 className="text-display-m">Recents</h1>
        {recents.isLoading ? <Placeholders /> : null}
        {recents.isError ? <LoadError onRetry={() => void recents.refetch()} /> : null}
        {recents.data && rows.length === 0 ? <Quiet>Nothing yet.</Quiet> : null}
        {RECENCY_GROUPS.map((group) => {
          const groupRows = rows.filter((row) => recencyGroup(row.updated_at) === group);
          if (groupRows.length === 0) {
            return null;
          }
          return (
            <div key={group}>
              <div className="text-label text-muted-foreground">{group}</div>
              {groupRows.map((row) => {
                const type = ontology.data?.types.find((item) => item.slug === row.type);
                const Icon = typeIcon(type ?? { slug: row.type });
                const colors = typeColors(type ?? { slug: row.type }, lane);
                return (
                  <Button
                    type="button"
                    variant="ghost"
                    size="row"
                    className="w-full justify-between rounded-none border-b border-hairline"
                    key={row.id}
                    onClick={() => openDetail(row.id, row.title)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span style={{ color: colors.ink }}>
                        <Icon size={16} strokeWidth={2} />
                      </span>
                      <span className="break-words text-left font-medium">{row.title}</span>
                    </span>
                    <span className="text-meta text-muted-foreground">{relativeTime(row.updated_at)}</span>
                  </Button>
                );
              })}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
