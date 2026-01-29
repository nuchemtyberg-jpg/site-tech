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
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertCustomerSchema = createInsertSchema(customers).omit({ id: true, createdAt: true, deletedAt: true });
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
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, projectNumber: true, createdAt: true, deletedAt: true });
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
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, deletedAt: true }).extend({
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
  source: text("source").default("task"),
  dailyReportId: integer("daily_report_id"),
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
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true, createdAt: true, deletedAt: true });
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
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertMaintenanceLogSchema = createInsertSchema(maintenanceLogs).omit({ id: true, createdAt: true, deletedAt: true });
export type MaintenanceLog = typeof maintenanceLogs.$inferSelect;
export type InsertMaintenanceLog = z.infer<typeof insertMaintenanceLogSchema>;

// Daily Reports - Enhanced with weather, multi-user support, and completion workflow
export const dailyReports = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  reportDate: date("report_date").notNull(),
  status: text("status").notNull().default("draft"), // draft, completed
  // Weather fields (snapshot saved on creation)
  weatherSummary: text("weather_summary"),
  temperature: text("temperature"),
  temperatureHigh: text("temperature_high"),
  temperatureLow: text("temperature_low"),
  windSpeed: text("wind_speed"),
  weatherIcon: text("weather_icon"),
  weatherFetchedAt: timestamp("weather_fetched_at"),
  // Notes
  notes: text("notes"),
  // Signature fields (set on completion)
  signatureType: text("signature_type"), // 'freehand' or 'typed'
  signatureValue: text("signature_value"), // base64 for freehand, text for typed
  // Audit fields
  createdBy: text("created_by"),
  createdByName: text("created_by_name"),
  updatedBy: text("updated_by"),
  updatedByName: text("updated_by_name"),
  completedAt: timestamp("completed_at"),
  completedBy: text("completed_by"),
  completedByName: text("completed_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertDailyReportSchema = createInsertSchema(dailyReports).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type DailyReport = typeof dailyReports.$inferSelect;
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;

// Daily Report Task Entries - Tasks worked on in a daily report
export const dailyReportTaskEntries = pgTable("daily_report_task_entries", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  taskId: integer("task_id").notNull(),
  taskTitleSnapshot: text("task_title_snapshot").notNull(), // Snapshot of task title at time of entry
  percentComplete: integer("percent_complete").notNull().default(0), // 0-100
  comments: text("comments"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertDailyReportTaskEntrySchema = createInsertSchema(dailyReportTaskEntries).omit({ id: true, createdAt: true, deletedAt: true });
export type DailyReportTaskEntry = typeof dailyReportTaskEntries.$inferSelect;
export type InsertDailyReportTaskEntry = z.infer<typeof insertDailyReportTaskEntrySchema>;

// Daily Report Labor Lines - Labor used for a task entry
export const dailyReportLaborLines = pgTable("daily_report_labor_lines", {
  id: serial("id").primaryKey(),
  taskEntryId: integer("task_entry_id").notNull(),
  laborType: text("labor_type").notNull(), // Foreman, Operator, Laborer
  quantity: integer("quantity").notNull().default(1),
  hours: integer("hours").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertDailyReportLaborLineSchema = createInsertSchema(dailyReportLaborLines).omit({ id: true, createdAt: true, deletedAt: true });
export type DailyReportLaborLine = typeof dailyReportLaborLines.$inferSelect;
export type InsertDailyReportLaborLine = z.infer<typeof insertDailyReportLaborLineSchema>;

// Daily Report Equipment Lines - Equipment used for a task entry
export const dailyReportEquipmentLines = pgTable("daily_report_equipment_lines", {
  id: serial("id").primaryKey(),
  taskEntryId: integer("task_entry_id").notNull(),
  equipmentType: text("equipment_type").notNull(), // Mini Excavator, Excavator, Skid Steer, Compactor
  quantity: integer("quantity").notNull().default(1),
  hours: integer("hours").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertDailyReportEquipmentLineSchema = createInsertSchema(dailyReportEquipmentLines).omit({ id: true, createdAt: true, deletedAt: true });
export type DailyReportEquipmentLine = typeof dailyReportEquipmentLines.$inferSelect;
export type InsertDailyReportEquipmentLine = z.infer<typeof insertDailyReportEquipmentLineSchema>;

// Daily Report Delivery Entries - Deliveries recorded in a daily report
export const dailyReportDeliveryEntries = pgTable("daily_report_delivery_entries", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  vendor: text("vendor"),
  deliveryTime: text("delivery_time"),
  description: text("description"),
  allDelivered: boolean("all_delivered").default(true),
  missingItemsDetails: text("missing_items_details"), // Required if allDelivered = false
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertDailyReportDeliveryEntrySchema = createInsertSchema(dailyReportDeliveryEntries).omit({ id: true, createdAt: true, deletedAt: true });
export type DailyReportDeliveryEntry = typeof dailyReportDeliveryEntries.$inferSelect;
export type InsertDailyReportDeliveryEntry = z.infer<typeof insertDailyReportDeliveryEntrySchema>;

// Daily Report Photos - Flexible photo storage for reports, task entries, or deliveries
export const dailyReportPhotos = pgTable("daily_report_photos", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id"), // Optional - for general report photos
  taskEntryId: integer("task_entry_id"), // Optional - for task photos
  deliveryEntryId: integer("delivery_entry_id"), // Optional - for delivery photos
  url: text("url").notNull(),
  caption: text("caption"),
  takenAt: timestamp("taken_at"), // EXIF date when photo was taken
  createdBy: text("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertDailyReportPhotoSchema = createInsertSchema(dailyReportPhotos).omit({ id: true, createdAt: true, deletedAt: true });
export type DailyReportPhoto = typeof dailyReportPhotos.$inferSelect;
export type InsertDailyReportPhoto = z.infer<typeof insertDailyReportPhotoSchema>;

// Legacy tables kept for backward compatibility (deprecated)
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

export const laborEntries = pgTable("labor_entries", {
  id: serial("id").primaryKey(),
  reportTaskId: integer("report_task_id").notNull(),
  laborType: text("labor_type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  hours: integer("hours").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertLaborEntrySchema = createInsertSchema(laborEntries).omit({ id: true, createdAt: true });
export type LaborEntry = typeof laborEntries.$inferSelect;
export type InsertLaborEntry = z.infer<typeof insertLaborEntrySchema>;

export const equipmentEntries = pgTable("equipment_entries", {
  id: serial("id").primaryKey(),
  reportTaskId: integer("report_task_id").notNull(),
  equipmentType: text("equipment_type").notNull(),
  quantity: integer("quantity").notNull().default(1),
  hours: integer("hours").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertEquipmentEntrySchema = createInsertSchema(equipmentEntries).omit({ id: true, createdAt: true });
export type EquipmentEntry = typeof equipmentEntries.$inferSelect;
export type InsertEquipmentEntry = z.infer<typeof insertEquipmentEntrySchema>;

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

export const deliveryPhotos = pgTable("delivery_photos", {
  id: serial("id").primaryKey(),
  deliveryId: integer("delivery_id").notNull(),
  fileId: integer("file_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertDeliveryPhotoSchema = createInsertSchema(deliveryPhotos).omit({ id: true, createdAt: true });
export type DeliveryPhoto = typeof deliveryPhotos.$inferSelect;
export type InsertDeliveryPhoto = z.infer<typeof insertDeliveryPhotoSchema>;

export const reportTaskPhotos = pgTable("report_task_photos", {
  id: serial("id").primaryKey(),
  reportTaskId: integer("report_task_id").notNull(),
  fileId: integer("file_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertReportTaskPhotoSchema = createInsertSchema(reportTaskPhotos).omit({ id: true, createdAt: true });
export type ReportTaskPhoto = typeof reportTaskPhotos.$inferSelect;
export type InsertReportTaskPhoto = z.infer<typeof insertReportTaskPhotoSchema>;

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
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertCommunicationSchema = createInsertSchema(communications).omit({ id: true, createdAt: true, deletedAt: true });
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
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertAllocationSchema = createInsertSchema(allocations).omit({ id: true, createdAt: true, deletedAt: true });
export type Allocation = typeof allocations.$inferSelect;
export type InsertAllocation = z.infer<typeof insertAllocationSchema>;

// Folders (for file organization)
export const folders = pgTable("folders", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  parentId: integer("parent_id"),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertFolderSchema = createInsertSchema(folders).omit({ id: true, createdAt: true, deletedAt: true });
export type Folder = typeof folders.$inferSelect;
export type InsertFolder = z.infer<typeof insertFolderSchema>;

// Photo Albums
export const photoAlbums = pgTable("photo_albums", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertPhotoAlbumSchema = createInsertSchema(photoAlbums).omit({ id: true, createdAt: true, deletedAt: true });
export type PhotoAlbum = typeof photoAlbums.$inferSelect;
export type InsertPhotoAlbum = z.infer<typeof insertPhotoAlbumSchema>;

// Photos - Separate table for project photos
export const photos = pgTable("photos", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  albumId: integer("album_id"),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  takenAt: timestamp("taken_at"),  // Photo timestamp from EXIF metadata
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertPhotoSchema = createInsertSchema(photos).omit({ id: true, createdAt: true, deletedAt: true });
export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = z.infer<typeof insertPhotoSchema>;

// Files - Documents only (separate from photos)
// Note: albumId and takenAt are deprecated - photos now stored in photos table
export const files = pgTable("files", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  folderId: integer("folder_id"),
  albumId: integer("album_id"), // DEPRECATED - kept for migration
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  takenAt: timestamp("taken_at"), // DEPRECATED - kept for migration
  tags: text("tags").array(), // Document tags for categorization
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertFileSchema = createInsertSchema(files).omit({ id: true, createdAt: true, deletedAt: true });
export type FileMetadata = typeof files.$inferSelect;
export type InsertFileMetadata = z.infer<typeof insertFileSchema>;