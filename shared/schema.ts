import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

// Projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  location: text("location").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("planning"), // planning, active, completed, on_hold
  color: text("color").notNull().default("#3b82f6"),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

// Tasks
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(), // Foreign key to projects.id (enforce in app logic for now)
  title: text("title").notNull(),
  description: text("description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status").notNull().default("pending"), // pending, in_progress, completed, blocked
  priority: text("priority").notNull().default("medium"), // low, medium, high
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true });
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// Equipment
export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // excavator, dozer, crane, truck, tool
  status: text("status").notNull().default("available"), // available, in_use, maintenance, repair
  notes: text("notes"),
});

export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true });
export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;

// Allocations (Resource assignments to tasks)
export const allocations = pgTable("allocations", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  resourceId: text("resource_id").notNull(), // Could be userId (string) or equipmentId (number -> string)
  resourceType: text("resource_type").notNull(), // 'user' or 'equipment'
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
});

export const insertAllocationSchema = createInsertSchema(allocations).omit({ id: true });
export type Allocation = typeof allocations.$inferSelect;
export type InsertAllocation = z.infer<typeof insertAllocationSchema>;

// Folders
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  parentId: integer("parent_id"), // Self-reference for subfolders
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFolderSchema = createInsertSchema(folders).omit({ id: true, createdAt: true });
export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;

// Files
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  folderId: integer("folder_id"),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(), // Path in storage
  contentType: text("content_type"),
  size: integer("size"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFileSchema = createInsertSchema(files).omit({ id: true, createdAt: true });
export type FileMetadata = typeof files.$inferSelect;
export type InsertFileMetadata = z.infer<typeof insertFileSchema>;
