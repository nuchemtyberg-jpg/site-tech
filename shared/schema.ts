import { pgTable, text, serial, integer, boolean, timestamp, date, uniqueIndex, index, real, varchar, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { users } from "./models/auth";
import { PROJECT_STATUS_VALUES } from "./projectStatus";
import {
  OPPORTUNITY_STATUS_VALUES,
  OPPORTUNITY_SOURCE_VALUES,
  OPPORTUNITY_PROJECT_TYPE_VALUES,
  OPPORTUNITY_CONTACT_ROLE_VALUES,
  OPPORTUNITY_LOST_REASON_VALUES,
  OPPORTUNITY_NO_BID_REASON_VALUES,
  WORKFLOW_TRIGGER_TYPE_VALUES,
} from "./opportunityStatus";

export * from "./models/auth";
export * from "./projectStatus";
export * from "./opportunityStatus";

// Customers - a Customer represents a company/organization
export const CUSTOMER_TYPES = [
  "general_contractor",
  "developer",
  "owner",
  "construction_manager",
  "engineer",
  "architect",
  "municipality",
  "property_manager",
  "vendor",
  "other",
] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  general_contractor: "General Contractor",
  developer: "Developer",
  owner: "Owner",
  construction_manager: "Construction Manager",
  engineer: "Engineer",
  architect: "Architect",
  municipality: "Municipality / Public Agency",
  property_manager: "Property Manager",
  vendor: "Vendor",
  other: "Other",
};

export const CUSTOMER_STATUSES = ["active", "inactive", "archived"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // company / organization name
  company: text("company"), // legacy column (pre-upgrade); no longer used
  email: text("email"), // general company email
  phone: text("phone"), // main company phone
  website: text("website"),
  customerType: text("customer_type"), // see CUSTOMER_TYPES
  status: text("status").notNull().default("active"), // active, inactive, archived
  address: text("address"),
  address2: text("address_2"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  notes: text("notes"),
  nameNeedsReview: boolean("name_needs_review").notNull().default(false), // migrated from a person name; company name needs cleanup
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
}, (table) => [
  index("idx_customers_status").on(table.status),
  index("idx_customers_name").on(table.name),
]);

export const insertCustomerSchema = createInsertSchema(customers)
  .omit({ id: true, company: true, createdAt: true, updatedAt: true, deletedAt: true })
  .extend({
    name: z.string().min(1, "Company name is required"),
    customerType: z.enum(CUSTOMER_TYPES).nullable().optional(),
    status: z.enum(CUSTOMER_STATUSES).optional(),
  });
export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;

// Contacts - individual people belonging to a Customer (company)
export const CONTACT_ROLES = [
  "estimating",
  "project_management",
  "purchasing",
  "accounting_ap",
  "executive_owner",
  "contract_signer",
  "superintendent",
  "engineering",
  "other",
] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  estimating: "Estimating",
  project_management: "Project Management",
  purchasing: "Purchasing",
  accounting_ap: "Accounting / AP",
  executive_owner: "Executive / Owner",
  contract_signer: "Contract Signer",
  superintendent: "Superintendent",
  engineering: "Engineering",
  other: "Other",
};

export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  jobTitle: text("job_title"),
  roles: text("roles").array().notNull().default(sqlArrayDefault()), // see CONTACT_ROLES (multi-role)
  email: text("email"),
  officePhone: text("office_phone"),
  mobilePhone: text("mobile_phone"),
  extension: text("extension"),
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_contacts_customer").on(table.customerId),
  index("idx_contacts_email").on(table.email),
]);

function sqlArrayDefault() {
  // drizzle needs an explicit sql default for empty text arrays
  return sql`'{}'::text[]`;
}

export const insertContactSchema = createInsertSchema(contacts)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    firstName: z.string().min(1, "Name is required"),
    roles: z.array(z.enum(CONTACT_ROLES)).optional(),
  });
export type Contact = typeof contacts.$inferSelect;
export type InsertContact = z.infer<typeof insertContactSchema>;

// Project Contacts - links a project to contacts of its customer (with optional role label)
export const projectContacts = pgTable("project_contacts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  contactId: integer("contact_id").notNull(),
  roleLabel: text("role_label"), // optional free-text role for this job, e.g. "Site Super"
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_project_contacts_project_contact").on(table.projectId, table.contactId),
  index("idx_project_contacts_project").on(table.projectId),
  index("idx_project_contacts_contact").on(table.contactId),
]);

export const insertProjectContactSchema = createInsertSchema(projectContacts)
  .omit({ id: true, createdAt: true })
  .extend({
    roleLabel: z.string().max(100).nullable().optional(),
  });
