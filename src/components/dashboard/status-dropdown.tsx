"use client";

import { useTransition } from "react";
import {
  Bookmark,
  CheckCircle2,
  CircleDashed,
  Clock,
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
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/application-status";
import { cn } from "@/lib/utils";

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
};

export function StatusDropdown({
  opportunityExternalId,
  status,
  pathToRevalidate = "/",
}: {
  opportunityExternalId: string;
  status: ApplicationStatus;
  /** Defaults to "/" since this dashboard is a single page (03-01-PLAN.md). */
  pathToRevalidate?: string;
}) {
  const [isPending, startTransition] = useTransition();

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
    });
  }

  const CurrentIcon = STATUS_META[status].Icon;

  return (
    <Select
      value={status}
      onValueChange={handleValueChange}
      disabled={isPending}
    >
      <SelectTrigger
        size="sm"
        aria-label="Estado de postulación"
        className={cn("w-[9.75rem] transition-opacity", isPending && "opacity-50")}
      >
        <SelectValue>
          <CurrentIcon aria-hidden="true" className="size-3.5 shrink-0" />
          {STATUS_META[status].label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {APPLICATION_STATUSES.map((value) => {
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
