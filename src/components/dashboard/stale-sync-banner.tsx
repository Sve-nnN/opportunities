import { AlertTriangle } from "lucide-react";

import type { SyncLogRow } from "@/db/queries/sync-log";
import { isSourceStale, STALE_THRESHOLD_MS } from "@/db/queries/sync-log";

/**
 * Explicit stale/failed-sync warning (CONTEXT.md: "Banner de advertencia si
 * la fuente lleva >6h sin sync exitoso, o si el último sync_log de esa
 * fuente marca success=false"). Renders nothing when the active tab's
 * source is fresh — `isSourceStale()` is the single source of truth for
 * "should this banner show," shared with any future caller so the
 * definition of stale never drifts between two places.
 *
 * Icon + text always both render (A11Y.md: never color alone) — the icon
 * shape doesn't vary by failure reason, but the copy always names exactly
 * what's wrong, including the real `errorMessage` from `sync_log` when the
 * latest attempt failed, so a real failure is diagnosable from the UI
 * itself, not just implied by a generic warning.
 */
export function StaleSyncBanner({ latestRow }: { latestRow: SyncLogRow | null }) {
  if (!isSourceStale(latestRow, new Date())) {
    return null;
  }

  const message = staleMessage(latestRow);

  return (
    <div
      role="alert"
      className="flex items-start gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-foreground"
    >
      <AlertTriangle
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 text-destructive"
      />
      <span>{message}</span>
    </div>
  );
}

function staleMessage(latestRow: SyncLogRow | null): string {
  if (!latestRow) {
    return "Esta fuente nunca se ha sincronizado exitosamente.";
  }

  if (latestRow.success === false) {
    const reason = latestRow.errorMessage?.trim();
    return reason
      ? `El último sync de esta fuente falló: ${reason}`
      : "El último sync de esta fuente falló.";
  }

  if (!latestRow.finishedAt) {
    return "El sync de esta fuente sigue en curso; aún no hay una confirmación de éxito reciente.";
  }

  const thresholdHours = STALE_THRESHOLD_MS / (60 * 60 * 1000);
  return `Esta fuente lleva más de ${thresholdHours}h sin un sync exitoso.`;
}
