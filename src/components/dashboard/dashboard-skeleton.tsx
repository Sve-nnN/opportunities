const PULSE = "animate-pulse rounded bg-muted";

/**
 * The only "loading state" this app ever shows (CONTEXT.md: "nunca spinners
 * genéricos") — a static placeholder shaped like the real dashboard (tab bar,
 * search bar, filter chips, dense table) so there is no layout shift when
 * real content replaces it. Wired as `src/app/loading.tsx`, Next.js's
 * automatic loading-UI convention for the pending `page.tsx` data fetch.
 *
 * Decorative blocks are `aria-hidden`; a `role="status"` sr-only label
 * carries the loading state to screen reader / assistive-tech users, since a
 * purely visual pulse animation communicates nothing to them (A11Y.md).
 */
export function DashboardSkeleton() {
  return (
    <div className="flex h-dvh flex-col">
      <span className="sr-only" role="status">
        Cargando datos…
      </span>

      <div aria-hidden="true" className="contents">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className={`h-5 w-40 ${PULSE}`} />
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-0">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
            <div className="flex items-center gap-4">
              <div className={`h-6 w-24 ${PULSE}`} />
              <div className={`h-6 w-28 ${PULSE}`} />
              <div className={`h-6 w-24 ${PULSE}`} />
            </div>

            <div className="flex flex-1 flex-wrap items-center justify-center gap-3">
              <div className={`h-8 w-full max-w-md ${PULSE} rounded-lg`} />
              <div className="flex flex-wrap items-center gap-1.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className={`h-6 w-16 ${PULSE} rounded-full`} />
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden px-4 py-3">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Company", "Title", "Location", "Status", "Link"].map(
                    (label) => (
                      <th key={label} className="px-2 py-2 text-left">
                        <div className={`h-3 w-16 ${PULSE}`} />
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 8 }).map((_, row) => (
                  <tr key={row} className="border-b border-border">
                    <td className="p-2">
                      <div className={`h-3.5 w-28 ${PULSE}`} />
                    </td>
                    <td className="p-2">
                      <div className={`h-3.5 w-44 ${PULSE}`} />
                    </td>
                    <td className="p-2">
                      <div className={`h-3.5 w-24 ${PULSE}`} />
                    </td>
                    <td className="p-2">
                      <div className={`h-5 w-16 ${PULSE} rounded-full`} />
                    </td>
                    <td className="p-2 text-right">
                      <div className={`ml-auto h-3.5 w-16 ${PULSE}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
