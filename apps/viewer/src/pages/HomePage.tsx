import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchOntology, fetchRecents, fetchTasks, peekTodayJournal } from "../api";
import {
  HOME_WIDGET_LIMIT,
  RECENCY_GROUPS,
  TASK_DUE_GROUPS,
  compareOpenTasks,
  compareRecentRows,
  journalDayTitle,
  journalHomeToday,
  recencyGroup,
  relativeTime,
  taskDueGroup,
  todayInNewYork,
} from "../format";
import { useShell } from "../shell/context";
import { useThemeLane } from "../theme";
import { typeColors, typeIcon } from "../type-meta";
import { DueChip } from "../ui/Tags";
import { LoadError, Placeholders, Quiet } from "../ui/States";

export function HomePage() {
  const { openDetail, openCollection, openRecents } = useShell();
  const navigate = useNavigate();
  const lane = useThemeLane();
  const todayPeek = useQuery({ queryKey: ["journal-today-peek"], queryFn: peekTodayJournal });
  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const recents = useQuery({
    queryKey: ["recents", HOME_WIDGET_LIMIT],
    queryFn: () => fetchRecents(HOME_WIDGET_LIMIT),
  });
  const tasks = useQuery({
    queryKey: ["tasks", HOME_WIDGET_LIMIT],
    queryFn: () => fetchTasks(HOME_WIDGET_LIMIT),
  });
  const openTasks = [...(tasks.data?.tasks ?? [])].sort(compareOpenTasks).slice(0, HOME_WIDGET_LIMIT);
  const recentRows = [...(recents.data?.rows ?? [])]
    .sort(compareRecentRows)
    .slice(0, HOME_WIDGET_LIMIT);
  const folders = (ontology.data?.types ?? []).filter((type) => type.count > 0);
  const todayCard = journalHomeToday(todayPeek.data?.node?.payload.body, journalDayTitle(todayInNewYork()));

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto" data-surface="home">
      <div className="flex flex-col gap-lg p-lg">
          <Button
            type="button"
            variant="outline"
            size="row"
            className="h-auto flex-col items-start gap-sm rounded-lg p-md"
            data-surface="home-today"
            onClick={() => navigate("/journal/today")}
          >
            <span className="text-label text-muted-foreground">Today</span>
            {todayCard.prose ? (
              <>
                <span className="text-display-m font-medium">{todayCard.day}</span>
                <span className="whitespace-pre-wrap text-left text-body text-muted-foreground">{todayCard.prose}</span>
              </>
            ) : (
              <>
                <span className="text-display-m font-medium">Write today</span>
                <span className="text-body text-muted-foreground">{todayCard.day}</span>
              </>
            )}
          </Button>
          <div className="grid grid-cols-1 gap-md xl:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Recents</CardTitle>
                <Button type="button" variant="link" className="h-auto p-0" onClick={openRecents}>
                  View all
                </Button>
              </CardHeader>
              <CardContent className="overflow-auto p-0">
                {recents.isLoading ? <Placeholders /> : null}
                {recents.isError ? <LoadError onRetry={() => void recents.refetch()} /> : null}
                {recents.data && recentRows.length === 0 ? <Quiet>Nothing yet.</Quiet> : null}
                {RECENCY_GROUPS.map((group) => {
                  const rows = recentRows.filter((row) => recencyGroup(row.updated_at) === group);
                  if (rows.length === 0) {
                    return null;
                  }
                  return (
                    <div key={group}>
                      <div className="px-md py-1 text-label text-muted-foreground">{group}</div>
                      {rows.map((row) => {
                        const type = ontology.data?.types.find((item) => item.slug === row.type);
                        const Icon = typeIcon(type ?? { slug: row.type });
                        const colors = typeColors(type ?? { slug: row.type }, lane);
                        return (
                          <Button
                            key={row.id}
                            type="button"
                            variant="ghost"
                            size="row"
                            className="w-full justify-between rounded-none border-b border-hairline"
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
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Open tasks</CardTitle>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => openCollection("task", "Task")}
                >
                  View all
                </Button>
              </CardHeader>
              <CardContent className="overflow-auto p-0">
                {tasks.isLoading ? <Placeholders /> : null}
                {tasks.isError ? <LoadError onRetry={() => void tasks.refetch()} /> : null}
                {tasks.data && openTasks.length === 0 ? <Quiet>No open tasks.</Quiet> : null}
                {TASK_DUE_GROUPS.map((group) => {
                  const rows = openTasks.filter((task) => taskDueGroup(task.due, task.due_tone) === group);
                  if (rows.length === 0) {
                    return null;
                  }
                  return (
                    <div key={group}>
                      <div className="px-md py-1 text-label text-muted-foreground">{group}</div>
                      {rows.map((task) => (
                        <Button
                          key={task.id}
                          type="button"
                          variant="ghost"
                          size="row"
                          className="w-full justify-between rounded-none border-b border-hairline"
                          onClick={() => openDetail(task.id, task.title)}
                        >
                          <span className="break-words text-left font-medium">{task.title}</span>
                          {task.due ? <DueChip due={task.due} tone={task.due_tone} /> : null}
                        </Button>
                      ))}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
          {ontology.isLoading || ontology.isError || folders.length > 0 ? (
            <section className="flex flex-col gap-md">
              <h2 className="text-label text-muted-foreground">Types</h2>
              {ontology.isLoading ? <Placeholders /> : null}
              {ontology.isError ? <LoadError onRetry={() => void ontology.refetch()} /> : null}
              {folders.length > 0 ? (
                <div className="grid grid-cols-2 gap-md md:grid-cols-3 xl:grid-cols-4">
                  {folders.map((type) => {
                    const Icon = typeIcon(type);
                    const colors = typeColors(type, lane);
                    return (
                      <Button
                        key={type.slug}
                        type="button"
                        variant="outline"
                        size="row"
                        className="h-auto flex-col items-start gap-2 rounded-lg p-md"
                        style={{ background: colors.tint === "transparent" ? undefined : colors.tint }}
                        onClick={() => openCollection(type.slug, type.label)}
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
              ) : null}
            </section>
          ) : null}
      </div>
    </div>
  );
}
