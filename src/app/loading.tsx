import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";

// Next.js App Router convention: automatically shown while page.tsx's async
// Server Component data fetch (the Promise.all of listOpportunities/
// listBenefits) is pending. This is the only loading state the dashboard
// ever shows — never a spinner (CONTEXT.md).
export default function Loading() {
  return <DashboardSkeleton />;
}
