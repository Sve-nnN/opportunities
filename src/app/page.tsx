import { ExternalLink } from "lucide-react";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { FilterChips } from "@/components/dashboard/filter-chips";
import { FreshnessBadge } from "@/components/dashboard/freshness-badge";
import { SearchBar } from "@/components/dashboard/search-bar";
import { StaleSyncBanner } from "@/components/dashboard/stale-sync-banner";
import { StatusDropdown } from "@/components/dashboard/status-dropdown";
import { StatusPill } from "@/components/dashboard/status-pill";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db } from "@/db/client";
import {
  type ApplicationRecord,
  getApplicationsByExternalIds,
} from "@/db/queries/applications";
import { listBenefits } from "@/db/queries/benefits";
import {
  getDistinctCategories,
  getDistinctRoleTypes,
  listOpportunities,
  type OpportunityFilters,
  type OpportunitySource,
  type OpportunityStatus,
} from "@/db/queries/opportunities";
import {
  getLatestSyncPerSource,
  type KnownSource,
} from "@/db/queries/sync-log";

// This dashboard has exactly one reader (Juan) and its data lives in
// Postgres, itself already the cache for the 2h GitHub sync (PRODUCT.md
// Operating Context) — there is nothing useful to statically prerender, and
// a stale build-time snapshot would defeat the "always reflects last sync"
// requirement (DISC-01). Always render this page per-request.
export const dynamic = "force-dynamic";

const stickyHeadClass = "sticky top-0 z-10 bg-card";

type TabValue = "internships" | "underclassmen" | "benefits";

const TAB_SOURCE: Record<Exclude<TabValue, "benefits">, OpportunitySource> = {
  internships: "summer2027-internships",
  underclassmen: "underclassmen-opportunities",
};

/**
 * Every tab's freshness-badge/stale-banner source, `benefits` included
 * (unlike `TAB_SOURCE`, which only covers `opportunities` table sources).
 * DISC-04 applies to all 3 tabs, not just the two `opportunities`-backed ones.
 */
const TAB_SYNC_SOURCE: Record<TabValue, KnownSource> = {
  internships: "summer2027-internships",
  underclassmen: "underclassmen-opportunities",
  benefits: "student-benefits",
};

function parseTab(raw: string | undefined): TabValue {
  return raw === "underclassmen" || raw === "benefits" ? raw : "internships";
}

