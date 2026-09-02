import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { unlock } from "../api";

const UNLOCK_ERROR = "That key did not unlock.";

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
    } catch {
      setError(UNLOCK_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-canvas p-lg">
      <Card className="w-full max-w-[20rem] rounded-2xl">
        <CardContent className="flex flex-col gap-md p-xl">
          <form className="flex flex-col gap-md" onSubmit={(event) => void onSubmit(event)}>
            <h1 className="text-display-m">Unlock.</h1>
            <label className="flex flex-col gap-sm text-label text-muted-foreground">
              Vault key
              <Input type="password" name="api_key" autoComplete="current-password" required />
            </label>
            {error ? <p className="text-removed">{error}</p> : null}
            <Button type="submit" disabled={busy}>
              Unlock
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
