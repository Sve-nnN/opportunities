CREATE TABLE "application_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"opportunity_external_id" text NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"sent_fields" jsonb NOT NULL,
	"profile_updates" jsonb,
	"newly_learned_keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "application_history_opportunity_external_id_idx" ON "application_history" USING btree ("opportunity_external_id");