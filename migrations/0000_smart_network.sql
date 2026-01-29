CREATE TABLE "allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer,
	"project_id" integer,
	"equipment_id" integer,
	"crew_member" text,
	"allocation_type" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"project_id" integer,
	"type" text NOT NULL,
	"subject" text,
	"notes" text NOT NULL,
	"contact_date" timestamp NOT NULL,
	"follow_up_date" date,
	"created_by" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"company" text,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "daily_report_delivery_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"vendor" text,
	"delivery_time" text,
	"description" text,
	"all_delivered" boolean DEFAULT true,
	"missing_items_details" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "daily_report_equipment_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_entry_id" integer NOT NULL,
	"equipment_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"hours" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "daily_report_labor_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_entry_id" integer NOT NULL,
	"labor_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"hours" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "daily_report_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer,
	"task_entry_id" integer,
	"delivery_entry_id" integer,
	"url" text NOT NULL,
	"caption" text,
	"taken_at" timestamp,
	"created_by" text,
	"created_by_name" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "daily_report_task_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"task_title_snapshot" text NOT NULL,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"comments" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "daily_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"report_date" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"weather_summary" text,
	"temperature" text,
	"temperature_high" text,
	"temperature_low" text,
	"wind_speed" text,
	"weather_icon" text,
	"weather_fetched_at" timestamp,
	"notes" text,
	"signature_type" text,
	"signature_value" text,
	"created_by" text,
	"created_by_name" text,
	"updated_by" text,
	"updated_by_name" text,
	"completed_at" timestamp,
	"completed_by" text,
	"completed_by_name" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"vendor" text NOT NULL,
	"delivery_time" text,
	"description" text,
	"all_items_delivered" boolean DEFAULT true,
	"missing_items_details" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"make" text,
	"model" text,
	"year" integer,
	"serial_number" text,
	"status" text DEFAULT 'available' NOT NULL,
	"current_location" text,
	"assigned_project_id" integer,
	"notes" text,
	"last_service_date" date,
	"next_service_date" date,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "equipment_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_task_id" integer NOT NULL,
	"equipment_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"hours" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"folder_id" integer,
	"album_id" integer,
	"name" text NOT NULL,
	"object_path" text NOT NULL,
	"content_type" text,
	"size" integer,
	"taken_at" timestamp,
	"tags" text[],
	"starred" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"parent_id" integer,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "labor_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_task_id" integer NOT NULL,
	"labor_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"hours" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "maintenance_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipment_id" integer NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"cost" integer,
	"performed_by" text,
	"performed_date" date NOT NULL,
	"next_due_date" date,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "photo_albums" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"album_id" integer,
	"name" text NOT NULL,
	"object_path" text NOT NULL,
	"content_type" text,
	"size" integer,
	"taken_at" timestamp,
	"display_date" timestamp DEFAULT now() NOT NULL,
	"thumbnail_path" text,
	"medium_path" text,
	"blur_hash" text,
	"width" integer,
	"height" integer,
	"processing_status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_number" text,
	"customer_id" integer,
	"name" text NOT NULL,
	"description" text,
	"street_address" text,
	"city" text,
	"state" text,
	"zip" text,
	"location" text,
	"start_date" date,
	"end_date" date,
	"status" text DEFAULT 'new' NOT NULL,
	"estimated_value" integer,
	"notes" text,
	"color" text DEFAULT '#f97316' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "report_task_photos" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_task_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "report_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"report_id" integer NOT NULL,
	"task_id" integer NOT NULL,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"comments" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_status_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"previous_status" text,
	"new_status" text,
	"previous_percent_complete" integer,
	"new_percent_complete" integer,
	"changed_by_user_id" text NOT NULL,
	"changed_by_name" text NOT NULL,
	"changed_at" timestamp DEFAULT now(),
	"source" text DEFAULT 'task',
	"daily_report_id" integer
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"scheduled_date" date,
	"due_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"estimated_hours" integer,
	"assigned_to" text,
	"created_at" timestamp DEFAULT now(),
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "authorized_users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar NOT NULL,
	"first_name" varchar,
	"last_name" varchar,
	"phone_number" varchar,
	"role" varchar DEFAULT 'user' NOT NULL,
	"added_by" varchar,
	"added_by_name" varchar,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "authorized_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" varchar DEFAULT 'user' NOT NULL,
	"is_authorized" varchar DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");