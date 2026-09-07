"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ComponentProps } from "react";

import { Tabs } from "@/components/ui/tabs";

/**
 * Thin client wrapper around shadcn's `Tabs` that mirrors the active tab
 * into the `tab` URL search param. page.tsx (Server Component) needs to know
 * which tab is active server-side to decide which dataset receives the
 * search/filter params (CONTEXT.md: "buscador global arriba, aplica a la tab
 * activa") — plain Radix `defaultValue` state alone is client-only and
 * invisible to the server render.
 *
 * Switching tabs clears q/category/roleType/status: each tab has its own
 * filter vocabulary (Internships' categories aren't Underclassmen's), so
 * carrying a filter across tabs would silently produce a near-empty,
 * confusing view instead of the fresh full dataset the user expects.
 */
export function DashboardTabs({
  value,
  ...props
}: ComponentProps<typeof Tabs> & { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleValueChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "internships") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    params.delete("q");
    params.delete("category");
    params.delete("roleType");
    params.delete("status");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return <Tabs value={value} onValueChange={handleValueChange} {...props} />;
}
