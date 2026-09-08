"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Pencil } from "lucide-react";

import { saveProfileFields, updateProfileFieldValue } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ProfileField } from "@/db/queries/profile";
import { cn } from "@/lib/utils";

// Same debounce constant as NotesPopover (03-02-PLAN.md) — replicated
// exactly, per UI-SPEC "Interaction Pattern" instruction to match
// NotesPopover's autosave shape verbatim.
const DEBOUNCE_MS = 500;

type SaveState = "idle" | "saving" | "saved";

/**
 * 05-REVIEW.md CR-01: `normalizeToKey` is not injective, so a submitted
 * label can silently collide onto the `key` of a different pre-existing
 * label (e.g. "LinkedIn" and "linkedin" both become `key = "linkedin"`),
 * overwriting that row's value/category. `saveProfileFields` now reports
 * this back as `result.collisions`; render it as a visible alert (icon +
 * text, never color alone per A11Y.md) instead of the plain "Guardado"
 * text so Juan knows an overwrite — not a fresh insert — just happened.
 */
function CollisionWarning({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-foreground"
    >
      <AlertTriangle
        aria-hidden="true"
        className="mt-0.5 size-3.5 shrink-0 text-destructive"
      />
      <span>{message}</span>
    </div>
  );
}

/**
 * "Perfil" tab (PROFILE-01/02, 05-CONTEXT.md): Juan's flexible key-value
 * profile grouped by category, editable inline (per-row pencil popover),
 * with an ad hoc "+ Agregar campo" flow and a bulk "Cargar datos básicos"
 * empty-state CTA.
 */
export function ProfileTab({ fields }: { fields: ProfileField[] }) {
  const groups = groupByCategory(fields);
  const categories = distinctCategories(fields);

  if (fields.length === 0) {
    // UI-SPEC "Empty state (zero fields)": same py-10 text-center
    // text-muted-foreground convention already shipped in
    // virtualized-opportunities-table.tsx, extended with a heading + both
    // CTAs — Juan is never forced through the 6-field bulk form if he only
    // wants one ad hoc field.
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="py-10 text-center">
          <p className="font-medium text-foreground">Tu perfil está vacío</p>
          <p className="mt-1 text-muted-foreground">
            Carga tus datos básicos para que las postulaciones asistidas por
            IA puedan usarlos, o agrega un campo a mano.
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <BulkLoadPopover />
            <AddFieldPopover categories={categories} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <div className="flex flex-col gap-8">
        {groups.map(([category, rows]) => (
          <CategoryGroup key={category} category={category} rows={rows} />
        ))}
      </div>
      <div className="mt-6">
        <AddFieldPopover categories={categories} />
      </div>
    </div>
  );
}

/**
 * Groups the already-`createdAt`-ordered `fields` array by `category` in
 * first-appearance order (single pass, per UI-SPEC "render groups in the
 * order categories were first created").
 */
function groupByCategory(
  fields: ProfileField[],
): [string, ProfileField[]][] {
  const map = new Map<string, ProfileField[]>();
  for (const field of fields) {
    const existing = map.get(field.category);
    if (existing) {
      existing.push(field);
    } else {
      map.set(field.category, [field]);
    }
  }
  return Array.from(map.entries());
}

function distinctCategories(fields: ProfileField[]): string[] {
  return Array.from(new Set(fields.map((field) => field.category)));
}

