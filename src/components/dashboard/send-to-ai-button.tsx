"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";

import { generateApplyPrompt } from "@/app/actions/auto-apply";
import { Button } from "@/components/ui/button";
import type { ApplicationStatus } from "@/lib/application-status";

/**
 * The 2 read-only auto-apply intermediate states that mean "an external
 * session is already working this row" (07-UI-SPEC.md "Trigger states" —
 * EXACTLY these 2, never `submitted`, and never the full 3-value
 * `AUTO_APPLY_CALLBACK_STATUSES` tuple: once `submitted`, the row falls
 * back to the default "Send to AI" label since a fresh prompt would start a
 * new session, not resend the same one).
 */
const IN_PROGRESS_STATUSES = new Set<ApplicationStatus>([
  "auto_fill_in_progress",
  "ready_to_review",
]);

/**
 * Task 1 (07-02-PLAN.md) minimal-but-real shape: a plain `<div>` wrapping
 * the trigger button and whichever terminal-state feedback is active below
 * it — no `Popover`/`Tooltip` yet (Task 2 rewrites the presentation layer
 * onto `07-UI-SPEC.md`'s controlled-Popover contract without touching the
 * `generateApplyPrompt` call or clipboard logic established here).
 */
type ClickState =
  | { kind: "idle" }
  | { kind: "copied" }
  | { kind: "clipboard_failed"; prompt: string }
  | { kind: "config_error"; message: string };

export function SendToAiButton({
  opportunityExternalId,
  url,
  status,
  tabIndex,
}: {
  opportunityExternalId: string;
  url: string | null;
  status: ApplicationStatus;
  /**
   * Forwarded to the trigger button — same roving-tabindex contract as
   * `StatusDropdown`/`NotesPopover` (VirtualizedOpportunitiesTable).
   */
  tabIndex?: number;
}) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<ClickState>({ kind: "idle" });

  const isReattempt = IN_PROGRESS_STATUSES.has(status);
  // 07-UI-SPEC.md "Trigger states": the disabled reason is folded into the
  // accessible name itself, not left for sighted-only tooltip discovery.
  const ariaLabel = !url
    ? "Send to AI (sin link de aplicación)"
    : isReattempt
      ? "Reenviar prompt"
      : "Send to AI";

  function handleClick() {
    if (!url || isPending) return;
    startTransition(async () => {
      const result = await generateApplyPrompt(opportunityExternalId);
      if (!result.ok) {
        setState({ kind: "config_error", message: result.message });
        return;
      }
      try {
        // T-07-05/T-07-06 (threat_model): the prompt (secret embedded)
        // never leaves this local browser context — clipboard or, on
        // failure, a local-only selectable textarea fallback.
        await navigator.clipboard.writeText(result.prompt);
        setState({ kind: "copied" });
      } catch {
        setState({ kind: "clipboard_failed", prompt: result.prompt });
      }
    });
  }

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={ariaLabel}
        tabIndex={tabIndex}
        disabled={!url || isPending}
        className="size-8"
        onClick={handleClick}
      >
        <Sparkles aria-hidden="true" className="size-4" />
      </Button>
      {state.kind === "copied" && (
        <p aria-live="polite" className="text-xs text-muted-foreground">
          Prompt copiado
        </p>
      )}
      {state.kind === "clipboard_failed" && (
        <textarea
          readOnly
          value={state.prompt}
          className="mt-1 w-full text-xs"
          rows={8}
        />
      )}
      {state.kind === "config_error" && (
        <p role="alert" className="text-xs text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}
