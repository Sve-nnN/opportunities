import { ExternalLink } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listBenefits } from "@/db/queries/benefits";
import { listOpportunities } from "@/db/queries/opportunities";

// This dashboard has exactly one reader (Juan) and its data lives in
// Postgres, itself already the cache for the 2h GitHub sync (PRODUCT.md
// Operating Context) — there is nothing useful to statically prerender, and
// a stale build-time snapshot would defeat the "always reflects last sync"
// requirement (DISC-01). Always render this page per-request.
export const dynamic = "force-dynamic";

const stickyHeadClass = "sticky top-0 z-10 bg-card";

export default async function Home() {
  const [internships, underclassmen, benefits] = await Promise.all([
    listOpportunities("summer2027-internships"),
    listOpportunities("underclassmen-opportunities"),
    listBenefits(),
  ]);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">
          Opportunities Hub
        </h1>
      </header>

      <Tabs
        defaultValue="internships"
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="border-b border-border px-4 py-2">
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
        </div>

        <TabsContent
          value="internships"
          className="min-h-0 flex-1 overflow-auto"
        >
          <OpportunitiesTable rows={internships} />
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
          className="min-h-0 flex-1 overflow-auto"
        >
          <OpportunitiesTable rows={underclassmen} deemphasized />
        </TabsContent>

        <TabsContent value="benefits" className="min-h-0 flex-1 overflow-auto">
          <BenefitsTable rows={benefits} />
        </TabsContent>
      </Tabs>
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
  deemphasized = false,
}: {
  rows: OpportunityRow[];
  deemphasized?: boolean;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={stickyHeadClass}>Company</TableHead>
          <TableHead className={stickyHeadClass}>Title</TableHead>
          <TableHead className={stickyHeadClass}>Location</TableHead>
          <TableHead className={stickyHeadClass}>Status</TableHead>
          <TableHead className={`${stickyHeadClass} text-right`}>
            Link
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
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
            <TableCell className="whitespace-normal">
              {row.title ?? "—"}
            </TableCell>
            <TableCell className="text-muted-foreground whitespace-normal">
              {row.location ?? "—"}
            </TableCell>
            <TableCell>
              <StatusPill isActive={row.isActive} />
            </TableCell>
            <TableCell className="text-right">
              {row.url ? (
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:underline"
                >
                  Ver fuente
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          </TableRow>
        ))}
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
          <TableHead className={stickyHeadClass}>Beneficio</TableHead>
          <TableHead className={stickyHeadClass}>Descripción</TableHead>
          <TableHead className={stickyHeadClass}>Tags</TableHead>
          <TableHead className={stickyHeadClass}>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
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
        })}
      </TableBody>
    </Table>
  );
}
