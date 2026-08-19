import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
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
    <div className="page">
      {tasks.isLoading ? <Placeholders /> : null}
      {tasks.isError ? <LoadError onRetry={() => void tasks.refetch()} /> : null}
      <div className="board" data-surface="tasks">
        {COLUMNS.map((column) => {
          const cards = list.filter((task) => task.status === column.status);
          return (
            <section className="column" key={column.status}>
              <h2>{column.label}</h2>
              {column.status === "active" && cards.length === 0 ? (
                <p className="quiet">No tasks yet.</p>
              ) : null}
              {cards.map((task) => (
                <button
                  type="button"
                  className={`card${selectedId === task.id ? " selected" : ""}`}
                  key={task.id}
                  onClick={() => select(task.id)}
                >
                  <span className="row-title">{task.title}</span>
                  {task.due ? <DueChip due={task.due} tone={task.due_tone} /> : null}
                  {task.parent_title ? <span className="row-meta">{task.parent_title}</span> : null}
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
