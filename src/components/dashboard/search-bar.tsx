"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";

const DEBOUNCE_MS = 300;

/**
 * Command-palette-style global search (direction contract, FIRST VIEWPORT).
 * Applies to whichever tab is active (page.tsx only forwards `q` into the
 * active tab's query) — see dashboard-tabs.tsx for how "active tab" is
 * tracked in the URL.
 *
 * Debounced 300ms before touching the URL (T-02-03: never a DB round trip
 * per keystroke). `router.replace` (not `push`) so rapid typing doesn't
 * flood the browser history, and `scroll: false` so the table doesn't jump.
 */
export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";

  const [value, setValue] = useState(urlQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect external URL changes (e.g. tab switch resets `q`) into the input.
  useEffect(() => {
    setValue(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(next: string) {
    setValue(next);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.trim()) {
        params.set("q", next);
      } else {
        params.delete("q");
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    }, DEBOUNCE_MS);
  }

  return (
    <div className="relative w-full max-w-md">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <label htmlFor="dashboard-search" className="sr-only">
        Buscar por título, empresa u organización
      </label>
      <Input
        id="dashboard-search"
        type="search"
        autoComplete="off"
        placeholder="Buscar…"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className="pl-8"
      />
    </div>
  );
}
