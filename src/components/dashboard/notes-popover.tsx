"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { StickyNote } from "lucide-react";

import { updateApplicationNotes } from "@/app/actions/applications";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 500;

type SaveState = "idle" | "saving" | "saved";

/**
 * Per-row notes control (TRACK-02/03-CONTEXT.md "Notas"): an icon button
 * that opens a popover with a free-text textarea, autosaving on a ~500ms
 * debounce (same setTimeout+cleanup pattern as search-bar.tsx's 300ms
 * debounce, no new library) — never an explicit "Guardar" button.
 *
 * The icon itself distinguishes "has a note" from "empty" via fill vs.
 * outline (DESIGN.md Never-Color-Alone Rule: a shape difference, not just a
 * color difference), and the popover always also renders a text indicator
 * ("Guardado"/"Guardando…") rather than relying on an icon-only checkmark.
 */
export function NotesPopover({
  opportunityExternalId,
  notes,
  pathToRevalidate = "/",
  tabIndex,
}: {
  opportunityExternalId: string;
  notes: string | null;
  /** Defaults to "/" since this dashboard is a single page (03-01-PLAN.md). */
  pathToRevalidate?: string;
  /**
   * Forwarded to the trigger button - lets a roving-tabindex parent
   * (VirtualizedOpportunitiesTable, 03-02-PLAN.md Task 3) exclude this
   * control from the normal Tab sequence when its row isn't the currently
   * active one, so Tab enters the table exactly once instead of stepping
   * through every mounted row's controls.
   */
  tabIndex?: number;
}) {
  const [value, setValue] = useState(notes ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect a server-driven `notes` update (e.g. after revalidatePath from
  // another device/tab) back into local state, mirroring search-bar.tsx's
  // "external value changed" effect.
  useEffect(() => {
    setValue(notes ?? "");
  }, [notes]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleChange(next: string) {
    setValue(next);
    setSaveState("saving");

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const result = await updateApplicationNotes(
          opportunityExternalId,
          next,
          pathToRevalidate,
        );
        if (result.ok) {
          setSaveState("saved");
        } else {
          // Zod rejected the value (T-03-03, e.g. over the 2000-char limit)
          // or the write failed — surfaced to the console, same
          // no-toast-system convention as StatusDropdown's error handling.
          console.error(
            `[NotesPopover] failed to save notes for ${opportunityExternalId}:`,
            result.error,
          );
          setSaveState("idle");
        }
      });
    }, DEBOUNCE_MS);
  }

  const hasNotes = value.trim().length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={hasNotes ? "Ver/editar nota" : "Agregar nota"}
          tabIndex={tabIndex}
          className="size-8"
        >
          <StickyNote
            aria-hidden="true"
            className={cn("size-4", hasNotes && "fill-current")}
          />
        </Button>
      </PopoverTrigger>
      {/*
        Escape-to-close + focus-return-to-trigger is Radix Popover's native
        behavior — not overridden here, confirmed by not attaching any
        custom onEscapeKeyDown/onCloseAutoFocus handler (03-02-PLAN.md
        Task 2 "done" criterion).
      */}
      <PopoverContent align="start" className="w-80">
        <label
          htmlFor={`notes-${opportunityExternalId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Nota
        </label>
        <Textarea
          id={`notes-${opportunityExternalId}`}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          placeholder="Escribe una nota libre sobre esta oportunidad…"
          maxLength={2000}
          rows={4}
        />
        {/*
          Text indicator, never an icon-only checkmark (DESIGN.md
          Never-Color-Alone Rule) — "Guardando…" while the debounce/Server
          Action is in flight, "Guardado" once it resolves, nothing while
          idle (page just opened, no edits yet).
        */}
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {saveState === "saving" || isPending
            ? "Guardando…"
            : saveState === "saved"
              ? "Guardado"
              : " "}
        </p>
      </PopoverContent>
    </Popover>
  );
}
