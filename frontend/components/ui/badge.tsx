import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "outline";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const badgeStyles: Record<BadgeVariant, string> = {
  default: "bg-surface-muted text-foreground border border-border-subtle",
  primary: "bg-primary-muted text-primary border border-primary/25",
  success: "bg-success/15 text-success border border-success/30",
  warning: "bg-warning/15 text-warning border border-warning/30",
  danger: "bg-danger/15 text-danger border border-danger/30",
  outline: "bg-transparent text-muted-foreground border border-border",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-0.5 text-xs font-medium tracking-tight",
        badgeStyles[variant],
        className
      )}
      {...props}
    />
  );
}
