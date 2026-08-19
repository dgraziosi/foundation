import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function Placeholders() {
  return (
    <div className="flex flex-col gap-2 p-md" aria-hidden="true">
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
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

export function Quiet({ children }: { children: string }) {
  return <p className="text-muted-foreground">{children}</p>;
}
