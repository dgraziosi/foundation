import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-meta font-medium transition-colors",
  {
    variants: {
      variant: {
        outline: "border-border bg-card text-muted-foreground",
        secondary: "border-transparent bg-muted text-muted-foreground",
        overdue: "border-transparent bg-primary/10 text-primary",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
