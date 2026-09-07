import { CheckCircle2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Open/closed indicator that is never color-only (A11Y.md, PRODUCT.md
 * Accessibility). Icon shape (check vs. x) and text label ("Abierto" /
 * "Cerrado") both always render — a colorblind or grayscale-display reader
 * gets the same information as anyone else.
 */
export function StatusPill({
  isActive,
  className,
}: {
  isActive: boolean;
  className?: string;
}) {
  const Icon = isActive ? CheckCircle2 : XCircle;

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        isActive
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {isActive ? "Abierto" : "Cerrado"}
    </span>
  );
}
