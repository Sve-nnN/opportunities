import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Tailwind v4's `outline-none` here truly removes any outline (v4
        // semantics, unlike v3's invisible-but-forced-colors-visible
        // trick), so this component never gets the app-wide opaque
        // `:focus-visible` outline from globals.css — `focus-visible:ring-*`
        // (box-shadow) is its ONLY focus indicator. Verified against the
        // compiled CSS (`.focus-visible\:ring-ring\/50:focus-visible` sets
        // `--tw-ring-color: color-mix(in oklab, var(--ring) 50%,
        // transparent)`, deterministically, by cascade source order) and
        // confirmed 3x via real-keyboard-Tab Playwright measurement: 2.06:1
        // against this app's #0b0b0d background — below WCAG AA's 3:1 focus
        // indicator floor. Bumped to full-opacity `ring-ring` (measures
        // 4.99:1). See 02-03-SUMMARY.md "Deviations" for the full trail,
        // including the test-methodology pitfall that produced a false
        // "already passing" reading on the first measurement pass.
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
