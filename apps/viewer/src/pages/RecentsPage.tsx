import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchRecents } from "../api";
import { relativeTime } from "../format";
import { TypeTag } from "../ui/Tags";
import { LoadError, Placeholders } from "../ui/States";

type Outlet = { selectedId?: string; select: (id: string) => void };

export function RecentsPage() {
  const { selectedId, select } = useOutletContext<Outlet>();
  const recents = useQuery({ queryKey: ["recents"], queryFn: fetchRecents });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <h1 className="text-title font-semibold">Recents</h1>
      {recents.isLoading ? <Placeholders /> : null}
      {recents.isError ? <LoadError onRetry={() => void recents.refetch()} /> : null}
      {recents.data && recents.data.rows.length === 0 ? <p className="text-muted-foreground">Nothing yet.</p> : null}
      {recents.data && recents.data.rows.length > 0 ? (
        <div className="flex flex-col">
          {recents.data.rows.map((row) => (
            <Button
              type="button"
              variant="ghost"
              size="row"
              className={cn(
                "w-full justify-between rounded-none border-b border-border",
                selectedId === row.node_id && "ring-1 ring-inset ring-primary",
              )}
              key={row.id}
              onClick={() => {
                if (row.node_id) {
                  select(row.node_id);
                }
              }}
            >
              <span className="flex min-w-0 flex-col items-start text-left">
                <span className="break-words font-semibold">{row.summary}</span>
                <span className="text-meta text-muted-foreground">{row.action}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 text-meta text-muted-foreground">
                {row.type ? <TypeTag type={row.type} /> : null}
                <span>{relativeTime(row.created_at)}</span>
              </span>
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