function parseStatus(raw: string | undefined): OpportunityStatus | undefined {
  return raw === "open" || raw === "closed" ? raw : undefined;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const activeTab = parseTab(firstValue(params.tab));

  // Filters read from the URL are scoped to the active tab only (CONTEXT.md:
  // "buscador global arriba, aplica a la tab activa") — the other two tabs
  // still fetch their full, unfiltered dataset so switching tabs never shows
  // a stale filtered view of a different data source.
  const opportunityFilters: OpportunityFilters = {
    search: firstValue(params.q),
    category: firstValue(params.category),
    roleType: firstValue(params.roleType),
    status: parseStatus(firstValue(params.status)),
  };
  const benefitFilters = { search: firstValue(params.q) };

  const [internships, underclassmen, benefits, categories, roleTypes, syncBySource] =
    await Promise.all([
      listOpportunities(
        "summer2027-internships",
        activeTab === "internships" ? opportunityFilters : {},
      ),
      listOpportunities(
        "underclassmen-opportunities",
        activeTab === "underclassmen" ? opportunityFilters : {},
      ),
      listBenefits(activeTab === "benefits" ? benefitFilters : {}),
      activeTab === "benefits"
        ? Promise.resolve([])
        : getDistinctCategories(TAB_SOURCE[activeTab]),
      activeTab === "benefits"
        ? Promise.resolve([])
        : getDistinctRoleTypes(TAB_SOURCE[activeTab]),
      getLatestSyncPerSource(db),
    ]);

  // A single `applications` lookup covering both Internships and
  // Underclassmen (both are `opportunities`-table sources, same tracking
  // table) — avoids an N+1 per-row query. This can only run once
  // internships/underclassmen have resolved above, since it needs their
  // `externalId`s; still a single extra round trip, not one per row.
  // Benefits are excluded: TRACK-01/04 only cover opportunities, "you don't
  // apply to a benefit."
  const applicationsByExternalId = await getApplicationsByExternalIds([
    ...internships.map((row) => row.externalId),
    ...underclassmen.map((row) => row.externalId),
  ]);

  const activeTabSyncRow = syncBySource[TAB_SYNC_SOURCE[activeTab]];

  // Filtered result count for the active tab only — announced via
  // aria-live so a screen-reader user gets feedback when search/filter
  // narrows the table, since the table itself re-renders silently on a
  // Server Component navigation with no page reload (A11Y.md).
  const activeResultCount =
    activeTab === "internships"
      ? internships.length
      : activeTab === "underclassmen"
        ? underclassmen.length
        : benefits.length;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">
          Opportunities Hub
        </h1>
      </header>

      <DashboardTabs
        value={activeTab}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex flex-wrap items-start gap-3 border-b border-border px-4 py-2">
          <TabsList variant="line">
            <TabsTrigger value="internships">
              Internships <Count n={countActive(internships)} />
            </TabsTrigger>
            <TabsTrigger value="underclassmen">
              Underclassmen <Count n={countActive(underclassmen)} />
            </TabsTrigger>
            <TabsTrigger value="benefits">
              Beneficios .edu <Count n={countActive(benefits)} />
            </TabsTrigger>
          </TabsList>

          {/*
            `max-h-24 overflow-y-auto`: Underclassmen's real source data has
            102 distinct `category` values (long eligibility-requirement
            strings, a Phase 1 ingestion data-quality gap — see 02-03-SUMMARY.md
            "Issues Encountered," out of this plan's scope to fix at the
            source). Unbounded `flex-wrap` on that many/long chips was
            measured pushing this row past 1500px tall, squeezing the
            table's `flex-1` sibling to 0 height (Playwright-measured, not
            just visually estimated) and making the entire Underclassmen tab
            invisible. Every chip is still in the DOM and reachable by
            Tab — this only bounds the row's own vertical growth so the
            table below it always has real space, regardless of how many
            filter values a source happens to have.
          */}
          <div className="flex max-h-24 flex-1 flex-wrap items-center justify-center gap-3 overflow-y-auto py-1">
            <SearchBar />
            <FilterChips categories={categories} roleTypes={roleTypes} />
          </div>

          <FreshnessBadge latestRow={activeTabSyncRow} />
        </div>

        {/*
          Screen-reader-only live region: announces the active tab's
          filtered result count whenever search/filter narrows the table.
          The table itself gives no other non-visual signal that a
          Server-Component navigation just re-rendered its rows.
        */}
        <p aria-live="polite" role="status" className="sr-only">
          {activeResultCount.toLocaleString("en-US")} resultados
        </p>

        <TabsContent
          value="internships"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <StaleSyncBanner
            latestRow={syncBySource[TAB_SYNC_SOURCE.internships]}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <OpportunitiesTable
              rows={internships}
              applicationsByExternalId={applicationsByExternalId}
            />
          </div>
        </TabsContent>

        {/*
          Underclassmen is surfaced, not hidden (Juan is past this eligibility
          window himself, per 02-CONTEXT.md) — same table, same keyboard
          reachability, just a visually quieter row treatment via
          `deemphasized` (no bold company name) instead of a separate
          component or reduced data.
        */}
        <TabsContent
          value="underclassmen"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <StaleSyncBanner
            latestRow={syncBySource[TAB_SYNC_SOURCE.underclassmen]}
          />
          <div className="min-h-0 flex-1 overflow-auto">
            <OpportunitiesTable
              rows={underclassmen}
              applicationsByExternalId={applicationsByExternalId}
              deemphasized
            />
          </div>
        </TabsContent>

        <TabsContent
          value="benefits"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <StaleSyncBanner latestRow={syncBySource[TAB_SYNC_SOURCE.benefits]} />
          <div className="min-h-0 flex-1 overflow-auto">
            <BenefitsTable rows={benefits} />
          </div>
        </TabsContent>
      </DashboardTabs>
    </div>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="font-mono text-2xs text-muted-foreground">
      ({n.toLocaleString("en-US")})
    </span>
  );
}

/**
 * Tab labels surface the *active* count (the headline "what can I act on
 * today" number), while the table body underneath still renders every row,
 * active and inactive alike (DISC-03) — the count is a summary, not a filter.
 */
function countActive(rows: { isActive: boolean }[]): number {
  return rows.filter((row) => row.isActive).length;
}

