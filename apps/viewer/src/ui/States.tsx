export function Placeholders() {
  return (
    <div className="placeholder" aria-hidden="true">
      <div className="bar" />
      <div className="bar" />
      <div className="bar" />
    </div>
  );
}

export function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="quiet">
      Could not load.{" "}
      <button type="button" className="text-btn" onClick={onRetry}>
        Retry
      </button>
    </p>
  );
}
