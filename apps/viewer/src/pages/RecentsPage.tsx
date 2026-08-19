import { useQuery } from "@tanstack/react-query";
import { useOutletContext } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fetchRecents } from "../api";
import { relativeTime } from "../format";
import type { ShellOutlet } from "../shell/context";
import { TypeTag } from "../ui/Tags";
import { LoadError, Placeholders, Quiet } from "../ui/States";

export function RecentsPage() {
  const { selectedId, select } = useOutletContext<ShellOutlet>();
  const recents = useQuery({ queryKey: ["recents"], queryFn: fetchRecents });

  return (
    <ScrollArea className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-md p-lg">
        <h1 className="text-display-m">Recents</h1>
        {recents.isLoading ? <Placeholders /> : null}
        {recents.isError ? <LoadError onRetry={() => void recents.refetch()} /> : null}
        {recents.data && recents.data.rows.length === 0 ? <Quiet>Nothing yet.</Quiet> : null}
        {recents.data && recents.data.rows.length > 0 ? (
          <div className="flex flex-col">
            {recents.data.rows.map((row) => (
              <Button
                type="button"
                variant="ghost"
                size="row"
                className={cn(
                  "w-full justify-between rounded-none border-b border-hairline",
                  selectedId === row.node_id && "bg-active",
                )}
                key={row.id}
                onClick={() => {
                  if (row.node_id) {
                    select(row.node_id);
                  }
                }}
              >
                <span className="flex min-w-0 flex-col items-start text-left">
                  <span className="break-words font-medium">{row.summary}</span>
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
    </ScrollArea>
  );
}
