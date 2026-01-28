import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"), // admin, manager, user
  isAuthorized: varchar("is_authorized").notNull().default("pending"), // pending, approved, rejected
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Authorized Users - Pre-approved emails that can register
export const authorizedUsers = pgTable("authorized_users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  phoneNumber: varchar("phone_number"),
  role: varchar("role").notNull().default("user"), // admin, manager, user
  addedBy: varchar("added_by"),
  addedByName: varchar("added_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuthorizedUserSchema = createInsertSchema(authorizedUsers).omit({ id: true, createdAt: true });
export type AuthorizedUser = typeof authorizedUsers.$inferSelect;
export type InsertAuthorizedUser = z.infer<typeof insertAuthorizedUserSchema>;
