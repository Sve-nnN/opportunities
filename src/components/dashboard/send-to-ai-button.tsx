"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";

import { generateApplyPrompt } from "@/app/actions/auto-apply";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

const AUTO_CLOSE_MS = 2000;

/**
 * The 3 terminal outcomes of a click, once the `generateApplyPrompt`
 * transition resolves (07-UI-SPEC.md "Click flow"). The 4th state
 * (`copying`) is deliberately NOT modeled here — `useTransition`'s
 * `isPending` stays true for the whole async transition body (same async
 * `startTransition` pattern already used by `StatusDropdown`), so it is the
 * single source of truth for "in flight," rather than a duplicate boolean
 * that could drift out of sync with it.
 */
type TerminalState =
  | { kind: "copied" }
  | { kind: "clipboard_failed"; prompt: string }
  | { kind: "config_error"; message: string };

/**
 * "Send to AI" per-row trigger (07-UI-SPEC.md "Interaction Pattern"):
 * `Tooltip`+`aria-label`-synced trigger, wrapping a **controlled** `Popover`
 * (`open`/`onOpenChange`, unlike `NotesPopover`'s uncontrolled default) that
 * opens the instant the click fires — its content follows the async
 * `generateApplyPrompt` transition through the 4 states below. Task 1's
 * `generateApplyPrompt` call + clipboard fallback logic is unchanged here;
 * only the presentation layer around it was rebuilt onto the controlled
 * `Popover`/`Tooltip` contract.
 */
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
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<TerminalState | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isReattempt = IN_PROGRESS_STATUSES.has(status);
  // 07-UI-SPEC.md "Trigger states": the disabled reason is folded into the
  // accessible name itself, not left for sighted-only tooltip discovery —
  // this same string drives both the `aria-label` and the Tooltip content.
  const ariaLabel = !url
    ? "Send to AI (sin link de aplicación)"
    : isReattempt
      ? "Reenviar prompt"
      : "Send to AI";

  // `copied` (success): auto-closes after 2000ms per 07-UI-SPEC.md — there
  // is nothing further for Juan to do or read once the clipboard write
  // resolved. `clipboard_failed`/`config_error` stay open; native Radix
  // Escape/click-outside close (via `onOpenChange` below) is the only exit,
  // same as `NotesPopover`.
  useEffect(() => {
    if (state?.kind !== "copied") return;
    const timer = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [state]);

  // Pre-select the fallback textarea's full contents on mount so Juan can
  // immediately Cmd/Ctrl+C without first clicking into it (07-UI-SPEC.md
  // "Click flow" state 3).
  useEffect(() => {
    if (state?.kind === "clipboard_failed") {
      textareaRef.current?.select();
    }
  }, [state]);

  function handleClick() {
    if (!url || isPending) return;
    setState(null);
    setOpen(true);
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
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
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
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>{ariaLabel}</TooltipContent>
      </Tooltip>
      {/*
        Escape-to-close + focus-return-to-trigger is Radix Popover's native
        behavior — not overridden here (same as NotesPopover).
      */}
      <PopoverContent
        align="start"
        className={state?.kind === "clipboard_failed" ? "w-96" : "w-80"}
      >
        {isPending ? (
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Copiando…
          </p>
        ) : state?.kind === "copied" ? (
          <p aria-live="polite" className="text-xs text-muted-foreground">
            Prompt copiado
          </p>
        ) : state?.kind === "clipboard_failed" ? (
          <>
            <p aria-live="polite" className="text-xs text-muted-foreground">
              No se pudo copiar automáticamente. Selecciona el texto y
              cópialo manualmente.
            </p>
            <Textarea
              ref={textareaRef}
              readOnly
              rows={12}
              className="font-mono text-xs"
              value={state.prompt}
            />
          </>
        ) : state?.kind === "config_error" ? (
          <div
            role="alert"
            className="flex items-center gap-2 text-xs text-destructive"
          >
            <TriangleAlert aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{state.message}</span>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
