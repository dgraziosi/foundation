import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchGraph, fetchOntology, fetchType, type ViewEngineId } from "../api";
import { useShell } from "../shell/context";
import { useThemeLane } from "../theme";
import { typeColors, typeIcon } from "../type-meta";
import { LoadError, Placeholders, Quiet } from "../ui/States";
import { EngineView } from "../views/TypeViews";
import { applyViewQuery, readShowCompleted, writeShowCompleted } from "../views/query";
import { resolveActiveView, resolveDeclaredViews, VIEW_LABELS } from "../views/resolve";

export function TypeViewPage({ slug: forcedSlug }: { slug?: string }) {
  const { slug: routeSlug } = useParams();
  const slug = forcedSlug ?? routeSlug ?? "";
  const { openDetail } = useShell();
  const lane = useThemeLane();
  const typeQuery = useQuery({
    queryKey: ["type", slug],
    queryFn: () => fetchType(slug),
    enabled: Boolean(slug),
  });
  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const resolved = resolveDeclaredViews(typeQuery.data?.type ?? {});
  const [picked, setPicked] = useState<{ slug: string; view: ViewEngineId }>();
  const [showCompleted, setShowCompleted] = useState(readShowCompleted);
  const [localGraph, setLocalGraph] = useState<{ focus: string; depth: number }>();
  const active = resolveActiveView(slug, resolved, picked);
  const fields = typeQuery.data?.type.fields ?? [];
  const activeView =
    resolved.declarations.find((view) => view.id === active) ??
    (active ? { id: active } : resolved.declarations[0]);
  const queried = useMemo(() => {
    if (!typeQuery.data || !activeView) {
      return [];
    }
    return applyViewQuery(typeQuery.data.nodes, activeView, fields, { showCompleted });
  }, [typeQuery.data, activeView, fields, showCompleted]);
  const graph = useQuery({
    queryKey: ["graph", "type", slug, localGraph?.focus, localGraph?.depth],
    queryFn: () =>
      fetchGraph(
        localGraph ? { focus: localGraph.focus, depth: localGraph.depth, type: slug } : { type: slug },
      ),
    enabled: active === "graph",
  });
  const unfiltered = typeQuery.data?.nodes.length ?? 0;
  const empty =
    unfiltered === 0 ? "Nothing yet." : queried.length === 0 ? "Nothing matches your filters." : "Nothing yet.";
  const identity = typeQuery.data?.type;
  const Icon = typeIcon(identity);
  const colors = typeColors(identity, lane);
  const count = typeQuery.data?.nodes.length ?? 0;

  return (
    <ScrollArea className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-md p-lg">
        {typeQuery.isLoading ? <Placeholders /> : null}
        {typeQuery.isError ? <LoadError onRetry={() => void typeQuery.refetch()} /> : null}
        {typeQuery.data ? (
          <>
            <h1 className="flex items-center gap-2 text-display-m" style={{ color: colors.ink }}>
              <Icon size={20} strokeWidth={2} />
              <span className="text-foreground">{typeQuery.data.type.label}</span>
              <span className="text-meta font-normal text-muted-foreground">{count}</span>
            </h1>
            {resolved.views.length === 0 ? (
              <Quiet>No views declared for this type.</Quiet>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-md">
                  <ToggleGroup
                    type="single"
                    value={active}
                    onValueChange={(value) => {
                      if (resolved.views.includes(value as ViewEngineId)) {
                        setPicked({ slug, view: value as ViewEngineId });
                      }
                    }}
                    variant="outline"
                    size="sm"
                    aria-label="View"
                  >
                    {resolved.views.map((id) => (
                      <ToggleGroupItem key={id} value={id}>
                        {VIEW_LABELS[id]}
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                  <Toggle
                    pressed={showCompleted}
                    onPressedChange={(next) => {
                      setShowCompleted(next);
                      writeShowCompleted(next);
                    }}
                    size="sm"
                    aria-label="Show completed"
                  >
                    Show completed
                  </Toggle>
                </div>
                <EngineView
                  view={active ?? resolved.views[0]!}
                  viewDeclaration={activeView}
                  fields={fields}
                  showCompleted={showCompleted}
                  nodes={queried}
                  childNodes={typeQuery.data.children}
                  graphNodes={graph.data?.nodes}
                  graphEdges={graph.data?.edges}
                  types={ontology.data?.types}
                  onSelect={(id) => {
                    const node = queried.find((item) => item.id === id);
                    openDetail(id, node?.title);
                  }}
                  empty={empty}
                  localGraph={localGraph}
                  onLocalGraph={setLocalGraph}
                />
              </>
            )}
          </>
        ) : null}
      </div>
    </ScrollArea>
  );
}
