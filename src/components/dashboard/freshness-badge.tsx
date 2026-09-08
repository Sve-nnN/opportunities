import type { SyncLogRow } from "@/db/queries/sync-log";

/**
 * "Actualizado hace Xh"/"hace Xmin" per active tab's source (direction
 * contract FIRST VIEWPORT: top bar, right slot; STORY: "ve ... un 'synced
 * Xh ago' timestamp per source"). Reads `finishedAt` off the real latest
 * `sync_log` row (`getLatestSyncPerSource()`, page.tsx) — never a client-side
 * or hardcoded timestamp. Rendered in the monospace/tabular-nums style
 * reserved for counts/timestamps (craft-floor: "the numerals in tabular
 * data... ship with browser defaults that belong to no design system").
 */
export function FreshnessBadge({ latestRow }: { latestRow: SyncLogRow | null }) {
  if (!latestRow?.finishedAt) {
    return (
      <span className="font-mono text-2xs text-muted-foreground">
        Sin sincronizar aún
      </span>
    );
  }

  return (
    <span className="font-mono text-2xs text-muted-foreground">
      Actualizado hace {formatRelativeAge(new Date(latestRow.finishedAt))}
    </span>
  );
}

/**
 * "hace {N}min" under 1h, "hace {N}h" from 1h onward — matches the plan's
 * own examples exactly ("hace Xh"/"hace Xmin").
 */
export function formatRelativeAge(finishedAt: Date, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - finishedAt.getTime());
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMinutes < 1) {
    return "menos de 1min";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}min`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h`;
}
