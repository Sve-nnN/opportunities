import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Cache table for internship/industry-program listings, sourced from
 * SimplifyJobs/Summer2027-Internships and underclassmen-opportunities.
 *
 * `external_id` is a stable, content-derived hash (never the serial `id`) so
 * that `applications.opportunity_external_id` never breaks across re-syncs.
 * See research/ARCHITECTURE.md Anti-Pattern 2.
 */
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  // 'summer2027-internships' | 'underclassmen-opportunities'
  source: text("source").notNull(),
  title: text("title"),
  company: text("company"),
  location: text("location"),
  category: text("category"),
  roleType: text("role_type"),
  url: text("url"),
  isActive: boolean("is_active").notNull().default(true),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  // Original parsed row, kept for debugging upstream drift.
  raw: jsonb("raw"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Cache table for student-benefits.json entries (discounts/perks via .edu
 * email). Simplest source: JSON.parse, no markdown table parsing.
 */
export const benefits = pgTable("benefits", {
  id: serial("id").primaryKey(),
  externalId: text("external_id").notNull().unique(),
  source: text("source").notNull().default("student-benefits"),
  title: text("title"),
  description: text("description"),
  imageSrc: text("image_src"),
  // Array of strings, stored as JSONB since Postgres has no native string[]
  // Drizzle helper without pgArray boilerplate.
  tags: jsonb("tags"),
  campusRequired: boolean("campus_required"),
  isActive: boolean("is_active").notNull().default(true),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Juan's own application-tracking state. Schema-only in Phase 1 — Phase 3
 * builds the CRUD. References opportunities/benefits by `external_id` VALUE,
 * never a foreign key to a serial `id` (research/ARCHITECTURE.md
 * Anti-Pattern 2) so tracked applications survive cache-row churn on sync.
 */
export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  // UNIQUE so `onConflictDoUpdate({ target: applications.opportunityExternalId })`
  // has a real constraint to upsert against — added in this phase's migration
  // (0001_*, see drizzle/), column already existed schema-only since Phase 1.
  opportunityExternalId: text("opportunity_external_id").notNull().unique(),
  status: text("status").notNull().default("not_applied"),
  notes: text("notes"),
  isSaved: boolean("is_saved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Juan's flexible key-value profile (PROFILE-01/02, Phase 5), EAV pattern
 * per research/STACK.md — no rigid schema, so both Juan (manual add/edit)
 * and the future Phase 6 callback (`source: 'ai_session'`) can write rows
 * without a migration per new field.
 *
 * `key` is the UNIQUE upsert target (never the serial `id`, same convention
 * as `applications.opportunityExternalId`) and is ALWAYS derived server-side
 * via `normalizeToKey(label)` (src/lib/profile-key.ts) — no Server Action in
 * this codebase accepts a client-provided `key` (05-01-PLAN.md threat_model
 * T-05-01). `label` is the human-readable text shown in the UI; `category`
 * is free-text used only to group rows visually ("contacto", "links", etc).
 * `source` defaults to 'manual' (this phase); Phase 6's callback will write
 * 'ai_session' onto this same table, no additional migration needed. Last
 * write wins on conflict — CONTEXT.md: "sin versionado/historial de cambios
 * de perfil."
 */
export const profileFields = pgTable("profile_fields", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  value: text("value").notNull(),
  category: text("category").notNull(),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Auditable log of every `POST /api/applications/[externalId]/apply-session`
 * callback call (Phase 6, CALLBACK-01/02, AUDIT-01/02). One NEW row per
 * call — unlike `applications`/`profileFields`, this table is deliberately
 * NOT unique on `opportunityExternalId`, since a single application can
 * receive multiple auto-apply callback calls over its lifetime (session
 * starts, pauses, resumes, finishes) and every one of them must remain
 * visible, not just the latest (06-CONTEXT.md: "Una fila nueva por cada
 * llamada al endpoint").
 *
 * `opportunityExternalId` references `opportunities.externalId` by VALUE,
 * never the serial `id` — same anti-pattern rule `applications` already
 * follows (research/ARCHITECTURE.md Anti-Pattern 2).
 *
 * `sentFields` is the `{key,label,value}[]` array exactly as received in
 * the callback body, unmodified — a snapshot of what that specific session
 * reported sending to the site, independent of whatever `profileFields`
 * looks like today or later (06-CONTEXT.md: "sentFields se guarda tal
 * cual"). `profileUpdates` is the raw `{label,value,category}[]` the
 * caller submitted (nullable — not every session learns new fields).
 * `newlyLearnedKeys` is computed server-side inside the route's
 * transaction (never trusted from the client) by diffing each
 * `profileUpdates` entry's derived key against whether a `profile_fields`
 * row already existed for it.
 */
export const applicationHistory = pgTable(
  "application_history",
  {
    id: serial("id").primaryKey(),
    opportunityExternalId: text("opportunity_external_id").notNull(),
    // The auto-apply status reported in this specific call — one of
    // AUTO_APPLY_CALLBACK_STATUSES (src/lib/application-status.ts), stored
    // as free text here for the same zero-migration reason `applications.status`
    // is free text.
    status: text("status").notNull(),
    notes: text("notes"),
    sentFields: jsonb("sent_fields").notNull(),
    profileUpdates: jsonb("profile_updates"),
    newlyLearnedKeys: jsonb("newly_learned_keys").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("application_history_opportunity_external_id_idx").on(
      table.opportunityExternalId,
    ),
  ],
);

/**
 * Records every sync run (scheduled or manual) per source, so a silently
 * failing/empty sync is always traceable instead of just serving stale data
 * forever (research/PITFALLS.md Pitfall 3 / UX Pitfall).
 */
export const syncLog = pgTable("sync_log", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  // null while running, true/false once finished.
  success: boolean("success"),
  rowsUpserted: integer("rows_upserted").notNull().default(0),
  rowsSoftDeleted: integer("rows_soft_deleted").notNull().default(0),
  errorMessage: text("error_message"),
});
