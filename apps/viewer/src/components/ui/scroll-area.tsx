import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const ScrollArea = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("min-h-0 overflow-auto", className)} {...props} />
  ),
);
ScrollArea.displayName = "ScrollArea";
