import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthError, unlock } from "../api";

export function UnlockPage() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const apiKey = String(form.get("api_key") ?? "");
    setBusy(true);
    setError(null);
    try {
      await unlock(apiKey);
      await queryClient.invalidateQueries({ queryKey: ["session"] });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "API key required");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <form className="flex w-full max-w-xs flex-col gap-3" onSubmit={(event) => void onSubmit(event)}>
        <h1 className="text-title font-semibold">Unlock the vault window</h1>
        <p className="text-muted-foreground">Same key as MCP. This window is read-only.</p>
        {error ? <p className="text-primary">{error}</p> : null}
        <Input type="password" name="api_key" autoComplete="current-password" required />
        <Button type="submit" disabled={busy}>
          Unlock
        </Button>
      </form>
    </div>
  );
}
