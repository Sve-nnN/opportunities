"use client";

import { useRef, useTransition } from "react";
import {
  Bookmark,
  CheckCircle2,
  CircleCheck,
  CircleDashed,
  Clock,
  Eye,
  Hourglass,
  Send,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { updateApplicationStatus } from "@/app/actions/applications";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MANUALLY_SELECTABLE_STATUSES,
  type ApplicationStatus,
} from "@/lib/application-status";
import { cn } from "@/lib/utils";

/**
 * The 3 read-only auto-apply intermediate states (05-CONTEXT.md, 05-UI-
 * SPEC.md "Status Extension"). A `Set` so the SelectTrigger's tint check
 * below is a single O(1) lookup per render, not a `.includes()` scan.
 */
const AUTO_STATUSES = new Set<ApplicationStatus>([
  "auto_fill_in_progress",
  "ready_to_review",
  "submitted",
]);

/**
 * Icon + Spanish label per status. Every option pairs an icon with text
 * (DESIGN.md "Never-Color-Alone Rule") — never icon-only, never color-only.
 * "Guardado / me interesa" (`saved`) is a normal option in this same list,
 * not a separate UI (TRACK-04): it occupies the same `status` column as
 * every other value.
 */
const STATUS_META: Record<
  ApplicationStatus,
  { label: string; Icon: LucideIcon }
> = {
  saved: { label: "Guardado / me interesa", Icon: Bookmark },
  not_applied: { label: "Por aplicar", Icon: CircleDashed },
  applied: { label: "Aplicado", Icon: Send },
  in_progress: { label: "En proceso", Icon: Clock },
  rejected: { label: "Rechazado", Icon: XCircle },
  accepted: { label: "Aceptado", Icon: CheckCircle2 },
  // Read-only auto-apply intermediate states (05-CONTEXT.md, 05-UI-SPEC.md
  // "Status Extension") — only ever set by the Phase 6 callback API, never
  // selectable here (see MANUALLY_SELECTABLE_STATUSES/SelectContent below).
  // Icons deliberately distinct from the 6 manual states' icons (Hourglass
  // vs. in_progress's Clock, CircleCheck's thin outline vs. accepted's
  // bolder two-tone CheckCircle2).
  auto_fill_in_progress: { label: "Auto-fill en curso", Icon: Hourglass },
  ready_to_review: { label: "Listo para revisar", Icon: Eye },
  submitted: { label: "Enviado (auto-apply)", Icon: CircleCheck },
};

export function StatusDropdown({
  opportunityExternalId,
  status,
  pathToRevalidate = "/",
  tabIndex,
}: {
  opportunityExternalId: string;
  status: ApplicationStatus;
  /** Defaults to "/" since this dashboard is a single page (03-01-PLAN.md). */
  pathToRevalidate?: string;
  /**
   * Forwarded to the underlying trigger button - lets a roving-tabindex
   * parent (VirtualizedOpportunitiesTable, 03-02-PLAN.md Task 3) exclude
   * this control from the normal Tab sequence when its row isn't the
   * currently active one, so Tab enters the table exactly once instead of
   * stepping through every mounted row's controls.
   */
  tabIndex?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);

  function handleValueChange(nextStatus: string) {
    startTransition(async () => {
      const result = await updateApplicationStatus(
        opportunityExternalId,
        nextStatus,
        pathToRevalidate,
      );
      if (!result.ok) {
        // Zod rejected an unexpected value (T-03-01) or the write failed —
        // surfaced to the console since this is a single-user tool with no
        // toast/error-banner system yet; the dropdown itself reverts to the
        // last-committed value because `value` below stays server-driven.
        console.error(
          `[StatusDropdown] failed to update ${opportunityExternalId}:`,
          result.error,
        );
      }
      // Defensive re-focus (found live via 03-02-PLAN.md Task 3's keyboard
      // walkthrough, Rule 1 bug fix): Radix Select restores focus to the
      // trigger the instant an option is chosen, but `revalidatePath`'s
      // Server Component refresh (router.refresh() under the hood) lands
      // AFTER this awaited Server Action call already resolved - measured
      // live, checking immediately here is too early, the actual DOM
      // reconciliation that drops focus to <body> happens ~100-400ms
      // later. Poll briefly for that delayed disruption and reclaim focus
      // only if it was actually lost to <body> - never steal it from
      // something the user has since Tabbed/clicked into.
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 75));
        if (document.activeElement === document.body) {
          triggerRef.current?.focus();
        } else {
          break;
        }
      }
    });
  }

  const CurrentIcon = STATUS_META[status].Icon;
  const isAutoStatus = AUTO_STATUSES.has(status);

  return (
    <Select
      value={status}
      onValueChange={handleValueChange}
      disabled={isPending}
    >
      <SelectTrigger
        ref={triggerRef}
        size="sm"
        aria-label="Estado de postulación"
        tabIndex={tabIndex}
        className={cn(
          "w-[9.75rem] transition-opacity",
          isPending && "opacity-50",
          // Violet-tint surface signals "auto-set, Juan didn't pick this by
          // hand" (05-UI-SPEC.md "Status Extension") — reuses the existing
          // bg-accent/text-accent-foreground tokens (#1e1930/#e7e5e1), not a
          // new 4th use of raw Signal Violet (DESIGN.md One Accent Rule).
          isAutoStatus && "bg-accent text-accent-foreground",
        )}
      >
        <SelectValue>
          <CurrentIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {STATUS_META[status].label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {MANUALLY_SELECTABLE_STATUSES.map((value) => {
          const { label, Icon } = STATUS_META[value];
          return (
            <SelectItem key={value} value={value}>
              <Icon aria-hidden="true" className="size-3.5 shrink-0" />
              {label}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
