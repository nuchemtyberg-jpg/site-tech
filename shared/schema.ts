import { pgTable, text, serial, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";

export * from "./models/auth";

// Customers
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  company: text("company"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true });
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

// Projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  projectNumber: text("project_number"),
  customerId: integer("customer_id"),
  name: text("name").notNull(),
  description: text("description"),
  streetAddress: text("street_address"),
  city: text("city"),
  state: text("state"),
  location: text("location"), // kept for backward compatibility
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: text("status").notNull().default("new"), // new, bidding, takeoff_done, proposal_sent, active, completed, bid_lost, archive
  estimatedValue: integer("estimated_value"),
  notes: text("notes"),
  color: text("color").notNull().default("#f97316"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, projectNumber: true, createdAt: true });
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

// Tasks
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  scheduledDate: date("scheduled_date"),
  dueDate: date("due_date"),
  status: text("status").notNull().default("pending"), // pending, scheduled, in_progress, completed, blocked
  priority: text("priority").notNull().default("medium"), // low, medium, high, urgent
  estimatedHours: integer("estimated_hours"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// Equipment
export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // excavator, dozer, loader, truck, trailer, compactor, grader, skid_steer, other
  make: text("make"),
  model: text("model"),
  year: integer("year"),
  serialNumber: text("serial_number"),
  status: text("status").notNull().default("available"), // available, in_use, maintenance, repair, out_of_service
  currentLocation: text("current_location"),
  assignedProjectId: integer("assigned_project_id"),
  notes: text("notes"),
  lastServiceDate: date("last_service_date"),
  nextServiceDate: date("next_service_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true, createdAt: true });
export type Equipment = typeof equipment.$inferSelect;
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;

// Equipment Maintenance Logs
export const maintenanceLogs = pgTable("maintenance_logs", {
  id: serial("id").primaryKey(),
  equipmentId: integer("equipment_id").notNull(),
  type: text("type").notNull(), // routine, repair, inspection, service
  description: text("description").notNull(),
  cost: integer("cost"),
  performedBy: text("performed_by"),
  performedDate: date("performed_date").notNull(),
  nextDueDate: date("next_due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMaintenanceLogSchema = createInsertSchema(maintenanceLogs).omit({ id: true, createdAt: true });
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect;
export type InsertMaintenanceLog = z.infer<typeof insertMaintenanceLogSchema>;

// Daily Reports
export const dailyReports = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  reportDate: date("report_date").notNull(),
  weather: text("weather"),
  temperature: text("temperature"),
  crewCount: integer("crew_count"),
  workPerformed: text("work_performed"),
  materialsUsed: text("materials_used"),
  equipmentUsed: text("equipment_used"),
  visitorsOnSite: text("visitors_on_site"),
  delays: text("delays"),
  safetyIncidents: text("safety_incidents"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDailyReportSchema = createInsertSchema(dailyReports).omit({ id: true, createdAt: true });
export type DailyReport = typeof dailyReports.$inferSelect;
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;

// Customer Communications
export const communications = pgTable("communications", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  projectId: integer("project_id"),
  type: text("type").notNull(), // email, phone, meeting, site_visit, other
  subject: text("subject"),
  notes: text("notes").notNull(),
  contactDate: timestamp("contact_date").notNull(),
  followUpDate: date("follow_up_date"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCommunicationSchema = createInsertSchema(communications).omit({ id: true, createdAt: true });
export type Communication = typeof communications.$inferSelect;
export type InsertCommunication = z.infer<typeof insertCommunicationSchema>;

// Schedule Allocations (Equipment/Crew to Tasks)
export const allocations = pgTable("allocations", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id"),
  projectId: integer("project_id"),
  equipmentId: integer("equipment_id"),
  crewMember: text("crew_member"),
  allocationType: text("allocation_type").notNull(), // equipment, crew
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAllocationSchema = createInsertSchema(allocations).omit({ id: true, createdAt: true });
export type Allocation = typeof allocations.$inferSelect;
export type InsertAllocation = z.infer<typeof insertAllocationSchema>;

// Folders (for file organization)
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  parentId: integer("parent_id"),
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
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFileSchema = createInsertSchema(files).omit({ id: true, createdAt: true });
export type FileMetadata = typeof files.$inferSelect;
export type InsertFileMetadata = z.infer<typeof insertFileSchema>;
