"use client";

import { useState, useTransition } from "react";

import { saveProfileFields } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ProfileField } from "@/db/queries/profile";
import { cn } from "@/lib/utils";

type SaveState = "idle" | "saving" | "saved";

/**
 * "Perfil" tab (PROFILE-01/02, 05-CONTEXT.md): Juan's flexible key-value
 * profile grouped by category, editable inline (Task 2 adds the per-row
 * pencil popover), with an ad hoc "+ Agregar campo" flow and a bulk
 * "Cargar datos básicos" empty-state CTA (Task 3).
 */
export function ProfileTab({ fields }: { fields: ProfileField[] }) {
  const groups = groupByCategory(fields);
  const categories = distinctCategories(fields);

  if (fields.length === 0) {
    // Task 3 fills in the real empty-state heading/body/CTAs (UI-SPEC
    // "Empty state (zero fields)"). For now this renders an empty
    // container so page.tsx has something to wire the 4th tab against
    // (05-01-PLAN.md Task 1 done criteria).
    return (
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <AddFieldPopover categories={categories} />
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
            <span className="text-right whitespace-normal text-foreground">
              {row.value}
            </span>
            {/* Task 2 adds the trailing pencil edit-trigger icon button here. */}
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
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setSaveState("saving");
    startTransition(async () => {
      const result = await saveProfileFields([{ label, value, category }]);
      if (result.ok) {
        setSaveState("saved");
        // Popover stays open (UI-SPEC: "popover stays open after save so
        // Juan can add another field immediately") — only the inputs clear.
        setCategory("");
        setLabel("");
        setValue("");
      } else {
        console.error("[ProfileTab] failed to save field:", result.error);
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
      </PopoverContent>
    </Popover>
  );
}
