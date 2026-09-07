import {
  boolean,
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
  opportunityExternalId: text("opportunity_external_id").notNull(),
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
