import { Button } from "@/components/ui/button";

export function Placeholders() {
  return (
    <div className="flex flex-col gap-2 p-4" aria-hidden="true">
      <div className="h-2.5 animate-pulse rounded-md bg-border" />
      <div className="h-2.5 animate-pulse rounded-md bg-border" />
      <div className="h-2.5 animate-pulse rounded-md bg-border" />
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="text-muted-foreground">
      Could not load.{" "}
      <Button type="button" variant="link" className="h-auto p-0" onClick={onRetry}>
        Retry
      </Button>
    </p>
  );
}