function CategoryGroup({
  category,
  rows,
}: {
  category: string;
  rows: ProfileField[];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-sm font-medium text-muted-foreground">
        {category}
      </h3>
      <div className="mt-2 flex flex-col">
        {rows.map((row, index) => (
          <div
            key={row.key}
            className={cn(
              "flex items-center justify-between gap-4 py-2",
              index < rows.length - 1 && "border-b border-border",
            )}
          >
            <span className="text-foreground">{row.label}</span>
            <div className="flex items-center gap-2">
              <span className="text-right whitespace-normal text-foreground">
                {row.value}
              </span>
              <EditFieldPopover field={row} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * "+ Agregar campo" (UI-SPEC "Interaction Pattern"): a persistent outline
 * button that opens a 3-field popover (Categoría/Etiqueta/Valor). Unlike
 * the per-row edit popover, this is NOT autosave-per-keystroke — the three
 * fields must land together as one row, so a single "Guardar" button
 * submits all three. `key` is never typed by Juan; it is derived
 * server-side from `label` inside `saveProfileFields`.
 */
function AddFieldPopover({ categories }: { categories: string[] }) {
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [collisionWarning, setCollisionWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaveState("saving");
    setCollisionWarning(null);
    startTransition(async () => {
      try {
        const result = await saveProfileFields([{ label, value, category }]);
        if (result.ok) {
          setSaveState("saved");
          if (result.collisions && result.collisions.length > 0) {
            const { existingLabel } = result.collisions[0];
            setCollisionWarning(
              `"${label}" usa la misma clave interna que "${existingLabel}" y sobrescribió su valor.`,
            );
          }
          // Popover stays open (UI-SPEC: "popover stays open after save so
          // Juan can add another field immediately") — only the inputs clear.
          setCategory("");
          setLabel("");
          setValue("");
        } else {
          console.error("[ProfileTab] failed to save field:", result.error);
          setSaveState("idle");
        }
      } catch (err) {
        // 05-REVIEW.md WR-04: a thrown error (DB connection drop, timeout)
        // rejects the Server Action promise instead of returning
        // { ok: false } — without this catch, "Guardando…" would stay
        // stuck forever with only a generic unhandled-rejection console
        // entry and no recovery path.
        console.error("[ProfileTab] unexpected error saving field:", err);
        setSaveState("idle");
      }
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          + Agregar campo
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <label
          htmlFor="add-field-category"
          className="text-xs font-medium text-muted-foreground"
        >
          Categoría
        </label>
        <Input
          id="add-field-category"
          list="profile-categories"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="contacto, links…"
        />
        <datalist id="profile-categories">
          {categories.map((existingCategory) => (
            <option key={existingCategory} value={existingCategory} />
          ))}
        </datalist>

        <label
          htmlFor="add-field-label"
          className="text-xs font-medium text-muted-foreground"
        >
          Etiqueta
        </label>
        <Input
          id="add-field-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Nombre completo"
        />

        <label
          htmlFor="add-field-value"
          className="text-xs font-medium text-muted-foreground"
        >
          Valor
        </label>
        <Input
          id="add-field-value"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Juan Pérez"
        />

        <Button
          type="button"
          onClick={handleSave}
          disabled={
            isPending ||
            category.trim().length === 0 ||
            label.trim().length === 0 ||
            value.trim().length === 0
          }
        >
          Guardar
        </Button>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {saveState === "saving" || isPending
            ? "Guardando…"
            : saveState === "saved"
              ? "Guardado"
              : " "}
        </p>
        {collisionWarning && <CollisionWarning message={collisionWarning} />}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Per-row pencil-edit popover (UI-SPEC "Interaction Pattern — Edit existing
 * field (per-row)"): a single-line `Input` bound to local state, autosaving
 * on the same 500ms debounce / `SaveState` union / `aria-live` text-row
 * shape as `NotesPopover` — replicated field-for-field, per UI-SPEC's
 * explicit instruction to match that component's autosave pattern exactly.
 * No delete affordance in this row (UI-SPEC: "no delete/destructive action
 * is in scope").
 */
function EditFieldPopover({ field }: { field: ProfileField }) {
  const [value, setValue] = useState(field.value);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reflect a server-driven `value` update (e.g. after revalidatePath from
  // another device/tab) back into local state, mirroring NotesPopover.
  useEffect(() => {
    setValue(field.value);
  }, [field.value]);

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
        try {
          const result = await updateProfileFieldValue(field.key, next);
          if (result.ok) {
            setSaveState("saved");
          } else {
            // Zod rejected the value or the write failed — surfaced to the
            // console, same no-toast-system convention as NotesPopover/
            // StatusDropdown (no visible error banner in this codebase yet).
            console.error(
              `[EditFieldPopover] failed to save value for ${field.key}:`,
              result.error,
            );
            // 05-REVIEW.md WR-01: revert to the last-known-good value
            // instead of leaving the rejected/whitespace-only text
            // displayed with no visible indication the write never landed
            // — e.g. clearing a field is rejected by valueSchema's
            // .min(1), so without this the input would silently show
            // blank while the DB still holds the old value until a full
            // page reload re-syncs it.
            setValue(field.value);
            setSaveState("idle");
          }
        } catch (err) {
          // 05-REVIEW.md WR-04: a thrown error (DB connection drop,
          // timeout) rejects the promise instead of returning
          // { ok: false } — without this catch, "Guardando…" would stay
          // stuck forever with no recovery path.
          console.error(
            `[EditFieldPopover] unexpected error saving value for ${field.key}:`,
            err,
          );
          setValue(field.value);
          setSaveState("idle");
        }
      });
    }, DEBOUNCE_MS);
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Editar ${field.label}`}
          className="size-8"
        >
          <Pencil aria-hidden="true" className="size-4" />
        </Button>
      </PopoverTrigger>
      {/*
        Escape-to-close + focus-return-to-trigger is Radix Popover's native
        behavior — not overridden here (same as NotesPopover).
      */}
      <PopoverContent align="start" className="w-80">
        <label
          htmlFor={`profile-field-${field.key}`}
          className="text-xs font-medium text-muted-foreground"
        >
          {field.label}
        </label>
        <Input
          id={`profile-field-${field.key}`}
          value={value}
          onChange={(event) => handleChange(event.target.value)}
          maxLength={2000}
        />
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {saveState === "saving" || isPending
            ? "Guardando…"
            : saveState === "saved"
              ? "Guardado"
              : " "}
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The 6 PROFILE-02 seed fields, exact list per 05-CONTEXT.md "Modelo de
 * datos del perfil" — pre-seeded label+category pairs for the "Cargar datos
 * básicos" bulk-load popover. `value` starts empty; Juan fills in whichever
 * subset he wants.
 */
const BULK_LOAD_SEED_FIELDS: { label: string; category: string }[] = [
  { label: "Nombre completo", category: "contacto" },
  { label: "Email", category: "contacto" },
  { label: "Teléfono", category: "contacto" },
  { label: "Link CV/resume", category: "links" },
  { label: "LinkedIn", category: "links" },
  { label: "GitHub", category: "links" },
];

/**
 * "Cargar datos básicos" (UI-SPEC "Interaction Pattern" + empty-state
 * primary CTA): 6 pre-seeded label/category pairs, any subset may be left
 * blank. Unlike `AddFieldPopover`, this is a one-time bulk action — it
 * closes on a successful save instead of staying open for repeat adds.
 */
function BulkLoadPopover() {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<string[]>(
    () => BULK_LOAD_SEED_FIELDS.map(() => ""),
  );
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [collisionWarning, setCollisionWarning] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleValueChange(index: number, next: string) {
    setValues((current) => {
      const updated = [...current];
      updated[index] = next;
      return updated;
    });
  }

  function handleSave() {
    // Client-side filter: only non-empty (post-trim) fields are sent. The
    // Server Action independently re-validates/drops empty entries too
    // (defense in depth per saveProfileFields' own docs) — this is not the
    // only guardrail, just the one that skips a pointless network write.
    const entries = BULK_LOAD_SEED_FIELDS.map((seed, index) => ({
      label: seed.label,
      category: seed.category,
      value: values[index],
    })).filter((entry) => entry.value.trim().length > 0);

    if (entries.length === 0) {
      return;
    }

    setSaveState("saving");
    setCollisionWarning(null);
    startTransition(async () => {
      try {
        const result = await saveProfileFields(entries);
        if (result.ok) {
          setSaveState("saved");
          setValues(BULK_LOAD_SEED_FIELDS.map(() => ""));
          if (result.collisions && result.collisions.length > 0) {
            // 05-REVIEW.md CR-01: at least one seed label collided onto an
            // existing row with a different label and overwrote it — keep
            // the popover open so Juan actually sees the warning instead
            // of auto-closing on a silent overwrite (unlike the normal
            // "closes on success" bulk-load behavior).
            const names = result.collisions
              .map((c) => `"${c.label}" → "${c.existingLabel}"`)
              .join(", ");
            setCollisionWarning(
              `${result.collisions.length} campo(s) sobrescribieron uno existente: ${names}.`,
            );
          } else {
            // Closes on success (UI-SPEC: "this is a one-time bulk action,
            // not a repeat-and-add flow") — unlike AddFieldPopover.
            setOpen(false);
          }
        } else {
          console.error("[BulkLoadPopover] failed to save fields:", result.error);
          setSaveState("idle");
        }
      } catch (err) {
        // 05-REVIEW.md WR-04: a thrown error (DB connection drop, timeout)
        // rejects the promise instead of returning { ok: false } —
        // without this catch, "Guardando…" would stay stuck forever with
        // no recovery path.
        console.error("[BulkLoadPopover] unexpected error saving fields:", err);
        setSaveState("idle");
      }
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="default">
          Cargar datos básicos
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        {BULK_LOAD_SEED_FIELDS.map((seed, index) => (
          <div key={seed.label}>
            <label
              htmlFor={`bulk-load-${index}`}
              className="text-xs font-medium text-muted-foreground"
            >
              {seed.label}
            </label>
            <Input
              id={`bulk-load-${index}`}
              value={values[index]}
              onChange={(event) => handleValueChange(index, event.target.value)}
            />
          </div>
        ))}

        <Button
          type="button"
          onClick={handleSave}
          disabled={
            isPending || values.every((value) => value.trim().length === 0)
          }
        >
          Guardar
        </Button>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {saveState === "saving" || isPending
            ? "Guardando…"
            : saveState === "saved"
              ? "Guardado"
              : " "}
        </p>
        {collisionWarning && <CollisionWarning message={collisionWarning} />}
      </PopoverContent>
    </Popover>
  );
}
