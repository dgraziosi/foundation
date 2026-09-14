import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ApiError, fetchNode, fetchNodeActivity, undoActivity } from "../api";
import { isUuid, relativeTime } from "../format";
import { LoadError, Placeholders, Quiet } from "../ui/States";

export function ActivityPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const invalid = Boolean(id && !isUuid(id));
  const node = useQuery({
    queryKey: ["node", id],
    queryFn: () => fetchNode(id!),
    enabled: Boolean(id) && !invalid,
    retry: false,
  });
  const activity = useQuery({
    queryKey: ["activity", id],
    queryFn: () => fetchNodeActivity(id!),
    enabled: Boolean(id) && !invalid,
    retry: false,
  });
  const undo = useMutation({
    mutationFn: (row: { id: string; base_updated_at: string }) => undoActivity(row),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["node", id] });
      await queryClient.invalidateQueries({ queryKey: ["activity", id] });
      await queryClient.invalidateQueries({ queryKey: ["recents"] });
    },
  });

  if (!id || invalid) {
    return (
      <div className="p-lg">
        <Quiet>Not found.</Quiet>
      </div>
    );
  }
  if (node.isLoading || activity.isLoading) {
    return <Placeholders />;
  }
  if (node.error instanceof ApiError && node.error.status === 404) {
    return (
      <div className="p-lg">
        <h1 className="text-display-m">Not found</h1>
        <Quiet>Not found.</Quiet>
      </div>
    );
  }
  if (node.isError || activity.isError) {
    return <LoadError onRetry={() => void Promise.all([node.refetch(), activity.refetch()])} />;
  }
  const rows = activity.data?.rows ?? [];
  const undoError =
    undo.error instanceof ApiError
      ? undo.error.status === 409
        ? undo.error.message
        : "Couldn't undo."
      : null;

  return (
    <ScrollArea className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-md p-lg" data-surface="activity-page">
        <div className="flex flex-wrap items-baseline justify-between gap-sm">
          <h1 className="text-display-m">Activity</h1>
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => navigate(`/nodes/${id}`)}>
            {node.data?.node.title ?? "Back"}
          </Button>
        </div>
        {undoError ? <Quiet>{undoError}</Quiet> : null}
        {rows.length === 0 ? <Quiet>Nothing yet.</Quiet> : null}
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-start justify-between gap-md border-b border-hairline py-sm"
            data-activity-row={row.id}
          >
            <div className="min-w-0">
              <div className="font-medium">{row.summary}</div>
              <div className="text-meta text-muted-foreground">
                {row.actor_label ?? row.actor} · {relativeTime(row.created_at)}
              </div>
            </div>
            {row.can_undo && row.base_updated_at ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                disabled={undo.isPending}
                onClick={() =>
                  void undo.mutateAsync({ id: row.id, base_updated_at: row.base_updated_at! })
                }
              >
                Undo
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
