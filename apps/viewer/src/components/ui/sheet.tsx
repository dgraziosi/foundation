import * as DialogPrimitive from "@radix-ui/react-dialog";
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
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-canvas/60 md:bg-canvas/40 xl:hidden" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-0 z-50 flex flex-col bg-elevated shadow-2xl outline-none",
            "md:inset-y-8 md:left-auto md:right-8 md:w-[21rem] md:rounded-2xl",
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">Inspector</DialogPrimitive.Title>
          <div className="flex justify-end px-lg pt-md xl:hidden">
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="link" className="h-auto p-0">
                Close
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
