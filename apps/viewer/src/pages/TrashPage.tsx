import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ApiError, fetchOntology, fetchTrash, restoreNode } from "../api";
import { relativeTime } from "../format";
import { useShell } from "../shell/context";
import { useThemeLane } from "../theme";
import { typeColors, typeIcon } from "../type-meta";
import { LoadError, Placeholders, Quiet } from "../ui/States";

export function TrashPage() {
  const { openDetail } = useShell();
  const lane = useThemeLane();
  const queryClient = useQueryClient();
  const trash = useQuery({ queryKey: ["trash"], queryFn: fetchTrash });
  const ontology = useQuery({ queryKey: ["ontology"], queryFn: fetchOntology });
  const restore = useMutation({
    mutationFn: (row: { id: string; base_updated_at: string }) => restoreNode(row),
    onSuccess: async (detail) => {
      await queryClient.invalidateQueries({ queryKey: ["trash"] });
      await queryClient.invalidateQueries({ queryKey: ["recents"] });
      await queryClient.invalidateQueries({ queryKey: ["ontology"] });
      openDetail(detail.node.id, detail.node.title);
    },
  });
  const rows = trash.data?.rows ?? [];
  const restoreError =
    restore.error instanceof ApiError
      ? restore.error.message
      : restore.error
        ? "Couldn't restore."
        : null;

  return (
    <ScrollArea className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-md p-lg" data-surface="trash-page">
        <h1 className="text-display-m">Trash</h1>
        {restoreError ? <Quiet>{restoreError}</Quiet> : null}
        {trash.isLoading ? <Placeholders /> : null}
        {trash.isError ? <LoadError onRetry={() => void trash.refetch()} /> : null}
        {trash.data && rows.length === 0 ? <Quiet>Nothing in trash.</Quiet> : null}
        {rows.map((row) => {
          const type = ontology.data?.types.find((item) => item.slug === row.type);
          const Icon = typeIcon(type ?? { slug: row.type });
          const colors = typeColors(type ?? { slug: row.type }, lane);
          return (
            <div
              key={row.id}
              className="flex w-full items-center justify-between gap-md border-b border-hairline py-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span style={{ color: colors.ink }}>
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span className="min-w-0">
                  <span className="block break-words font-medium">{row.title}</span>
                  <span className="text-meta text-muted-foreground">{relativeTime(row.deleted_at)}</span>
                </span>
              </span>
              <Button
                type="button"
                variant="link"
                className="h-auto p-0"
                disabled={restore.isPending}
                onClick={() => void restore.mutateAsync({ id: row.id, base_updated_at: row.updated_at })}
              >
                Restore
              </Button>
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
