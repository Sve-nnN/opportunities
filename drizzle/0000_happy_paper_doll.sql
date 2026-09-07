CREATE TABLE "applications" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_external_id" text NOT NULL,
	"status" text DEFAULT 'not_applied' NOT NULL,
	"notes" text,
	"is_saved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benefits" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"source" text DEFAULT 'student-benefits' NOT NULL,
	"title" text,
	"description" text,
	"image_src" text,
	"tags" jsonb,
	"campus_required" boolean,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benefits_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"source" text NOT NULL,
	"title" text,
	"company" text,
	"location" text,
	"category" text,
	"role_type" text,
	"url" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"posted_at" timestamp with time zone,
	"raw" jsonb,
	"last_seen_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"success" boolean,
	"rows_upserted" integer DEFAULT 0 NOT NULL,
	"rows_soft_deleted" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
