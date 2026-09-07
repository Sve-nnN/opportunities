import { ExternalLink } from "lucide-react";

import { StatusPill } from "@/components/dashboard/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listOpportunities } from "@/db/queries/opportunities";

// This dashboard has exactly one reader (Juan) and its data lives in
// Postgres, itself already the cache for the 2h GitHub sync (PRODUCT.md
// Operating Context) — there is nothing useful to statically prerender, and
// a stale build-time snapshot would defeat the "always reflects last sync"
// requirement (DISC-01). Always render this page per-request.
export const dynamic = "force-dynamic";

const stickyHeadClass = "sticky top-0 z-10 bg-card";

export default async function Home() {
  const internships = await listOpportunities("summer2027-internships");

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">
          Opportunities Hub
        </h1>
      </header>

      <Tabs defaultValue="internships" className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="border-b border-border px-4 py-2">
          <TabsList variant="line">
            <TabsTrigger value="internships">
              Internships{" "}
              <span className="font-mono text-2xs text-muted-foreground">
                ({internships.length.toLocaleString("en-US")})
              </span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="internships"
          className="min-h-0 flex-1 overflow-auto"
        >
          <OpportunitiesTable rows={internships} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type OpportunityRow = Awaited<ReturnType<typeof listOpportunities>>[number];

/**
 * Dense, native `<table>` shared by the Internships and Underclassmen tabs
 * (both read from `opportunities`, just a different `source`). Kept inline
 * rather than split into its own file since it currently has exactly one
 * near-identical caller (Task 3 adds the second) — see 02-01-PLAN.md Task 3.
 */
function OpportunitiesTable({ rows }: { rows: OpportunityRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={stickyHeadClass}>Company</TableHead>
          <TableHead className={stickyHeadClass}>Title</TableHead>
          <TableHead className={stickyHeadClass}>Location</TableHead>
          <TableHead className={stickyHeadClass}>Status</TableHead>
          <TableHead className={`${stickyHeadClass} text-right`}>Link</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.externalId}>
            <TableCell className="font-medium whitespace-normal">
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
