"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Toggleable filter chips (direction contract: chips, never nested
 * dropdowns). One chip per distinct category/roleType value that actually
 * exists in the active tab's data (page.tsx computes these via
 * getDistinctCategories/getDistinctRoleTypes, 02-02-PLAN.md Task 1), plus two
 * fixed status chips. Each chip toggles the matching URL search param —
 * page.tsx (Server Component) reads it back and passes it into the query.
 */
export function FilterChips({
  categories,
  roleTypes,
}: {
  categories: string[];
  roleTypes: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const activeCategory = searchParams.get("category");
  const activeRoleType = searchParams.get("roleType");
  const activeStatus = searchParams.get("status");
  const hasActiveFilter = Boolean(
    searchParams.get("q") || activeCategory || activeRoleType || activeStatus,
  );

  function toggle(key: "category" | "roleType" | "status", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get(key) === value) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("category");
    params.delete("roleType");
    params.delete("status");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  if (categories.length === 0 && roleTypes.length === 0) {
    return null;
  }

  return (
    <div
      role="group"
      aria-label="Filtros"
      className="flex flex-wrap items-center gap-1.5"
    >
      <Chip
        pressed={activeStatus === "open"}
        onClick={() => toggle("status", "open")}
      >
        Abierto
      </Chip>
      <Chip
        pressed={activeStatus === "closed"}
        onClick={() => toggle("status", "closed")}
      >
        Cerrado
      </Chip>

      {categories.map((category) => (
        <Chip
          key={`category-${category}`}
          pressed={activeCategory === category}
          onClick={() => toggle("category", category)}
        >
          {category}
        </Chip>
      ))}

      {roleTypes.map((roleType) => (
        <Chip
          key={`roleType-${roleType}`}
          pressed={activeRoleType === roleType}
          onClick={() => toggle("roleType", roleType)}
        >
          {roleType}
        </Chip>
      ))}

      {hasActiveFilter ? (
        <button
          type="button"
          onClick={clearAll}
          className="rounded-full px-2 py-1 text-xs font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Limpiar filtros
        </button>
      ) : null}
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        pressed
          ? "border-primary bg-primary/15 text-foreground"
          : "border-border bg-transparent text-muted-foreground hover:border-input hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
