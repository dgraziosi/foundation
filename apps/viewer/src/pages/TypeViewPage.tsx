import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fetchGraph, fetchNode, fetchOntology, fetchType, type ViewEngineId } from "../api";
import type { ShellOutlet } from "../shell/context";
import { LoadError, Placeholders, Quiet } from "../ui/States";
import { EngineView } from "../views/TypeViews";
import { resolveDeclaredViews, VIEW_LABELS } from "../views/resolve";

export function TypeViewPage({ slug: forcedSlug }: { slug?: string }) {
  const { slug: routeSlug } = useParams();
  const slug = forcedSlug ?? routeSlug ?? "";
  const { selectedId, select } = useOutletContext<ShellOutlet>();
  const typeQuery = useQuery({
    queryKey: ["type", slug],
    queryFn: () => fetchType(slug),
    enabled: Boolean(slug),
  });
  const resolved = resolveDeclaredViews(typeQuery.data?.type ?? {});
  const [view, setView] = useState<ViewEngineId | "">("");
  const active = (view && resolved.views.includes(view) ? view : resolved.defaultView) as
    | ViewEngineId
    | undefined;
  const graph = useQuery({
    queryKey: ["graph", "type", slug, selectedId],
    queryFn: () => fetchGraph({ focus: selectedId, type: slug }),
    enabled: active === "graph",
  });

  const empty = `No ${typeQuery.data?.type.label ?? slug} yet.`;

  return (
    <ScrollArea className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-md p-lg">
        {typeQuery.isLoading ? <Placeholders /> : null}
        {typeQuery.isError ? <LoadError onRetry={() => void typeQuery.refetch()} /> : null}
        {typeQuery.data ? (
          <>
            <h1 className="text-display-m">{typeQuery.data.type.label}</h1>
            {resolved.views.length === 0 ? (
              <Quiet>No views declared for this type.</Quiet>
            ) : (
              <>
                <ToggleGroup
                  type="single"
                  value={active}
                  onValueChange={(value) => {
                    if (resolved.views.includes(value as ViewEngineId)) {
                      setView(value as ViewEngineId);
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
                <EngineView
                  view={active ?? resolved.views[0]!}
                  nodes={typeQuery.data.nodes}
                  childNodes={typeQuery.data.children}
                  graphNodes={graph.data?.nodes}
                  graphEdges={graph.data?.edges}
                  selectedId={selectedId}
                  onSelect={select}
                  empty={empty}
                />
              </>
            )}
          </>
        ) : null}
      </div>
    </ScrollArea>
  );
}

export function NodeDeepLinkPage() {
  const { selectedId, invalidPath } = useOutletContext<ShellOutlet>();
  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const node = useQuery({
    queryKey: ["node", selectedId],
    queryFn: () => fetchNode(selectedId!),
    enabled: Boolean(selectedId) && !invalidPath,
    retry: false,
  });
  const slug = node.data?.node.type;
  const known = useMemo(() => ontology.data?.types.some((type) => type.slug === slug), [ontology.data, slug]);

  if (!selectedId || invalidPath) {
    return (
      <div className="p-lg">
        <h1 className="text-display-m">Home</h1>
        <Quiet>Not found.</Quiet>
      </div>
    );
  }
  if (node.isLoading || ontology.isLoading) {
    return <Placeholders />;
  }
  if (!slug || known === false) {
    return (
      <div className="p-lg">
        <Quiet>Not found.</Quiet>
      </div>
    );
  }
  return <TypeViewPage slug={slug} />;
}