export type ProjectContact = typeof projectContacts.$inferSelect;
export type InsertProjectContact = z.infer<typeof insertProjectContactSchema>;

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
  status: text("status").notNull().default("new"), // new, bidding, takeoff_done, takeoff_reviewed, proposal_sent, active, completed, bid_lost, archive
  estimatedValue: integer("estimated_value"),
  notes: text("notes"),
  color: text("color").notNull().default("#f97316"),
  projectEmail: text("project_email"),
  retainagePercent: real("retainage_percent"), // G702 retainage percentage (e.g. 5, 10)
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, projectNumber: true, projectEmail: true, createdAt: true, deletedAt: true }).extend({
  retainagePercent: z.number().min(0).max(100).optional().nullable(),
  status: z.enum(PROJECT_STATUS_VALUES).optional(),
});
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
  scheduledValue: integer("scheduled_value"), // Dollar amount for G702 schedule of values
  assignedTo: text("assigned_to"),
  completedAt: timestamp("completed_at"),
  billedAt: timestamp("billed_at"),
  billedBy: text("billed_by"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, deletedAt: true, completedAt: true, billedAt: true, billedBy: true }).extend({
  title: z.string().min(1, "Task title is required"),
  dueDate: z.string().optional().nullable(),
  scheduledDate: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  scheduledValue: z.number().int().min(0).optional().nullable(),
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

// Daily Report Labor Lines - Labor used for a task entry (linked to Fingercheck employees)
export const dailyReportLaborLines = pgTable("daily_report_labor_lines", {
  id: serial("id").primaryKey(),
  taskEntryId: integer("task_entry_id").notNull(),
  laborType: text("labor_type").notNull(), // Foreman, Operator, Laborer
  quantity: integer("quantity").notNull().default(1),
  hours: real("hours").notNull().default(0),
  employeeId: integer("employee_id"),
  employeeName: text("employee_name"),
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
export const dailyReportInspectionEntries = pgTable("daily_report_inspection_entries", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull(),
  inspectionType: text("inspection_type").notNull(),
  inspectionAuthority: text("inspection_authority").notNull(),
  inspectorName: text("inspector_name"),
  notes: text("notes"),
  passed: boolean("passed"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertDailyReportInspectionEntrySchema = createInsertSchema(dailyReportInspectionEntries).omit({ id: true, createdAt: true, deletedAt: true });
export type DailyReportInspectionEntry = typeof dailyReportInspectionEntries.$inferSelect;
export type InsertDailyReportInspectionEntry = z.infer<typeof insertDailyReportInspectionEntrySchema>;

export const dailyReportPhotos = pgTable("daily_report_photos", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id"),
  taskEntryId: integer("task_entry_id"),
  deliveryEntryId: integer("delivery_entry_id"),
  inspectionEntryId: integer("inspection_entry_id"),
  url: text("url").notNull(),
  caption: text("caption"),
  takenAt: timestamp("taken_at"),
  createdBy: text("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
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

// Fingercheck Employees - synced from Fingercheck API
export const fingercheckEmployees = pgTable("fingercheck_employees", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().unique(),
  employeeNumber: text("employee_number"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  middleInitial: text("middle_initial"),
  email: text("email"),
  phone: text("phone"),
  mobilePhone: text("mobile_phone"),
  jobTitle: text("job_title"),
  position: text("position"),
  department: text("department"),
  location: text("location"),
  hireDate: text("hire_date"),
  terminationDate: text("termination_date"),
  status: text("status").notNull().default("active"),
  payType: text("pay_type"),
  address1: text("address_1"),
  address2: text("address_2"),
  city: text("city"),
  state: text("state"),
  zipCode: text("zip_code"),
  isSupervisor: boolean("is_supervisor").default(false),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFingercheckEmployeeSchema = createInsertSchema(fingercheckEmployees).omit({ id: true, createdAt: true, lastSyncedAt: true });
export type FingercheckEmployee = typeof fingercheckEmployees.$inferSelect;
export type InsertFingercheckEmployee = z.infer<typeof insertFingercheckEmployeeSchema>;

// Fingercheck Time Punches - raw punch-in/out records from Fingercheck API
export const fingercheckTimePunches = pgTable("fingercheck_time_punches", {
  id: serial("id").primaryKey(),
  guid: text("guid").notNull().unique(),
  employeeId: integer("employee_id").notNull(),
  employeeNumber: text("employee_number"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  date: text("date").notNull(),
  actualTime: text("actual_time").notNull(),
  roundedTime: text("rounded_time"),
  punchType: integer("punch_type").notNull(),
  jobCode: text("job_code"),
  jobDescription: text("job_description"),
  taskCode: text("task_code"),
  taskDescription: text("task_description"),
  note: text("note"),
  entryDetails: text("entry_details"),
  entryType: text("entry_type"),
  isPunchEdit: boolean("is_punch_edit").default(false),
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFingercheckTimePunchSchema = createInsertSchema(fingercheckTimePunches).omit({ id: true, createdAt: true, lastSyncedAt: true });
export type FingercheckTimePunch = typeof fingercheckTimePunches.$inferSelect;
export type InsertFingercheckTimePunch = z.infer<typeof insertFingercheckTimePunchSchema>;

// Fingercheck Project Mappings - links SiteTech projects to Fingercheck job codes
export const fingercheckProjectMappings = pgTable("fingercheck_project_mappings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  fingercheckJobCode: text("fingercheck_job_code").notNull(),
  fingercheckJobDescription: text("fingercheck_job_description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("unique_project_job_mapping").on(table.projectId, table.fingercheckJobCode),
]);

export const insertFingercheckProjectMappingSchema = createInsertSchema(fingercheckProjectMappings).omit({ id: true, createdAt: true });
export type FingercheckProjectMapping = typeof fingercheckProjectMappings.$inferSelect;
export type InsertFingercheckProjectMapping = z.infer<typeof insertFingercheckProjectMappingSchema>;

export const reportTaskPhotos = pgTable("report_task_photos", {
  id: serial("id").primaryKey(),
  reportTaskId: integer("report_task_id").notNull(),
  fileId: integer("file_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertReportTaskPhotoSchema = createInsertSchema(reportTaskPhotos).omit({ id: true, createdAt: true });
export type ReportTaskPhoto = typeof reportTaskPhotos.$inferSelect;
export type InsertReportTaskPhoto = z.infer<typeof insertReportTaskPhotoSchema>;

// Project Email Connections - Outlook OAuth tokens per project
export const projectEmailConnections = pgTable("project_email_connections", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  emailAddress: text("email_address").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  tokenExpiresAt: timestamp("token_expires_at").notNull(),
  status: text("status").notNull().default("active"), // active, expired, error
  lastSyncAt: timestamp("last_sync_at"),
  connectedBy: text("connected_by"),
  connectedByName: text("connected_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectEmailConnectionSchema = createInsertSchema(projectEmailConnections).omit({ id: true, createdAt: true });
export type ProjectEmailConnection = typeof projectEmailConnections.$inferSelect;
export type InsertProjectEmailConnection = z.infer<typeof insertProjectEmailConnectionSchema>;

// Project Emails - from inbound (Mailgun) or synced from Outlook
export const projectEmails = pgTable("project_emails", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  source: text("source").notNull().default("inbound"), // inbound, outlook
  outlookMessageId: text("outlook_message_id"),
  inboundMessageId: text("inbound_message_id"),
  conversationId: text("conversation_id"),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  toEmails: text("to_emails").array(),
  ccEmails: text("cc_emails").array(),
  subject: text("subject"),
  bodyPreview: text("body_preview"),
  bodyHtml: text("body_html"),
  isInternal: boolean("is_internal").default(false),
  hasAttachments: boolean("has_attachments").default(false),
  receivedAt: timestamp("received_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectEmailSchema = createInsertSchema(projectEmails).omit({ id: true, createdAt: true });
export type ProjectEmail = typeof projectEmails.$inferSelect;
export type InsertProjectEmail = z.infer<typeof insertProjectEmailSchema>;

// Project Email Attachments
export const projectEmailAttachments = pgTable("project_email_attachments", {
  id: serial("id").primaryKey(),
  emailId: integer("email_id").notNull(),
  outlookAttachmentId: text("outlook_attachment_id"),
  storagePath: text("storage_path"),
  name: text("name").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertProjectEmailAttachmentSchema = createInsertSchema(projectEmailAttachments).omit({ id: true, createdAt: true });
export type ProjectEmailAttachment = typeof projectEmailAttachments.$inferSelect;
export type InsertProjectEmailAttachment = z.infer<typeof insertProjectEmailAttachmentSchema>;

// RFIs (Request for Information)
export const rfis = pgTable("rfis", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  rfiNumber: integer("rfi_number").notNull(),
  subject: text("subject").notNull(),
  question: text("question").notNull(),
  directedTo: text("directed_to").notNull(),
  directedToEmail: text("directed_to_email").notNull(),
  ccEmails: text("cc_emails").array(),
  priority: text("priority").notNull().default("normal"), // low, normal, high, urgent
  dueDate: date("due_date"),
  status: text("status").notNull().default("draft"), // draft, open, responded, closed
  additionalBody: text("additional_body"),
  attachments: text("attachments").array(),
  pdfUrl: text("pdf_url"),
  outlookMessageId: text("outlook_message_id"),
  outlookConversationId: text("outlook_conversation_id"),
  sentAt: timestamp("sent_at"),
  sentBy: text("sent_by"),
  sentByName: text("sent_by_name"),
  sentByEmail: text("sent_by_email"),
  createdBy: text("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertRfiSchema = createInsertSchema(rfis).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type Rfi = typeof rfis.$inferSelect;
export type InsertRfi = z.infer<typeof insertRfiSchema>;

// RFI Responses - tracked replies from Outlook conversation
export const rfiResponses = pgTable("rfi_responses", {
  id: serial("id").primaryKey(),
  rfiId: integer("rfi_id").notNull(),
  outlookMessageId: text("outlook_message_id"),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name"),
  bodyPreview: text("body_preview"),
  bodyHtml: text("body_html"),
  receivedAt: timestamp("received_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertRfiResponseSchema = createInsertSchema(rfiResponses).omit({ id: true, createdAt: true });
export type RfiResponse = typeof rfiResponses.$inferSelect;
export type InsertRfiResponse = z.infer<typeof insertRfiResponseSchema>;

// Customer Communications
export const communications = pgTable("communications", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  contactId: integer("contact_id"), // optional link to a specific contact at the customer
  projectId: integer("project_id"),
  opportunityId: integer("opportunity_id"), // optional link to an Opportunity (must belong to the same customer)
  type: text("type").notNull(), // email, phone, meeting, site_visit, other
  subject: text("subject"),
  notes: text("notes").notNull(),
  contactDate: timestamp("contact_date").notNull(),
  followUpDate: date("follow_up_date"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertCommunicationSchema = createInsertSchema(communications).omit({ id: true, createdAt: true, deletedAt: true }).extend({
  contactDate: z.coerce.date(),
  contactId: z.number().int().nullable().optional(),
  projectId: z.number().int().nullable().optional(),
  opportunityId: z.number().int().nullable().optional(),
});
export type Communication = typeof communications.$inferSelect;
export type InsertCommunication = z.infer<typeof insertCommunicationSchema>;

// Schedule Entries - tasks placed on the schedule with duration
export const scheduleEntries = pgTable("schedule_entries", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull(),
  projectId: integer("project_id").notNull(),
  startDate: date("start_date").notNull(),
  duration: integer("duration").notNull().default(1),
  includeSunday: boolean("include_sunday").notNull().default(false),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertScheduleEntrySchema = createInsertSchema(scheduleEntries).omit({ id: true, createdAt: true, deletedAt: true }).extend({
  startDate: z.string().min(1, "Start date is required"),
  duration: z.number().min(1, "Duration must be at least 1 day"),
});
export type ScheduleEntry = typeof scheduleEntries.$inferSelect;
export type InsertScheduleEntry = z.infer<typeof insertScheduleEntrySchema>;

// Schedule Allocations (Equipment/Crew to Tasks)
export const allocations = pgTable("allocations", {
  id: serial("id").primaryKey(),
  scheduleEntryId: integer("schedule_entry_id"),
  taskId: integer("task_id"),
  projectId: integer("project_id"),
  equipmentId: integer("equipment_id"),
  crewMember: text("crew_member"),
  employeeId: integer("employee_id"),
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
  objectPath: text("object_path"), // Legacy - kept for backward compatibility
  cloudinaryPublicId: text("cloudinary_public_id"), // Cloudinary public ID
  cloudinaryUrl: text("cloudinary_url"), // Cloudinary secure URL
  contentType: text("content_type"),
  size: integer("size"),
  takenAt: timestamp("taken_at"),  // Photo timestamp from EXIF metadata
  displayDate: timestamp("display_date").notNull().defaultNow(), // Normalized date for sorting (takenAt or createdAt)
  width: integer("width"), // Original image width
  height: integer("height"), // Original image height
  mediaType: text("media_type").notNull().default("image"), // "image" or "video"
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertPhotoSchema = createInsertSchema(photos).omit({ id: true, createdAt: true, deletedAt: true });
export type Photo = typeof photos.$inferSelect;
export type InsertPhoto = z.infer<typeof insertPhotoSchema>;

// Paginated photos response type
export type PaginatedPhotosResponse = {
  photos: Photo[];
  nextCursor: string | null;
  totalCount: number;
  hasMore: boolean;
};

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
  starred: boolean("starred").default(false), // Starred/favorite files
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
});

export const insertFileSchema = createInsertSchema(files).omit({ id: true, createdAt: true, deletedAt: true });
export type FileMetadata = typeof files.$inferSelect;
export type InsertFileMetadata = z.infer<typeof insertFileSchema>;

export const userOutlookConnections = pgTable("user_outlook_connections", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  email: text("email").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UserOutlookConnection = typeof userOutlookConnections.$inferSelect;
export type InsertUserOutlookConnection = typeof userOutlookConnections.$inferInsert;

// Project Daily Report Recipients - email addresses that auto-receive daily reports when signed
export const projectDailyReportRecipients = pgTable("project_daily_report_recipients", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  email: text("email").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertProjectDailyReportRecipientSchema = createInsertSchema(projectDailyReportRecipients).omit({ id: true, createdAt: true, deletedAt: true });
export type ProjectDailyReportRecipient = typeof projectDailyReportRecipients.$inferSelect;
export type InsertProjectDailyReportRecipient = z.infer<typeof insertProjectDailyReportRecipientSchema>;

// Company Folders (for company-wide document organization, no projectId)
export const companyFolders = pgTable("company_folders", {
  id: serial("id").primaryKey(),
  parentId: integer("parent_id"),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertCompanyFolderSchema = createInsertSchema(companyFolders).omit({ id: true, createdAt: true, deletedAt: true });
export type CompanyFolder = typeof companyFolders.$inferSelect;
export type InsertCompanyFolder = z.infer<typeof insertCompanyFolderSchema>;

// Company Files (company-wide documents, no projectId)
export const companyFiles = pgTable("company_files", {
  id: serial("id").primaryKey(),
  folderId: integer("folder_id"),
  name: text("name").notNull(),
  objectPath: text("object_path").notNull(),
  contentType: text("content_type"),
  size: integer("size"),
  tags: text("tags").array(),
  starred: boolean("starred").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertCompanyFileSchema = createInsertSchema(companyFiles).omit({ id: true, createdAt: true, deletedAt: true });
export type CompanyFile = typeof companyFiles.$inferSelect;
export type InsertCompanyFile = z.infer<typeof insertCompanyFileSchema>;

// Pay Applications (G702 Progress Billing)
export const payApplications = pgTable("pay_applications", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  applicationNumber: integer("application_number").notNull(),
  periodTo: date("period_to").notNull(),
  contractDate: date("contract_date"),
  originalContractSum: integer("original_contract_sum"),
  netChangeByChangeOrders: integer("net_change_by_change_orders").default(0),
  retainagePercent: real("retainage_percent").default(0),
  status: text("status").notNull().default("draft"), // draft, submitted, approved
  notes: text("notes"),
  createdBy: text("created_by"),
  createdByName: text("created_by_name"),
  submittedAt: timestamp("submitted_at"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),
  approvedByName: text("approved_by_name"),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertPayApplicationSchema = createInsertSchema(payApplications).omit({ id: true, createdAt: true, deletedAt: true, submittedAt: true, approvedAt: true, approvedBy: true, approvedByName: true }).extend({
  periodTo: z.string().min(1, "Period to date is required"),
  applicationNumber: z.number().int().min(1),
  contractDate: z.string().optional().nullable(),
  originalContractSum: z.number().int().min(0).optional().nullable(),
  netChangeByChangeOrders: z.number().int().optional().nullable(),
  retainagePercent: z.number().min(0).max(100).optional().nullable(),
});
export type PayApplication = typeof payApplications.$inferSelect;
export type InsertPayApplication = z.infer<typeof insertPayApplicationSchema>;

// Pay Application Line Items (G703 Continuation Sheet)
export const payApplicationItems = pgTable("pay_application_items", {
  id: serial("id").primaryKey(),
  payApplicationId: integer("pay_application_id").notNull(),
  taskId: integer("task_id").notNull(),
  itemNumber: integer("item_number").notNull(),
  description: text("description").notNull(),
  scheduledValue: integer("scheduled_value").notNull().default(0),
  previouslyCompleted: integer("previously_completed").notNull().default(0),
  thisPeriodsWork: integer("this_periods_work").notNull().default(0),
  materialsStored: integer("materials_stored").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertPayApplicationItemSchema = createInsertSchema(payApplicationItems).omit({ id: true, createdAt: true }).extend({
  scheduledValue: z.number().int().min(0),
  previouslyCompleted: z.number().int().min(0),
  thisPeriodsWork: z.number().int().min(0),
  materialsStored: z.number().int().min(0),
});
export type PayApplicationItem = typeof payApplicationItems.$inferSelect;

// Task Titles (a.k.a. task types) - persistent custom titles users can add when creating tasks
export const taskTitles = pgTable("task_titles", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
});

export const insertTaskTitleSchema = createInsertSchema(taskTitles).omit({ id: true, createdAt: true, deletedAt: true }).extend({
  name: z.string().trim().min(1, "Task title is required"),
});
export type TaskTitle = typeof taskTitles.$inferSelect;
export type InsertTaskTitle = z.infer<typeof insertTaskTitleSchema>;
export type InsertPayApplicationItem = z.infer<typeof insertPayApplicationItemSchema>;
// ============================================================
// Todos, Workflow Automation, Notifications & Activity Log
// (Reusable action-item platform — future modules like RFPs,
// Estimates, Change Orders link via relatedEntityType/Id)
// ============================================================

export const TODO_STATUSES = ["open", "in_progress", "completed", "cancelled"] as const;
export const TODO_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const DUE_OFFSET_TYPES = ["immediately", "days", "none"] as const;

// Todos - centralized action items (distinct from construction `tasks`)
export const todos = pgTable("todos", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  assignedToUserId: varchar("assigned_to_user_id").notNull(),
  createdByUserId: varchar("created_by_user_id"), // null => created by System (workflow)
  projectId: integer("project_id"), // direct project link for heavy project-based filtering
  relatedEntityType: text("related_entity_type"), // 'project' now; future: 'rfp', 'estimate', 'change_order', ...
  relatedEntityId: integer("related_entity_id"),
  dueDate: date("due_date"),
  priority: text("priority").notNull().default("normal"), // low, normal, high, urgent
  status: text("status").notNull().default("open"), // open, in_progress, completed, cancelled
  source: text("source").notNull().default("manual"), // manual, workflow
  workflowRuleId: integer("workflow_rule_id"), // set when generated by a workflow rule
  completedAt: timestamp("completed_at"),
  completedByUserId: varchar("completed_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
}, (table) => [
  index("idx_todos_assigned_to").on(table.assignedToUserId),
  index("idx_todos_project").on(table.projectId),
  index("idx_todos_status").on(table.status),
  index("idx_todos_due_date").on(table.dueDate),
]);

export const insertTodoSchema = createInsertSchema(todos).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true,
  completedAt: true, completedByUserId: true,
}).extend({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.enum(TODO_PRIORITIES).optional(),
  status: z.enum(TODO_STATUSES).optional(),
  projectId: z.number().int().optional().nullable(),
});
export type Todo = typeof todos.$inferSelect;
export type InsertTodo = z.infer<typeof insertTodoSchema>;

// Todo enriched with display names for lists (server joins users/projects/opportunities)
export type TodoWithDetails = Todo & {
  assignedToName: string | null;
  createdByName: string | null;
  completedByName: string | null;
  projectName: string | null;
  opportunityName: string | null; // set when relatedEntityType === 'opportunity'
  opportunityNumber: string | null;
  updateCount: number; // number of (non-deleted) todo updates, for 💬 badges
};

export type MyWorkSummary = {
  overdue: number;
  dueToday: number;
  upcoming: number;
  noDueDate: number;
  open: number;
};

// Todo Updates — chronological notes / progress comments attached to a todo.
// Separate from the description on purpose: the description says what needs
// to be done; updates record what happened afterward. Each update is its own
// row (never a combined text blob). Text-only for now; future attachments or
// @mentions can reference todo_update ids without schema changes here.
export const todoUpdates = pgTable("todo_updates", {
  id: serial("id").primaryKey(),
  todoId: integer("todo_id").notNull(),
  body: text("body").notNull(),
  createdByUserId: varchar("created_by_user_id").notNull(),
  editedAt: timestamp("edited_at"), // set when the author edits — UI shows "Edited"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // soft delete — history is preserved, never hard-removed
}, (table) => [
  index("idx_todo_updates_todo_created").on(table.todoId, table.createdAt), // timeline + efficient latest-update lookup
  index("idx_todo_updates_created_by").on(table.createdByUserId),
]);

export const insertTodoUpdateSchema = createInsertSchema(todoUpdates).omit({
  id: true, editedAt: true, createdAt: true, updatedAt: true, deletedAt: true,
}).extend({
  body: z.string().trim().min(1, "Update text is required").max(5000, "Keep updates under 5,000 characters"),
});
export type TodoUpdate = typeof todoUpdates.$inferSelect;
export type InsertTodoUpdate = z.infer<typeof insertTodoUpdateSchema>;
export type TodoUpdateWithAuthor = TodoUpdate & { authorName: string | null };
export type TodoUpdatesPage = { items: TodoUpdateWithAuthor[]; total: number };

// Workflow Rules - admin-configured automation triggered by project status changes
export const workflowRules = pgTable("workflow_rules", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  triggerType: text("trigger_type").notNull().default("project_status_change"), // extensible for future triggers
  triggerStatus: text("trigger_status").notNull(), // canonical project status value
  assignedToUserId: varchar("assigned_to_user_id").notNull(),
  createTodo: boolean("create_todo").notNull().default(true),
  todoTitle: text("todo_title"),
  todoDescription: text("todo_description"),
  todoPriority: text("todo_priority").notNull().default("normal"),
  dueOffsetType: text("due_offset_type").notNull().default("none"), // immediately, days, none
  dueOffsetDays: integer("due_offset_days"),
  dueOffsetUnit: text("due_offset_unit").notNull().default("calendar_days"), // business_days can be added later
  sendInAppNotification: boolean("send_in_app_notification").notNull().default(true),
  sendEmailNotification: boolean("send_email_notification").notNull().default(false),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
}, (table) => [
  index("idx_workflow_rules_active").on(table.isActive),
  index("idx_workflow_rules_trigger").on(table.triggerType, table.triggerStatus),
]);

export const insertWorkflowRuleSchema = createInsertSchema(workflowRules).omit({
  id: true, createdAt: true, updatedAt: true, deletedAt: true, createdByUserId: true,
}).extend({
  name: z.string().trim().min(1, "Rule name is required"),
  triggerType: z.enum(WORKFLOW_TRIGGER_TYPE_VALUES).optional(),
  triggerStatus: z.string().min(1, "Trigger status is required"),
  assignedToUserId: z.string().min(1, "Assigned user is required"),
  todoTitle: z.string().optional().nullable(),
  todoDescription: z.string().optional().nullable(),
  todoPriority: z.enum(TODO_PRIORITIES).optional(),
  dueOffsetType: z.enum(DUE_OFFSET_TYPES).optional(),
  dueOffsetDays: z.number().int().min(0).optional().nullable(),
}).superRefine((data, ctx) => {
  // Trigger status must be valid for the selected trigger type
  const triggerType = data.triggerType ?? "project_status_change";
  const validStatuses: readonly string[] = triggerType === "opportunity_status_change" ? OPPORTUNITY_STATUS_VALUES : PROJECT_STATUS_VALUES;
  if (!validStatuses.includes(data.triggerStatus)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["triggerStatus"], message: `Invalid trigger status for ${triggerType === "opportunity_status_change" ? "opportunity" : "project"} status change` });
  }
  if (data.createTodo !== false && (!data.todoTitle || !data.todoTitle.trim())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["todoTitle"], message: "Todo title is required when creating a todo" });
  }
  if (data.dueOffsetType === "days" && (data.dueOffsetDays === null || data.dueOffsetDays === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dueOffsetDays"], message: "Number of days is required" });
  }
});
export type WorkflowRule = typeof workflowRules.$inferSelect;
export type InsertWorkflowRule = z.infer<typeof insertWorkflowRuleSchema>;

// Workflow rule enriched with assignee info for admin list (inactive-assignee warning)
export type WorkflowRuleWithDetails = WorkflowRule & {
  assignedToName: string | null;
  assignedToEmail: string | null;
  assigneeIsActive: boolean; // false when user missing or isAuthorized !== 'approved'
};

// Workflow Executions - audit + duplicate protection (idempotency)
// Unique on (workflowRuleId, statusHistoryId): a rule executes at most once per real status transition.
export const workflowExecutions = pgTable("workflow_executions", {
  id: serial("id").primaryKey(),
  workflowRuleId: integer("workflow_rule_id").notNull(),
  projectId: integer("project_id"), // set for project_status_change executions
  opportunityId: integer("opportunity_id"), // set for opportunity_status_change executions
  statusHistoryId: integer("status_history_id").notNull(), // identity of the triggering transition (project_status_history or opportunity_status_history id, per triggerEvent)
  triggerEvent: text("trigger_event").notNull().default("project_status_change"),
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  todoId: integer("todo_id"),
  notificationSent: boolean("notification_sent").notNull().default(false),
  emailSent: boolean("email_sent").notNull().default(false),
  executedAt: timestamp("executed_at").defaultNow(),
}, (table) => [
  // statusHistoryId namespaces are per triggerEvent (project vs opportunity
  // history tables have independent serial ids), so the trigger event is part
  // of the idempotency identity.
  uniqueIndex("unique_workflow_execution_per_transition_event").on(table.workflowRuleId, table.triggerEvent, table.statusHistoryId),
  index("idx_workflow_executions_project").on(table.projectId),
  index("idx_workflow_executions_opportunity").on(table.opportunityId),
]);

export const insertWorkflowExecutionSchema = createInsertSchema(workflowExecutions).omit({ id: true, executedAt: true });
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type InsertWorkflowExecution = z.infer<typeof insertWorkflowExecutionSchema>;

// Project Status History - records every true status transition
export const projectStatusHistory = pgTable("project_status_history", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  changedByUserId: varchar("changed_by_user_id"),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
}, (table) => [
  index("idx_project_status_history_project").on(table.projectId),
]);

export const insertProjectStatusHistorySchema = createInsertSchema(projectStatusHistory).omit({ id: true, changedAt: true });
export type ProjectStatusHistory = typeof projectStatusHistory.$inferSelect;
export type InsertProjectStatusHistory = z.infer<typeof insertProjectStatusHistorySchema>;

// Notifications - in-app notification system (header bell)
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  type: text("type").notNull().default("general"), // todo_assigned, workflow_todo, project_status, due_today, overdue, general
  title: text("title").notNull(),
  message: text("message"),
  projectId: integer("project_id"),
  todoId: integer("todo_id"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: integer("related_entity_id"),
  isRead: boolean("is_read").notNull().default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_notifications_user").on(table.userId),
  index("idx_notifications_user_read").on(table.userId, table.isRead),
  index("idx_notifications_created").on(table.createdAt),
  // At most one due-date reminder per todo per reminder type — enforced in the
  // database so concurrent runs / multiple instances cannot double-remind.
  uniqueIndex("uq_notifications_todo_reminder")
    .on(table.todoId, table.type)
    .where(sql`${table.type} in ('due_today', 'overdue')`),
]);

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true, readAt: true });
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

// Activity Logs - reusable audit trail (projects now; future modules attach via entityType/entityId)
export const activityLogs = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id"),
  entityType: text("entity_type").notNull(), // 'todo', 'project', 'workflow_rule', ...
  entityId: integer("entity_id"),
  action: text("action").notNull(), // todo_created, todo_completed, project_status_changed, workflow_executed, ...
  actorUserId: varchar("actor_user_id"), // null => automated (System)
  actorName: text("actor_name").notNull(), // display name; "System" for automated actions
  description: text("description").notNull(), // human-readable summary
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_activity_logs_project").on(table.projectId),
  index("idx_activity_logs_entity").on(table.entityType, table.entityId),
  index("idx_activity_logs_created").on(table.createdAt),
]);

export const insertActivityLogSchema = createInsertSchema(activityLogs).omit({ id: true, createdAt: true });
export type ActivityLog = typeof activityLogs.$inferSelect;
export type InsertActivityLog = z.infer<typeof insertActivityLogSchema>;

// ============================================================
// Opportunities (Phase 4 — RFP / bidding pipeline foundation)
// ============================================================
// An Opportunity is a potential job being evaluated/bid/negotiated. It is NOT
// a Project — Projects are created only when work is awarded (conversion is a
// later phase; for now we only store awardDate and a nullable convertedProjectId).

export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  // Human-readable permanent identifier (e.g. OPP-2026-0012). Server-generated,
  // unique, never changes even when the name changes. Decoupled from the PK so
  // the format can change later without breaking references.
  opportunityNumber: text("opportunity_number").notNull(),
  name: text("name").notNull(),
  customerId: integer("customer_id").notNull(),
  status: text("status").notNull().default("new"), // see OPPORTUNITY_STATUSES
  responsibleUserId: varchar("responsible_user_id"), // estimator / responsible SiteTech user
  // Project address (optional until known)
  streetAddress: text("street_address"),
  address2: text("address_2"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  // Key dates
  rfpReceivedDate: date("rfp_received_date"),
  bidDueDate: date("bid_due_date"),
  bidDueTime: text("bid_due_time"), // HH:MM (24h); separate from date per spec
  estimatedStartDate: date("estimated_start_date"),
  // Classification
  source: text("source"), // see OPPORTUNITY_SOURCES
  projectType: text("project_type"), // see OPPORTUNITY_PROJECT_TYPES
  // Descriptions
  scopeSummary: text("scope_summary"), // high-level only; detailed checklist is a later phase
  internalNotes: text("internal_notes"),
  // Value / confidence
  expectedValue: integer("expected_value"), // dollars, optional
  probability: integer("probability"), // 0-100, optional
  // Outcome capture (set by the status change service)
  lostReason: text("lost_reason"), // see OPPORTUNITY_LOST_REASONS
  lostReasonNotes: text("lost_reason_notes"),
  noBidReason: text("no_bid_reason"), // see OPPORTUNITY_NO_BID_REASONS
  noBidReasonNotes: text("no_bid_reason_notes"),
  awardDate: date("award_date"),
  convertedProjectId: integer("converted_project_id"), // set when converted to a Project (future phase)
  // Archive is a visibility flag, distinct from business statuses (Lost/No Bid
  // remain searchable; archived records are just hidden from default views).
  isArchived: boolean("is_archived").notNull().default(false),
  createdByUserId: varchar("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"), // Soft delete support
}, (table) => [
  uniqueIndex("uq_opportunities_number").on(table.opportunityNumber),
  index("idx_opportunities_customer").on(table.customerId),
  index("idx_opportunities_status").on(table.status),
  index("idx_opportunities_responsible_user").on(table.responsibleUserId),
  index("idx_opportunities_bid_due_date").on(table.bidDueDate),
  index("idx_opportunities_archived").on(table.isArchived),
]);

export const insertOpportunitySchema = createInsertSchema(opportunities).omit({
  id: true, opportunityNumber: true, createdByUserId: true,
  lostReason: true, lostReasonNotes: true, noBidReason: true, noBidReasonNotes: true,
  awardDate: true, convertedProjectId: true, // outcome fields are managed by the status change service
  createdAt: true, updatedAt: true, deletedAt: true,
}).extend({
  name: z.string().trim().min(1, "Opportunity name is required"),
  customerId: z.number().int({ message: "Customer is required" }),
  status: z.enum(OPPORTUNITY_STATUS_VALUES).optional(),
  responsibleUserId: z.string().nullable().optional(),
  source: z.enum(OPPORTUNITY_SOURCE_VALUES).nullable().optional(),
  projectType: z.enum(OPPORTUNITY_PROJECT_TYPE_VALUES).nullable().optional(),
  bidDueDate: z.string().nullable().optional(),
  bidDueTime: z.string().regex(/^\d{2}:\d{2}$/, "Bid due time must be HH:MM").nullable().optional(),
  rfpReceivedDate: z.string().nullable().optional(),
  estimatedStartDate: z.string().nullable().optional(),
  expectedValue: z.number().int().min(0).nullable().optional(),
  probability: z.number().int().min(0, "Probability must be 0-100").max(100, "Probability must be 0-100").nullable().optional(),
});
export type Opportunity = typeof opportunities.$inferSelect;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;

// Opportunity enriched for lists/detail (server joins customers/users)
export type OpportunityWithDetails = Opportunity & {
  customerName: string | null;
  responsibleUserName: string | null;
  primaryContactId: number | null;
  primaryContactName: string | null;
  /** Most recent direct or opportunity-linked activity. Present on dashboard rows. */
  lastActivityAt?: Date | null;
};

export type OpportunityDashboardSummary = {
  total: number;
  active: number;
  /** Non-archived terminal outcomes matching the dashboard's non-outcome facets. */
  outcomes: number;
  archived: number;
  unassigned: number;
  overdue: number;
  dueToday: number;
  dueTomorrow: number;
  dueNext7Days: number;
  /** Null when preliminary value data is not visible to the current role. */
  expectedValueTotal: number | null;
  weightedValueTotal: number | null;
};

export type OpportunityDashboardResult = {
  items: OpportunityWithDetails[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  statusCounts: Record<string, number>;
  summary: OpportunityDashboardSummary;
  canViewValues: boolean;
};

// Opportunity Contacts — links an Opportunity to contacts of its customer,
// with an optional opportunity-specific role (distinct from the contact's
// company-level roles/title) and a single primary flag per opportunity.
export const opportunityContacts = pgTable("opportunity_contacts", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").notNull(),
  contactId: integer("contact_id").notNull(),
  role: text("role"), // see OPPORTUNITY_CONTACT_ROLES (optional)
  isPrimary: boolean("is_primary").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  uniqueIndex("uq_opportunity_contacts_opportunity_contact").on(table.opportunityId, table.contactId),
  index("idx_opportunity_contacts_opportunity").on(table.opportunityId),
  index("idx_opportunity_contacts_contact").on(table.contactId),
]);

export const insertOpportunityContactSchema = createInsertSchema(opportunityContacts).omit({ id: true, createdAt: true }).extend({
  role: z.enum(OPPORTUNITY_CONTACT_ROLE_VALUES).nullable().optional(),
  isPrimary: z.boolean().optional(),
});
export type OpportunityContact = typeof opportunityContacts.$inferSelect;
export type InsertOpportunityContact = z.infer<typeof insertOpportunityContactSchema>;

export type OpportunityContactWithDetails = OpportunityContact & {
  firstName: string;
  lastName: string | null;
  jobTitle: string | null;
  email: string | null;
  officePhone: string | null;
  mobilePhone: string | null;
  customerId: number;
};

// Opportunity Status History — records every true status transition.
// History rows also serve as the workflow idempotency identity for
// opportunity_status_change triggers (like project_status_history does for projects).
export const opportunityStatusHistory = pgTable("opportunity_status_history", {
  id: serial("id").primaryKey(),
  opportunityId: integer("opportunity_id").notNull(),
  previousStatus: text("previous_status"),
  newStatus: text("new_status").notNull(),
  changedByUserId: varchar("changed_by_user_id"),
  changedByName: text("changed_by_name"),
  changedAt: timestamp("changed_at").defaultNow(),
}, (table) => [
  index("idx_opportunity_status_history_opportunity").on(table.opportunityId),
]);

export const insertOpportunityStatusHistorySchema = createInsertSchema(opportunityStatusHistory).omit({ id: true, changedAt: true });
export type OpportunityStatusHistory = typeof opportunityStatusHistory.$inferSelect;
export type InsertOpportunityStatusHistory = z.infer<typeof insertOpportunityStatusHistorySchema>;

// Input for the centralized status change service (reasons required by route validation
// when transitioning to lost / no_bid; award date defaults to today on awarded).
export const opportunityStatusChangeSchema = z.object({
  status: z.enum(OPPORTUNITY_STATUS_VALUES),
  lostReason: z.enum(OPPORTUNITY_LOST_REASON_VALUES).nullable().optional(),
  lostReasonNotes: z.string().max(2000).nullable().optional(),
  noBidReason: z.enum(OPPORTUNITY_NO_BID_REASON_VALUES).nullable().optional(),
  noBidReasonNotes: z.string().max(2000).nullable().optional(),
  awardDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});
export type OpportunityStatusChangeInput = z.infer<typeof opportunityStatusChangeSchema>;
