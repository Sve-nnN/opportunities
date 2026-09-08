"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Server-side pagination controls for the active tab's table (04-05-PLAN.md:
 * real Postgres LIMIT/OFFSET pagination, replacing the old
 * fetch-everything-then-client-virtualize pattern). `page.tsx` (Server
 * Component) is the source of truth for what `page` actually got used in
 * the query — its own `parsePage` clamps the URL param to `>= 1` before it
 * ever reaches `.offset()`. This component reads the URL's `page` param
 * itself only to decide what the *next* click should set it to; the
 * `total`/`pageSize` props (not re-derived here) are what came back from
 * that already-clamped, already-executed query.
 *
 * Pattern-matched on `filter-chips.tsx`/`search-bar.tsx`: `router.replace`
 * (not `push`, so Anterior/Siguiente clicks don't flood history) with
 * `scroll: false` (the table has its own internal scroll, the page frame
 * itself never scrolls per DESIGN.md's fixed `100dvh` layout).
 */
export function PaginationControls({
  total,
  pageSize,
}: {
  total: number;
  pageSize: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawPage = Number.parseInt(searchParams.get("page") ?? "", 10);
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  function goToPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2">
      <p className="font-mono text-2xs text-muted-foreground">
        Mostrando {from.toLocaleString("en-US")}–{to.toLocaleString("en-US")} de{" "}
        {total.toLocaleString("en-US")}
      </p>
      <div className="flex items-center gap-1.5">
        <PageButton
          direction="prev"
          disabled={isFirstPage}
          onClick={() => goToPage(page - 1)}
        />
        <PageButton
          direction="next"
          disabled={isLastPage}
          onClick={() => goToPage(page + 1)}
        />
      </div>
    </div>
  );
}

function PageButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const label = direction === "prev" ? "Anterior" : "Siguiente";

  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-transparent px-2.5 py-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:border-input hover:text-foreground",
      )}
    >
      {direction === "prev" ? (
        <>
          <Icon aria-hidden="true" className="size-3.5" />
          {label}
        </>
      ) : (
        <>
          {label}
          <Icon aria-hidden="true" className="size-3.5" />
        </>
      )}
    </button>
  );
}
