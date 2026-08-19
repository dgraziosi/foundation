import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchTasks, type TaskCard } from "../api";
import { DueChip } from "../ui/Tags";
import { LoadError, Placeholders } from "../ui/States";

type Outlet = { selectedId?: string; select: (id: string) => void };

const COLUMNS: Array<{ status: TaskCard["status"]; label: string }> = [
  { status: "active", label: "Active" },
  { status: "completed", label: "Completed" },
  { status: "archived", label: "Archived" },
];

export function TasksPage() {
  const { selectedId, select } = useOutletContext<Outlet>();
  const tasks = useQuery({ queryKey: ["tasks"], queryFn: fetchTasks });
  const list = tasks.data?.tasks ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      {tasks.isLoading ? <Placeholders /> : null}
      {tasks.isError ? <LoadError onRetry={() => void tasks.refetch()} /> : null}
      <div className="grid flex-1 grid-cols-1 items-start gap-3 md:grid-cols-3" data-surface="tasks">
        {COLUMNS.map((column) => {
          const cards = list.filter((task) => task.status === column.status);
          return (
            <Card className="flex min-h-48 flex-col" key={column.status}>
              <CardHeader className="pb-2">
                <CardTitle>{column.label}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {column.status === "active" && cards.length === 0 ? (
                  <p className="text-muted-foreground">No tasks yet.</p>
                ) : null}
                {cards.map((task) => (
                  <Button
                    type="button"
                    variant="outline"
                    size="row"
                    className={cn(
                      "w-full flex-col items-start gap-1 p-2 shadow-none",
                      selectedId === task.id && "ring-1 ring-primary",
                    )}
                    key={task.id}
                    onClick={() => select(task.id)}
                  >
                    <span className="break-words text-left font-semibold">{task.title}</span>
                    {task.due ? <DueChip due={task.due} tone={task.due_tone} /> : null}
                    {task.parent_title ? (
                      <span className="text-meta text-muted-foreground">{task.parent_title}</span>
                    ) : null}
                  </Button>
                ))}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
