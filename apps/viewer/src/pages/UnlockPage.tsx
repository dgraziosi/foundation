import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
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
    <div className="unlock">
      <form onSubmit={(event) => void onSubmit(event)}>
        <h1>Unlock the vault window</h1>
        <p className="quiet">Same key as MCP. This window is read-only.</p>
        {error ? <p className="error">{error}</p> : null}
        <input
          className="field"
          type="password"
          name="api_key"
          autoComplete="current-password"
          required
        />
        <button className="primary" type="submit" disabled={busy}>
          Unlock
        </button>
      </form>
    </div>
  );
}
