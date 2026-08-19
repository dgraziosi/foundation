import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Tooltip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cn("relative inline-flex", className)} title={label}>
      {children}
    </span>
  );
}