type OpportunityRow = Awaited<ReturnType<typeof listOpportunities>>[number];

/**
 * Dense, native `<table>` shared by the Internships and Underclassmen tabs
 * (both read from `opportunities`, just a different `source`). Kept inline
 * rather than split into its own file since it has exactly two
 * near-identical callers — see 02-01-PLAN.md Task 3.
 */
function OpportunitiesTable({
  rows,
  applicationsByExternalId,
  deemphasized = false,
}: {
  rows: OpportunityRow[];
  applicationsByExternalId: Map<string, ApplicationRecord>;
  deemphasized?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className={stickyHeadClass}>
            Company
          </TableHead>
          <TableHead scope="col" className={stickyHeadClass}>
            Title
          </TableHead>
          <TableHead scope="col" className={stickyHeadClass}>
            Location
          </TableHead>
          <TableHead scope="col" className={stickyHeadClass}>
            Status
          </TableHead>
          <TableHead scope="col" className={stickyHeadClass}>
            Postulación
          </TableHead>
          <TableHead scope="col" className={`${stickyHeadClass} text-right`}>
            Link
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={6}
              className="py-10 text-center text-muted-foreground"
            >
              No se encontraron resultados con estos filtros.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.externalId}>
              <TableCell
                className={
                  deemphasized
                    ? "whitespace-normal text-muted-foreground"
                    : "font-medium whitespace-normal"
                }
              >
                {row.company ?? "—"}
              </TableCell>
              {/*
                `line-clamp-*` sets `display: -webkit-box`, which would
                break a `<td>`'s required `display: table-cell` — wrapped in
                an inner `<div>` instead so the cell itself stays a valid
                table participant. Caps runaway multi-value fields (e.g. an
                Underclassmen "category" data-quality outlier, or a
                multi-city Location list) from ballooning one row's height
                to 4-10x normal and breaking the dense-scan thesis — see
                02-03-SUMMARY.md "Deviations" for the measured mobile repro.
              */}
              <TableCell className="max-w-xs whitespace-normal">
                <div className="line-clamp-2">{row.title ?? "—"}</div>
              </TableCell>
              <TableCell className="max-w-40 whitespace-normal text-muted-foreground">
                <div className="line-clamp-2">{row.location ?? "—"}</div>
              </TableCell>
              <TableCell>
                <StatusPill isActive={row.isActive} />
              </TableCell>
              <TableCell>
                {/*
                  A row missing from `applicationsByExternalId` was never
                  tracked — defaults to "not_applied" ("por aplicar"), never
                  null/undefined (03-01-PLAN.md must_haves). Always keyed by
                  `externalId`, never the `opportunities` cache row's serial
                  `id` (research/ARCHITECTURE.md Anti-Pattern 2).
                */}
                <StatusDropdown
                  opportunityExternalId={row.externalId}
                  status={
                    applicationsByExternalId.get(row.externalId)?.status ??
                    "not_applied"
                  }
                />
              </TableCell>
              <TableCell className="text-right">
                {row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary underline underline-offset-4"
                  >
                    Ver fuente
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

type BenefitRow = Awaited<ReturnType<typeof listBenefits>>[number];

/**
 * Beneficios .edu tab (BENE-01): title, description, and every tag visible
 * per row without opening/expanding anything.
 */
function BenefitsTable({ rows }: { rows: BenefitRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className={stickyHeadClass}>
            Beneficio
          </TableHead>
          <TableHead scope="col" className={stickyHeadClass}>
            Descripción
          </TableHead>
          <TableHead scope="col" className={stickyHeadClass}>
            Tags
          </TableHead>
          <TableHead scope="col" className={stickyHeadClass}>
            Status
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell
              colSpan={4}
              className="py-10 text-center text-muted-foreground"
            >
              No se encontraron resultados con estos filtros.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => {
            const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
            return (
              <TableRow key={row.externalId}>
                <TableCell className="w-56 align-top font-medium whitespace-normal">
                  {row.title ?? "—"}
                </TableCell>
                <TableCell className="max-w-xl align-top whitespace-normal text-muted-foreground">
                  {row.description ?? "—"}
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <div className="flex flex-wrap gap-1">
                    {tags.length > 0 ? (
                      tags.map((tag) => (
                        <Badge key={tag} variant="outline">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="align-top">
                  <StatusPill isActive={row.isActive} />
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
