import { useQuery } from "@tanstack/react-query";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fetchGraph, fetchOntology, fetchRecents, fetchTasks } from "../api";
import { relativeTime } from "../format";
import { GraphCanvas } from "../graph/GraphCanvas";
import type { ShellOutlet } from "../shell/context";
import { useThemeLane } from "../theme";
import { typeColors, typeIcon } from "../type-meta";
import { DueChip, TypeTag } from "../ui/Tags";
import { LoadError, Placeholders, Quiet } from "../ui/States";
import { resolveDeclaredViews } from "../views/resolve";

export function HomePage() {
  const { selectedId, select } = useOutletContext<ShellOutlet>();
  const navigate = useNavigate();
  const lane = useThemeLane();
  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const recents = useQuery({ queryKey: ["recents"], queryFn: fetchRecents });
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const graph = useQuery({
    queryKey: ["graph", "home", selectedId],
    queryFn: () => fetchGraph({ focus: selectedId }),
  });
  const slugs = (ontology.data?.types ?? []).map((type) => type.slug);
  const openTasks = tasks.data?.tasks ?? [];
  const recentRows = (recents.data?.rows ?? []).slice(0, 6);

  function openType(slug: string) {
    const type = ontology.data?.types.find((item) => item.slug === slug);
    const resolved = resolveDeclaredViews(type ?? {});
    navigate(resolved.defaultView ? `/types/${slug}` : `/types/${slug}`);
  }

  return (
    <ScrollArea className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-lg p-lg">
        <h1 className="text-display-m">Home</h1>
        <div className="grid grid-cols-1 gap-md xl:grid-cols-3">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recents</CardTitle>
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => navigate("/recents")}>
                Recents
              </Button>
            </CardHeader>
            <CardContent>
              {recents.isLoading ? <Placeholders /> : null}
              {recents.isError ? <LoadError onRetry={() => void recents.refetch()} /> : null}
              {recents.data && recentRows.length === 0 ? <Quiet>Nothing yet.</Quiet> : null}
              {recentRows.map((row) => (
                <Button
                  key={row.id}
                  type="button"
                  variant="ghost"
                  size="row"
                  className={cn(
                    "w-full justify-between rounded-none border-b border-hairline",
                    selectedId === row.node_id && "bg-active",
                  )}
                  onClick={() => row.node_id && select(row.node_id)}
                >
                  <span className="flex min-w-0 flex-col items-start text-left">
                    <span className="break-words font-medium">{row.summary}</span>
                    <span className="text-meta text-muted-foreground">{row.action}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
                    {row.type ? <TypeTag type={row.type} knownSlugs={slugs} /> : null}
                    <span>{relativeTime(row.created_at)}</span>
                  </span>
                </Button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Open tasks</CardTitle>
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => openType("task")}>
                Board
              </Button>
            </CardHeader>
            <CardContent>
              {tasks.isLoading ? <Placeholders /> : null}
              {tasks.isError ? <LoadError onRetry={() => void tasks.refetch()} /> : null}
              {tasks.data && openTasks.length === 0 ? <Quiet>No tasks yet.</Quiet> : null}
              {openTasks.map((task) => (
                <Button
                  key={task.id}
                  type="button"
                  variant="ghost"
                  size="row"
                  className={cn(
                    "w-full justify-between rounded-none border-b border-hairline",
                    selectedId === task.id && "bg-active",
                  )}
                  onClick={() => select(task.id)}
                >
                  <span className="break-words text-left font-medium">{task.title}</span>
                  {task.due ? <DueChip due={task.due} tone={task.due_tone} /> : null}
                </Button>
              ))}
            </CardContent>
          </Card>
          <Card className="min-h-64 overflow-hidden">
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Graph</CardTitle>
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => navigate("/graph")}>
                Graph
              </Button>
            </CardHeader>
            <CardContent className="h-56 p-0">
              <GraphCanvas
                nodes={graph.data?.nodes ?? []}
                edges={graph.data?.edges ?? []}
                types={ontology.data?.types}
                selectedId={selectedId}
                onSelect={select}
                loading={graph.isLoading}
                error={graph.isError}
                onRetry={() => void graph.refetch()}
                findEnabled={false}
              />
            </CardContent>
          </Card>
        </div>
        <section className="flex flex-col gap-md">
          <h2 className="text-label text-muted-foreground">Types</h2>
          {ontology.isLoading ? <Placeholders /> : null}
          {ontology.isError ? <LoadError onRetry={() => void ontology.refetch()} /> : null}
          <div className="grid grid-cols-2 gap-md md:grid-cols-3 xl:grid-cols-4">
            {(ontology.data?.types ?? []).map((type) => {
              const Icon = typeIcon(type.slug);
              const colors = typeColors(type.slug, lane, slugs);
              return (
                <Button
                  key={type.slug}
                  type="button"
                  variant="outline"
                  size="row"
                  className="h-auto flex-col items-start gap-2 rounded-lg p-md"
                  style={{ background: colors.tint }}
                  onClick={() => openType(type.slug)}
                >
                  <span className="flex items-center gap-2" style={{ color: colors.ink }}>
                    <Icon size={16} strokeWidth={2} />
                    <span className="font-medium text-foreground">{type.label}</span>
                  </span>
                  <span className="text-meta text-muted-foreground">{type.count}</span>
                </Button>
              );
            })}
          </div>
        </section>
      </div>
    </ScrollArea>
  );
}
