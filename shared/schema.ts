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
  zip: text("zip"),
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
  percentComplete: integer("percent_complete").notNull().default(0), // 0-100
  estimatedHours: integer("estimated_hours"),
  assignedTo: text("assigned_to"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true }).extend({
  title: z.string().min(1, "Task title is required"),
  dueDate: z.string().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
});
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;

// Task Status History - tracks changes to task status and percent complete
export const taskStatusHistory = pgTable("task_status_history", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status"),
  previousPercentComplete: integer("previous_percent_complete"),
  newPercentComplete: integer("new_percent_complete"),
  changedByUserId: text("changed_by_user_id").notNull(),
  changedByName: text("changed_by_name").notNull(),
  changedAt: timestamp("changed_at").defaultNow(),
});

export const insertTaskStatusHistorySchema = createInsertSchema(taskStatusHistory).omit({ id: true, changedAt: true });
export type TaskStatusHistory = typeof taskStatusHistory.$inferSelect;
export type InsertTaskStatusHistory = z.infer<typeof insertTaskStatusHistorySchema>;

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

// Daily Reports - Enhanced with weather and multi-user support
export const dailyReports = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  reportDate: date("report_date").notNull(),
  weather: text("weather"),
  weatherDescription: text("weather_description"),
  temperature: text("temperature"),
  temperatureHigh: text("temperature_high"),
  temperatureLow: text("temperature_low"),
  humidity: text("humidity"),
  windSpeed: text("wind_speed"),
  notes: text("notes"),
  createdBy: text("created_by"),
  lastModifiedBy: text("last_modified_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertDailyReportSchema = createInsertSchema(dailyReports).omit({ id: true, createdAt: true, updatedAt: true });
export type DailyReport = typeof dailyReports.$inferSelect;
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;

// Report Tasks - Tasks worked on in a daily report
export const reportTasks = pgTable("report_tasks", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  taskId: integer("task_id").notNull(),
  percentComplete: integer("percent_complete").notNull().default(0),
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReportTaskSchema = createInsertSchema(reportTasks).omit({ id: true, createdAt: true });
export type ReportTask = typeof reportTasks.$inferSelect;
export type InsertReportTask = z.infer<typeof insertReportTaskSchema>;

// Labor Entries - Labor used for a report task
export const laborEntries = pgTable("labor_entries", {
  id: serial("id").primaryKey(),
  reportTaskId: integer("report_task_id").notNull(),
  laborType: text("labor_type").notNull(), // Foreman, Operator, Laborer
  quantity: integer("quantity").notNull().default(1),
  hours: integer("hours").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLaborEntrySchema = createInsertSchema(laborEntries).omit({ id: true, createdAt: true });
export type LaborEntry = typeof laborEntries.$inferSelect;
export type InsertLaborEntry = z.infer<typeof insertLaborEntrySchema>;

// Equipment Entries - Equipment used for a report task
export const equipmentEntries = pgTable("equipment_entries", {
  id: serial("id").primaryKey(),
  reportTaskId: integer("report_task_id").notNull(),
  equipmentType: text("equipment_type").notNull(), // Mini Excavator, Excavator, Skidsteer, Compactor
  quantity: integer("quantity").notNull().default(1),
  hours: integer("hours").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEquipmentEntrySchema = createInsertSchema(equipmentEntries).omit({ id: true, createdAt: true });
export type EquipmentEntry = typeof equipmentEntries.$inferSelect;
export type InsertEquipmentEntry = z.infer<typeof insertEquipmentEntrySchema>;

// Report Task Photos - Photos for a report task
export const reportTaskPhotos = pgTable("report_task_photos", {
  id: serial("id").primaryKey(),
  reportTaskId: integer("report_task_id").notNull(),
  fileId: integer("file_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReportTaskPhotoSchema = createInsertSchema(reportTaskPhotos).omit({ id: true, createdAt: true });
export type ReportTaskPhoto = typeof reportTaskPhotos.$inferSelect;
export type InsertReportTaskPhoto = z.infer<typeof insertReportTaskPhotoSchema>;

// Deliveries - Deliveries recorded in a daily report
export const deliveries = pgTable("deliveries", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  vendor: text("vendor").notNull(),
  deliveryTime: text("delivery_time"),
  description: text("description"),
  allItemsDelivered: boolean("all_items_delivered").default(true),
  missingItemsDetails: text("missing_items_details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDeliverySchema = createInsertSchema(deliveries).omit({ id: true, createdAt: true });
export type Delivery = typeof deliveries.$inferSelect;
export type InsertDelivery = z.infer<typeof insertDeliverySchema>;

// Delivery Photos - Photos for a delivery
export const deliveryPhotos = pgTable("delivery_photos", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull(),
  fileId: integer("file_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDeliveryPhotoSchema = createInsertSchema(deliveryPhotos).omit({ id: true, createdAt: true });
export type DeliveryPhoto = typeof deliveryPhotos.$inferSelect;
export type InsertDeliveryPhoto = z.infer<typeof insertDeliveryPhotoSchema>;

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

// Photo Albums
export const photoAlbums = pgTable("photo_albums", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPhotoAlbumSchema = createInsertSchema(photoAlbums).omit({ id: true, createdAt: true });
export type PhotoAlbum = typeof photoAlbums.$inferSelect;
export type InsertPhotoAlbum = z.infer<typeof insertPhotoAlbumSchema>;

// Files
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  folderId: integer("folder_id"),
  albumId: integer("album_id"),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFileSchema = createInsertSchema(files).omit({ id: true, createdAt: true });
export type FileMetadata = typeof files.$inferSelect;
export type InsertFileMetadata = z.infer<typeof insertFileSchema>;
