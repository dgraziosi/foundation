import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Sheet({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  if (!open) {
    return null;
  }
  return (
    <div className="fixed inset-0 z-40 md:contents xl:contents">
      <button
        type="button"
        aria-label="Close inspector"
        className="absolute inset-0 bg-canvas/60 md:bg-canvas/40 xl:hidden"
        onClick={onClose}
      />
      <div
        className={cn(
          "absolute inset-0 z-50 flex flex-col bg-elevated shadow-2xl md:inset-y-8 md:left-auto md:right-8 md:w-[21rem] md:rounded-2xl",
          className,
        )}
      >
        <div className="flex justify-end px-lg pt-md xl:hidden">
          <Button type="button" variant="link" className="h-auto p-0" onClick={onClose}>
            Close
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}
