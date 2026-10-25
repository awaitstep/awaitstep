ALTER TABLE "api_keys" ADD COLUMN "parent_key_id" text;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_parent_key_id_api_keys_id_fk" FOREIGN KEY ("parent_key_id") REFERENCES "public"."api_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_api_keys_parent_key_id" ON "api_keys" USING btree ("parent_key_id");