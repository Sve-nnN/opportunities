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
  const inputRef = useRef<HTMLInputElement>(null);

  // Reflect external URL changes (e.g. tab switch resets `q`) into the input.
  useEffect(() => {
    setValue(urlQuery);
  }, [urlQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ⌘K/Ctrl+K summons the search field (direction contract OWN-WORLD:
  // "Command-palette affordance (⌘K-style search) as the primary entry to
  // filtering" — found missing from actual behavior during the finish-flow
  // review, 02-03-SUMMARY.md "Deviations": the input existed but nothing
  // bound the keyboard shortcut the contract named). Kept intentionally
  // minimal — focuses the always-visible input rather than opening a
  // separate overlay, so the "backed by always-visible filter chips for
  // discoverability" half of the same OWN-WORLD line isn't diluted by a
  // modal that hides them.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      if (!isShortcut) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
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
      // A new search term invalidates whatever page the previous
      // (unfiltered or differently-filtered) result set was on — always
      // land back on page 1 (04-05-PLAN.md).
      params.delete("page");
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
        ref={inputRef}
        id="dashboard-search"
        type="search"
        autoComplete="off"
        placeholder="Buscar…"
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        className="pl-8 pr-10"
      />
      {/*
        Discoverability hint for the ⌘K shortcut, matching the convention
        this direction's assigned world (Linear/Kanban dev tools) uses
        natively. aria-hidden — the input's own <label> already carries the
        accessible name; this is a sighted-user affordance only.
      */}
      <kbd
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border px-1 font-mono text-2xs text-muted-foreground"
      >
        ⌘K
      </kbd>
    </div>
  );
}
