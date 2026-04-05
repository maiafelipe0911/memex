ALTER TABLE "books" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "highlights" ADD COLUMN "type" text DEFAULT 'highlight' NOT NULL;--> statement-breakpoint
ALTER TABLE "highlights" ADD COLUMN "source" text DEFAULT 'kindle' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_digest_at" timestamp;