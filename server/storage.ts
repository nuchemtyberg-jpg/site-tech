import {
  projects, tasks, equipment, allocations, folders, files, photos, users, customers, dailyReports, maintenanceLogs, communications, taskStatusHistory, photoAlbums,
  reportTasks, laborEntries, equipmentEntries, reportTaskPhotos, deliveries, deliveryPhotos,
  dailyReportTaskEntries, dailyReportLaborLines, dailyReportEquipmentLines, dailyReportDeliveryEntries, dailyReportInspectionEntries, dailyReportPhotos,
  authorizedUsers, scheduleEntries,
  projectEmailConnections, projectEmails, projectEmailAttachments,
  fingercheckEmployees, fingercheckTimePunches, fingercheckProjectMappings,
  rfis, rfiResponses, userOutlookConnections, projectDailyReportRecipients,
  type InsertProject, type InsertTask, type InsertEquipment, type InsertAllocation, type InsertFolder, type InsertFileMetadata, type InsertPhoto,
  type InsertCustomer, type InsertDailyReport, type InsertMaintenanceLog, type InsertCommunication, type InsertTaskStatusHistory, type InsertPhotoAlbum,
  type InsertReportTask, type InsertLaborEntry, type InsertEquipmentEntry, type InsertReportTaskPhoto, type InsertDelivery, type InsertDeliveryPhoto,
  type InsertDailyReportTaskEntry, type InsertDailyReportLaborLine, type InsertDailyReportEquipmentLine, type InsertDailyReportDeliveryEntry, type InsertDailyReportInspectionEntry, type InsertDailyReportPhoto,
  type InsertAuthorizedUser, type InsertScheduleEntry,
  type InsertProjectEmailConnection, type InsertProjectEmail, type InsertProjectEmailAttachment,
  type InsertFingercheckEmployee, type InsertFingercheckTimePunch, type InsertFingercheckProjectMapping,
  type InsertRfi, type InsertRfiResponse, type InsertProjectDailyReportRecipient,
  type Project, type Task, type Equipment, type Allocation, type Folder, type FileMetadata, type Photo,
  type Customer, type DailyReport, type MaintenanceLog, type Communication, type TaskStatusHistory, type PhotoAlbum,
  type ReportTask, type LaborEntry, type EquipmentEntry, type ReportTaskPhoto, type Delivery, type DeliveryPhoto,
  type DailyReportTaskEntry, type DailyReportLaborLine, type DailyReportEquipmentLine, type DailyReportDeliveryEntry, type DailyReportInspectionEntry, type DailyReportPhoto,
  type ProjectEmailConnection, type ProjectEmail, type ProjectEmailAttachment,
  type FingercheckEmployee, type FingercheckTimePunch, type FingercheckProjectMapping,
  type Rfi, type RfiResponse, type UserOutlookConnection, type ProjectDailyReportRecipient,
  type ScheduleEntry,
  type User, type UpsertUser, type AuthorizedUser
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, isNull, sql, lt, ilike } from "drizzle-orm";

const PROJECT_EMAIL_DOMAIN = "updates.sitetechnj.com";

function generateProjectEmailSlug(name: string, id: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 30);
  return `${slug}-${id}@${PROJECT_EMAIL_DOMAIN}`;
}

export interface IStorage {
  // Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  
  // Authorized Users
  getAuthorizedUsers(): Promise<AuthorizedUser[]>;
  getAuthorizedUserByEmail(email: string): Promise<AuthorizedUser | undefined>;
  createAuthorizedUser(user: InsertAuthorizedUser): Promise<AuthorizedUser>;
  updateAuthorizedUser(id: string, updates: Partial<InsertAuthorizedUser>): Promise<AuthorizedUser | undefined>;
  deleteAuthorizedUser(id: string): Promise<void>;

  // Customers
  getCustomers(): Promise<Customer[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;

  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  getProjectsByCustomer(customerId: number): Promise<Project[]>;
  getNextProjectNumber(): Promise<string>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  getProjectByEmail(email: string): Promise<Project | undefined>;
  backfillProjectEmails(): Promise<{ id: number; name: string; projectEmail: string }[]>;

  // Tasks
  getTasks(projectId?: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: number): Promise<void>;

  // Billing
  getCompletedTasksForBilling(): Promise<(Task & { projectName: string })[]>;
  markTaskBilled(taskId: number, billedBy: string): Promise<Task>;
  markTaskUnbilled(taskId: number): Promise<Task>;
  bulkMarkTasksBilled(taskIds: number[], billedBy: string): Promise<void>;

  // Task Status History
  getTaskStatusHistory(taskId: number): Promise<TaskStatusHistory[]>;
  createTaskStatusHistory(history: InsertTaskStatusHistory): Promise<TaskStatusHistory>;

  // Equipment
  getEquipmentList(): Promise<Equipment[]>;
  getEquipment(id: number): Promise<Equipment | undefined>;
  createEquipment(equipment: InsertEquipment): Promise<Equipment>;
  updateEquipment(id: number, equipment: Partial<InsertEquipment>): Promise<Equipment>;
  deleteEquipment(id: number): Promise<void>;

  // Maintenance Logs
  getMaintenanceLogs(equipmentId: number): Promise<MaintenanceLog[]>;
  createMaintenanceLog(log: InsertMaintenanceLog): Promise<MaintenanceLog>;
  deleteMaintenanceLog(id: number): Promise<void>;

  // Daily Reports
  getDailyReports(projectId: number): Promise<DailyReport[]>;
  getDailyReport(id: number): Promise<DailyReport | undefined>;
  getDailyReportByDate(projectId: number, reportDate: string): Promise<DailyReport | undefined>;
  createDailyReport(report: InsertDailyReport): Promise<DailyReport>;
  updateDailyReport(id: number, report: Partial<InsertDailyReport>): Promise<DailyReport>;
  deleteDailyReport(id: number): Promise<void>;

  // Report Tasks
  getReportTasks(reportId: number): Promise<ReportTask[]>;
  getReportTask(id: number): Promise<ReportTask | undefined>;
  createReportTask(task: InsertReportTask): Promise<ReportTask>;
  updateReportTask(id: number, task: Partial<InsertReportTask>): Promise<ReportTask>;
  deleteReportTask(id: number): Promise<void>;

  // Labor Entries
  getLaborEntries(reportTaskId: number): Promise<LaborEntry[]>;
  createLaborEntry(entry: InsertLaborEntry): Promise<LaborEntry>;
  updateLaborEntry(id: number, entry: Partial<InsertLaborEntry>): Promise<LaborEntry>;
  deleteLaborEntry(id: number): Promise<void>;

  // Equipment Entries
  getEquipmentEntries(reportTaskId: number): Promise<EquipmentEntry[]>;
  createEquipmentEntry(entry: InsertEquipmentEntry): Promise<EquipmentEntry>;
  updateEquipmentEntry(id: number, entry: Partial<InsertEquipmentEntry>): Promise<EquipmentEntry>;
  deleteEquipmentEntry(id: number): Promise<void>;

  // Report Task Photos
  getReportTaskPhotos(reportTaskId: number): Promise<ReportTaskPhoto[]>;
  createReportTaskPhoto(photo: InsertReportTaskPhoto): Promise<ReportTaskPhoto>;
  deleteReportTaskPhoto(id: number): Promise<void>;

  // Deliveries
  getDeliveries(reportId: number): Promise<Delivery[]>;
  getDelivery(id: number): Promise<Delivery | undefined>;
  createDelivery(delivery: InsertDelivery): Promise<Delivery>;
  updateDelivery(id: number, delivery: Partial<InsertDelivery>): Promise<Delivery>;
  deleteDelivery(id: number): Promise<void>;

  // Delivery Photos
  getDeliveryPhotos(deliveryId: number): Promise<DeliveryPhoto[]>;
  createDeliveryPhoto(photo: InsertDeliveryPhoto): Promise<DeliveryPhoto>;
  deleteDeliveryPhoto(id: number): Promise<void>;

  // Communications
  getCommunications(customerId: number): Promise<Communication[]>;
  createCommunication(comm: InsertCommunication): Promise<Communication>;
  deleteCommunication(id: number): Promise<void>;

  // Schedule Entries
  getScheduleEntries(): Promise<ScheduleEntry[]>;
  getScheduleEntry(id: number): Promise<ScheduleEntry | undefined>;
  createScheduleEntry(entry: InsertScheduleEntry): Promise<ScheduleEntry>;
  updateScheduleEntry(id: number, entry: Partial<InsertScheduleEntry>): Promise<ScheduleEntry>;
  deleteScheduleEntry(id: number): Promise<void>;

  // Allocations
  getAllocations(): Promise<Allocation[]>;
  getAllocationsByScheduleEntry(scheduleEntryId: number): Promise<Allocation[]>;
  createAllocation(allocation: InsertAllocation): Promise<Allocation>;
  updateAllocation(id: number, allocation: Partial<InsertAllocation>): Promise<Allocation>;
  deleteAllocation(id: number): Promise<void>;

  // Folders & Files
  getFolders(projectId: number): Promise<Folder[]>;
  getFolder(id: number): Promise<Folder | undefined>;
  getChildFolders(projectId: number, parentId: number | null): Promise<Folder[]>;
  getFolderPath(folderId: number): Promise<Array<{ id: number; name: string }>>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  updateFolder(id: number, folder: Partial<InsertFolder>): Promise<Folder>;
  deleteFolder(id: number): Promise<void>;

  getFiles(projectId: number): Promise<FileMetadata[]>;
  getFile(id: number): Promise<FileMetadata | undefined>;
  createFile(file: InsertFileMetadata): Promise<FileMetadata>;
  updateFile(id: number, file: Partial<InsertFileMetadata>): Promise<FileMetadata>;
  deleteFile(id: number): Promise<void>;
  batchDeleteFiles(ids: number[]): Promise<void>;
  batchMoveFiles(ids: number[], folderId: number | null): Promise<void>;

  // Photo Albums
  getPhotoAlbums(projectId: number): Promise<PhotoAlbum[]>;
  getPhotoAlbum(id: number): Promise<PhotoAlbum | undefined>;
  getPhotoAlbumByName(projectId: number, name: string): Promise<PhotoAlbum | undefined>;
  getOrCreateGeneralAlbum(projectId: number): Promise<PhotoAlbum>;
  getOrCreateDailyReportAlbum(projectId: number): Promise<PhotoAlbum>;
  ensureDefaultAlbums(projectId: number): Promise<{ general: PhotoAlbum; dailyReport: PhotoAlbum }>;
  createPhotoAlbum(album: InsertPhotoAlbum): Promise<PhotoAlbum>;
  updatePhotoAlbum(id: number, album: Partial<InsertPhotoAlbum>): Promise<PhotoAlbum>;
  deletePhotoAlbum(id: number): Promise<void>;

  // Photos (separate from files/documents)
  getPhotos(projectId: number): Promise<Photo[]>;
  getPhotosPaginated(projectId: number, options: { cursor?: string; limit?: number; albumId?: number | null }): Promise<{ photos: Photo[]; nextCursor: string | null; totalCount: number; hasMore: boolean }>;
  getPhoto(id: number): Promise<Photo | undefined>;
  createPhoto(photo: InsertPhoto): Promise<Photo>;
  updatePhoto(id: number, photo: Partial<InsertPhoto>): Promise<Photo>;
  deletePhoto(id: number): Promise<void>;
  getPhotosCount(projectId: number, albumId?: number | null): Promise<number>;

  // New Daily Report Task Entries
  getDailyReportTaskEntries(reportId: number): Promise<DailyReportTaskEntry[]>;
  getDailyReportTaskEntry(id: number): Promise<DailyReportTaskEntry | undefined>;
  createDailyReportTaskEntry(entry: InsertDailyReportTaskEntry): Promise<DailyReportTaskEntry>;
  updateDailyReportTaskEntry(id: number, entry: Partial<InsertDailyReportTaskEntry>): Promise<DailyReportTaskEntry>;
  deleteDailyReportTaskEntry(id: number): Promise<void>;
  
  // Snapshot validation helpers
  getLatestDailyReportForProject(projectId: number): Promise<DailyReport | undefined>;
  getTaskSnapshotBounds(projectId: number, taskId: number, currentReportId: number, currentReportDate: Date): Promise<{ prevSnapshot: number; nextSnapshot: number }>;

  // New Daily Report Labor Lines
  getDailyReportLaborLines(taskEntryId: number): Promise<DailyReportLaborLine[]>;
  createDailyReportLaborLine(line: InsertDailyReportLaborLine): Promise<DailyReportLaborLine>;
  updateDailyReportLaborLine(id: number, line: Partial<InsertDailyReportLaborLine>): Promise<DailyReportLaborLine>;
  deleteDailyReportLaborLine(id: number): Promise<void>;

  // New Daily Report Equipment Lines
  getDailyReportEquipmentLines(taskEntryId: number): Promise<DailyReportEquipmentLine[]>;
  createDailyReportEquipmentLine(line: InsertDailyReportEquipmentLine): Promise<DailyReportEquipmentLine>;
  updateDailyReportEquipmentLine(id: number, line: Partial<InsertDailyReportEquipmentLine>): Promise<DailyReportEquipmentLine>;
  deleteDailyReportEquipmentLine(id: number): Promise<void>;

  // New Daily Report Delivery Entries
  getDailyReportDeliveryEntries(reportId: number): Promise<DailyReportDeliveryEntry[]>;
  getDailyReportDeliveryEntry(id: number): Promise<DailyReportDeliveryEntry | undefined>;
  createDailyReportDeliveryEntry(entry: InsertDailyReportDeliveryEntry): Promise<DailyReportDeliveryEntry>;
  updateDailyReportDeliveryEntry(id: number, entry: Partial<InsertDailyReportDeliveryEntry>): Promise<DailyReportDeliveryEntry>;
  deleteDailyReportDeliveryEntry(id: number): Promise<void>;

  // New Daily Report Inspection Entries
  getDailyReportInspectionEntries(reportId: number): Promise<DailyReportInspectionEntry[]>;
  getDailyReportInspectionEntry(id: number): Promise<DailyReportInspectionEntry | undefined>;
  createDailyReportInspectionEntry(entry: InsertDailyReportInspectionEntry): Promise<DailyReportInspectionEntry>;
  updateDailyReportInspectionEntry(id: number, entry: Partial<InsertDailyReportInspectionEntry>): Promise<DailyReportInspectionEntry>;
  deleteDailyReportInspectionEntry(id: number): Promise<void>;

  // New Daily Report Photos
  getDailyReportPhotos(reportId?: number, taskEntryId?: number, deliveryEntryId?: number, inspectionEntryId?: number): Promise<DailyReportPhoto[]>;
  getReportLevelPhotos(reportId: number): Promise<DailyReportPhoto[]>;
  createDailyReportPhoto(photo: InsertDailyReportPhoto): Promise<DailyReportPhoto>;
  deleteDailyReportPhoto(id: number): Promise<void>;

  // Project Email Connections
  getProjectEmailConnection(projectId: number): Promise<ProjectEmailConnection | undefined>;
  createProjectEmailConnection(conn: InsertProjectEmailConnection): Promise<ProjectEmailConnection>;
  updateProjectEmailConnection(id: number, updates: Partial<InsertProjectEmailConnection>): Promise<ProjectEmailConnection>;
  deleteProjectEmailConnection(projectId: number): Promise<void>;

  // Project Emails
  getProjectEmails(projectId: number, options?: { isInternal?: boolean; search?: string; limit?: number; offset?: number }): Promise<ProjectEmail[]>;
  getProjectEmail(id: number): Promise<ProjectEmail | undefined>;
  getProjectEmailByOutlookId(projectId: number, outlookMessageId: string): Promise<ProjectEmail | undefined>;
  createProjectEmail(email: InsertProjectEmail): Promise<ProjectEmail>;
  getProjectEmailsCount(projectId: number, isInternal?: boolean, search?: string): Promise<number>;

  // Project Email Attachments
  getProjectEmailAttachments(emailId: number): Promise<ProjectEmailAttachment[]>;
  createProjectEmailAttachment(att: InsertProjectEmailAttachment): Promise<ProjectEmailAttachment>;

  // Fingercheck Employees
  getFingercheckEmployees(): Promise<FingercheckEmployee[]>;
  getFingercheckEmployee(id: number): Promise<FingercheckEmployee | undefined>;
  getFingercheckEmployeeByEmployeeId(employeeId: number): Promise<FingercheckEmployee | undefined>;
  upsertFingercheckEmployee(employee: InsertFingercheckEmployee): Promise<FingercheckEmployee>;
  deleteFingercheckEmployee(id: number): Promise<void>;

  // Fingercheck Time Punches
  getTimePunches(filters?: { employeeId?: number; startDate?: string; endDate?: string; jobCode?: string }): Promise<FingercheckTimePunch[]>;
  upsertTimePunch(punch: InsertFingercheckTimePunch): Promise<FingercheckTimePunch>;
  deleteTimePunchesByDateRange(startDate: string, endDate: string): Promise<void>;

  // Fingercheck Project Mappings
  getProjectMappings(): Promise<FingercheckProjectMapping[]>;
  getProjectMappingsByProjectId(projectId: number): Promise<FingercheckProjectMapping[]>;
  getProjectMappingByJobCode(jobCode: string): Promise<FingercheckProjectMapping | undefined>;
  createProjectMapping(mapping: InsertFingercheckProjectMapping): Promise<FingercheckProjectMapping>;
  deleteProjectMapping(id: number): Promise<void>;

  // RFIs
  getRfis(projectId: number): Promise<Rfi[]>;
  getRfi(id: number): Promise<Rfi | undefined>;
  getNextRfiNumber(projectId: number): Promise<number>;
  createRfi(rfi: InsertRfi): Promise<Rfi>;
  updateRfi(id: number, rfi: Partial<InsertRfi>): Promise<Rfi>;
  deleteRfi(id: number): Promise<void>;

  // RFI Responses
  getRfiResponses(rfiId: number): Promise<RfiResponse[]>;
  getRfiResponseByOutlookId(outlookMessageId: string): Promise<RfiResponse | undefined>;
  createRfiResponse(response: InsertRfiResponse): Promise<RfiResponse>;

  // User Outlook Connections
  getUserOutlookConnection(userId: string): Promise<UserOutlookConnection | undefined>;
  upsertUserOutlookConnection(data: { userId: string; email: string; accessToken: string; refreshToken: string; expiresAt: Date }): Promise<UserOutlookConnection>;
  deleteUserOutlookConnection(userId: string): Promise<void>;

  // Project Daily Report Recipients
  getProjectDailyReportRecipients(projectId: number): Promise<ProjectDailyReportRecipient[]>;
  createProjectDailyReportRecipient(recipient: InsertProjectDailyReportRecipient): Promise<ProjectDailyReportRecipient>;
  deleteProjectDailyReportRecipient(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  // Authorized Users
  async getAuthorizedUsers(): Promise<AuthorizedUser[]> {
    return await db.select().from(authorizedUsers).orderBy(desc(authorizedUsers.createdAt));
  }

  async getAuthorizedUserByEmail(email: string): Promise<AuthorizedUser | undefined> {
    const [authorized] = await db.select().from(authorizedUsers).where(eq(authorizedUsers.email, email.toLowerCase()));
    return authorized;
  }

  async createAuthorizedUser(user: InsertAuthorizedUser): Promise<AuthorizedUser> {
    const [authorized] = await db.insert(authorizedUsers).values({
      ...user,
      email: user.email.toLowerCase(),
    }).returning();
    return authorized;
  }

  async updateAuthorizedUser(id: string, updates: Partial<InsertAuthorizedUser>): Promise<AuthorizedUser | undefined> {
    const [updated] = await db.update(authorizedUsers)
      .set(updates)
      .where(eq(authorizedUsers.id, id))
      .returning();
    return updated;
  }

  async deleteAuthorizedUser(id: string): Promise<void> {
    await db.delete(authorizedUsers).where(eq(authorizedUsers.id, id));
  }

  // Customers (with soft delete)
  async getCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).where(isNull(customers.deletedAt)).orderBy(customers.name);
  }
  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(and(eq(customers.id, id), isNull(customers.deletedAt)));
    return customer;
  }
  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(insertCustomer).returning();
    return customer;
  }
  async updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer> {
    const [customer] = await db.update(customers).set(updates).where(eq(customers.id, id)).returning();
    return customer;
  }
  async deleteCustomer(id: number): Promise<void> {
    await db.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, id));
  }

  // Projects (with soft delete)
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).where(isNull(projects.deletedAt)).orderBy(desc(projects.createdAt));
  }
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt)));
    return project;
  }
  async getProjectsByCustomer(customerId: number): Promise<Project[]> {
    return await db.select().from(projects).where(and(eq(projects.customerId, customerId), isNull(projects.deletedAt)));
  }
  
  async getNextProjectNumber(): Promise<string> {
    // Get the highest project number and increment
    const result = await db.select({ projectNumber: projects.projectNumber })
      .from(projects)
      .orderBy(desc(projects.projectNumber))
      .limit(1);
    
    if (result.length === 0) {
      return "S-1000"; // Starting number
    }
    
    const lastNumber = result[0].projectNumber || "S-999";
    const numPart = parseInt(lastNumber.replace("S-", ""), 10);
    return `S-${numPart + 1}`;
  }
  
  async createProject(insertProject: InsertProject): Promise<Project> {
    const projectNumber = await this.getNextProjectNumber();
    
    const [project] = await db.insert(projects).values({
      ...insertProject,
      projectNumber
    }).returning();
    
    const projectEmail = generateProjectEmailSlug(project.name, project.id);
    const [updated] = await db.update(projects)
      .set({ projectEmail })
      .where(eq(projects.id, project.id))
      .returning();
    
    await this.createDefaultFolders(project.id);
    
    return updated;
  }
  
  private async createDefaultFolders(projectId: number): Promise<void> {
    // Office folder structure
    const [officeFolder] = await db.insert(folders).values({
      projectId,
      name: "Office",
      parentId: null
    }).returning();
    
    await db.insert(folders).values([
      { projectId, name: "Takeoffs", parentId: officeFolder.id },
      { projectId, name: "Proposals", parentId: officeFolder.id },
      { projectId, name: "Supplier Quotes", parentId: officeFolder.id }
    ]);
    
    // Billing subfolder under Office
    const [billingFolder] = await db.insert(folders).values({
      projectId,
      name: "Billing",
      parentId: officeFolder.id
    }).returning();
    
    await db.insert(folders).values([
      { projectId, name: "Change Orders", parentId: billingFolder.id },
      { projectId, name: "SOV", parentId: billingFolder.id },
      { projectId, name: "REQs & Invoices", parentId: billingFolder.id }
    ]);
    
    // Field folder structure
    const [fieldFolder] = await db.insert(folders).values({
      projectId,
      name: "Field",
      parentId: null
    }).returning();
    
    await db.insert(folders).values([
      { projectId, name: "Drawings", parentId: fieldFolder.id },
      { projectId, name: "Permits & Legal", parentId: fieldFolder.id },
      { projectId, name: "Submittals", parentId: fieldFolder.id },
      { projectId, name: "RFI's", parentId: fieldFolder.id }
    ]);
  }
  async updateProject(id: number, updates: Partial<InsertProject>): Promise<Project> {
    const [project] = await db.update(projects).set(updates).where(eq(projects.id, id)).returning();
    return project;
  }
  async deleteProject(id: number): Promise<void> {
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, id));
  }

  async getProjectByEmail(email: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.projectEmail, email), isNull(projects.deletedAt)));
    return project;
  }

  async backfillProjectEmails(): Promise<{ id: number; name: string; projectEmail: string }[]> {
    const allProjects = await db.select().from(projects)
      .where(and(
        isNull(projects.deletedAt),
        or(
          isNull(projects.projectEmail),
          sql`${projects.projectEmail} = ''`,
          sql`${projects.projectEmail} NOT LIKE '%@${sql.raw(PROJECT_EMAIL_DOMAIN)}'`
        )
      ));

    const updated: { id: number; name: string; projectEmail: string }[] = [];

    for (const project of allProjects) {
      const email = generateProjectEmailSlug(project.name, project.id);
      await db.update(projects)
        .set({ projectEmail: email })
        .where(eq(projects.id, project.id));
      updated.push({ id: project.id, name: project.name, projectEmail: email });
    }

    return updated;
  }

  // Tasks (with soft delete)
  async getTasks(projectId?: number): Promise<Task[]> {
    if (projectId) {
      return await db.select().from(tasks).where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))).orderBy(tasks.scheduledDate);
    }
    return await db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(tasks.scheduledDate);
  }
  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
    return task;
  }
  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(insertTask).returning();
    return task;
  }
  async updateTask(id: number, updates: Partial<InsertTask>): Promise<Task> {
    const [task] = await db.update(tasks).set(updates).where(eq(tasks.id, id)).returning();
    return task;
  }
  async deleteTask(id: number): Promise<void> {
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, id));
  }

  // Billing
  async getCompletedTasksForBilling(): Promise<(Task & { projectName: string })[]> {
    const result = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        description: tasks.description,
        scheduledDate: tasks.scheduledDate,
        dueDate: tasks.dueDate,
        status: tasks.status,
        priority: tasks.priority,
        percentComplete: tasks.percentComplete,
        estimatedHours: tasks.estimatedHours,
        assignedTo: tasks.assignedTo,
        completedAt: tasks.completedAt,
        billedAt: tasks.billedAt,
        billedBy: tasks.billedBy,
        createdAt: tasks.createdAt,
        deletedAt: tasks.deletedAt,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.percentComplete, 100),
          isNull(tasks.deletedAt),
          isNull(projects.deletedAt)
        )
      )
      .orderBy(desc(tasks.completedAt));
    return result;
  }

  async markTaskBilled(taskId: number, billedBy: string): Promise<Task> {
    const [task] = await db.update(tasks).set({ billedAt: new Date(), billedBy }).where(eq(tasks.id, taskId)).returning();
    return task;
  }

  async markTaskUnbilled(taskId: number): Promise<Task> {
    const [task] = await db.update(tasks).set({ billedAt: null, billedBy: null }).where(eq(tasks.id, taskId)).returning();
    return task;
  }

  async bulkMarkTasksBilled(taskIds: number[], billedBy: string): Promise<void> {
    if (taskIds.length === 0) return;
    await db.update(tasks).set({ billedAt: new Date(), billedBy }).where(
      and(
        sql`${tasks.id} = ANY(${taskIds})`,
        isNull(tasks.billedAt)
      )
    );
  }

  // Task Status History
  async getTaskStatusHistory(taskId: number): Promise<TaskStatusHistory[]> {
    return db.select().from(taskStatusHistory).where(eq(taskStatusHistory.taskId, taskId)).orderBy(desc(taskStatusHistory.changedAt));
  }
  async createTaskStatusHistory(history: InsertTaskStatusHistory): Promise<TaskStatusHistory> {
    const [record] = await db.insert(taskStatusHistory).values(history).returning();
    return record;
  }

  // Equipment (with soft delete)
  async getEquipmentList(): Promise<Equipment[]> {
    return await db.select().from(equipment).where(isNull(equipment.deletedAt)).orderBy(equipment.type, equipment.name);
  }
  async getEquipment(id: number): Promise<Equipment | undefined> {
    const [item] = await db.select().from(equipment).where(and(eq(equipment.id, id), isNull(equipment.deletedAt)));
    return item;
  }
  async createEquipment(insertEquipment: InsertEquipment): Promise<Equipment> {
    const [item] = await db.insert(equipment).values(insertEquipment).returning();
    return item;
  }
  async updateEquipment(id: number, updates: Partial<InsertEquipment>): Promise<Equipment> {
    const [item] = await db.update(equipment).set(updates).where(eq(equipment.id, id)).returning();
    return item;
  }
  async deleteEquipment(id: number): Promise<void> {
    await db.update(equipment).set({ deletedAt: new Date() }).where(eq(equipment.id, id));
  }

  // Maintenance Logs (with soft delete)
  async getMaintenanceLogs(equipmentId: number): Promise<MaintenanceLog[]> {
    return await db.select().from(maintenanceLogs).where(and(eq(maintenanceLogs.equipmentId, equipmentId), isNull(maintenanceLogs.deletedAt))).orderBy(desc(maintenanceLogs.performedDate));
  }
  async createMaintenanceLog(insertLog: InsertMaintenanceLog): Promise<MaintenanceLog> {
    const [log] = await db.insert(maintenanceLogs).values(insertLog).returning();
    return log;
  }
  async deleteMaintenanceLog(id: number): Promise<void> {
    await db.update(maintenanceLogs).set({ deletedAt: new Date() }).where(eq(maintenanceLogs.id, id));
  }

  // Daily Reports (with soft delete)
  async getDailyReports(projectId: number): Promise<DailyReport[]> {
    return await db.select().from(dailyReports).where(and(eq(dailyReports.projectId, projectId), isNull(dailyReports.deletedAt))).orderBy(desc(dailyReports.reportDate), desc(dailyReports.updatedAt));
  }
  async getDailyReport(id: number): Promise<DailyReport | undefined> {
    const [report] = await db.select().from(dailyReports).where(and(eq(dailyReports.id, id), isNull(dailyReports.deletedAt)));
    return report;
  }
  async getDailyReportByDate(projectId: number, reportDate: string): Promise<DailyReport | undefined> {
    const [report] = await db.select().from(dailyReports).where(
      and(eq(dailyReports.projectId, projectId), eq(dailyReports.reportDate, reportDate), isNull(dailyReports.deletedAt))
    );
    return report;
  }
  async createDailyReport(insertReport: InsertDailyReport): Promise<DailyReport> {
    const [report] = await db.insert(dailyReports).values(insertReport).returning();
    return report;
  }
  async updateDailyReport(id: number, updates: Partial<InsertDailyReport>): Promise<DailyReport> {
    const [report] = await db.update(dailyReports).set({ ...updates, updatedAt: new Date() }).where(eq(dailyReports.id, id)).returning();
    return report;
  }
  async deleteDailyReport(id: number): Promise<void> {
    await db.update(dailyReports).set({ deletedAt: new Date() }).where(eq(dailyReports.id, id));
  }

  // Report Tasks
  async getReportTasks(reportId: number): Promise<ReportTask[]> {
    return await db.select().from(reportTasks).where(eq(reportTasks.reportId, reportId)).orderBy(asc(reportTasks.id));
  }
  async getReportTask(id: number): Promise<ReportTask | undefined> {
    const [task] = await db.select().from(reportTasks).where(eq(reportTasks.id, id));
    return task;
  }
  async createReportTask(task: InsertReportTask): Promise<ReportTask> {
    const [record] = await db.insert(reportTasks).values(task).returning();
    return record;
  }
  async updateReportTask(id: number, updates: Partial<InsertReportTask>): Promise<ReportTask> {
    const [record] = await db.update(reportTasks).set(updates).where(eq(reportTasks.id, id)).returning();
    return record;
  }
  async deleteReportTask(id: number): Promise<void> {
    // Delete associated labor and equipment entries first
    await db.delete(laborEntries).where(eq(laborEntries.reportTaskId, id));
    await db.delete(equipmentEntries).where(eq(equipmentEntries.reportTaskId, id));
    await db.delete(reportTaskPhotos).where(eq(reportTaskPhotos.reportTaskId, id));
    await db.delete(reportTasks).where(eq(reportTasks.id, id));
  }

  // Labor Entries
  async getLaborEntries(reportTaskId: number): Promise<LaborEntry[]> {
    return await db.select().from(laborEntries).where(eq(laborEntries.reportTaskId, reportTaskId)).orderBy(asc(laborEntries.id));
  }
  async createLaborEntry(entry: InsertLaborEntry): Promise<LaborEntry> {
    const [record] = await db.insert(laborEntries).values(entry).returning();
    return record;
  }
  async updateLaborEntry(id: number, updates: Partial<InsertLaborEntry>): Promise<LaborEntry> {
    const [record] = await db.update(laborEntries).set(updates).where(eq(laborEntries.id, id)).returning();
    return record;
  }
  async deleteLaborEntry(id: number): Promise<void> {
    await db.delete(laborEntries).where(eq(laborEntries.id, id));
  }

  // Equipment Entries
  async getEquipmentEntries(reportTaskId: number): Promise<EquipmentEntry[]> {
    return await db.select().from(equipmentEntries).where(eq(equipmentEntries.reportTaskId, reportTaskId)).orderBy(asc(equipmentEntries.id));
  }
  async createEquipmentEntry(entry: InsertEquipmentEntry): Promise<EquipmentEntry> {
    const [record] = await db.insert(equipmentEntries).values(entry).returning();
    return record;
  }
  async updateEquipmentEntry(id: number, updates: Partial<InsertEquipmentEntry>): Promise<EquipmentEntry> {
    const [record] = await db.update(equipmentEntries).set(updates).where(eq(equipmentEntries.id, id)).returning();
    return record;
  }
  async deleteEquipmentEntry(id: number): Promise<void> {
    await db.delete(equipmentEntries).where(eq(equipmentEntries.id, id));
  }

  // Report Task Photos
  async getReportTaskPhotos(reportTaskId: number): Promise<ReportTaskPhoto[]> {
    return await db.select().from(reportTaskPhotos).where(eq(reportTaskPhotos.reportTaskId, reportTaskId)).orderBy(asc(reportTaskPhotos.id));
  }
  async createReportTaskPhoto(photo: InsertReportTaskPhoto): Promise<ReportTaskPhoto> {
    const [record] = await db.insert(reportTaskPhotos).values(photo).returning();
    return record;
  }
  async deleteReportTaskPhoto(id: number): Promise<void> {
    await db.delete(reportTaskPhotos).where(eq(reportTaskPhotos.id, id));
  }

  // Deliveries
  async getDeliveries(reportId: number): Promise<Delivery[]> {
    return await db.select().from(deliveries).where(eq(deliveries.reportId, reportId)).orderBy(asc(deliveries.id));
  }
  async getDelivery(id: number): Promise<Delivery | undefined> {
    const [delivery] = await db.select().from(deliveries).where(eq(deliveries.id, id));
    return delivery;
  }
  async createDelivery(delivery: InsertDelivery): Promise<Delivery> {
    const [record] = await db.insert(deliveries).values(delivery).returning();
    return record;
  }
  async updateDelivery(id: number, updates: Partial<InsertDelivery>): Promise<Delivery> {
    const [record] = await db.update(deliveries).set(updates).where(eq(deliveries.id, id)).returning();
    return record;
  }
  async deleteDelivery(id: number): Promise<void> {
    await db.delete(deliveryPhotos).where(eq(deliveryPhotos.deliveryId, id));
    await db.delete(deliveries).where(eq(deliveries.id, id));
  }

  // Delivery Photos
  async getDeliveryPhotos(deliveryId: number): Promise<DeliveryPhoto[]> {
    return await db.select().from(deliveryPhotos).where(eq(deliveryPhotos.deliveryId, deliveryId)).orderBy(asc(deliveryPhotos.id));
  }
  async createDeliveryPhoto(photo: InsertDeliveryPhoto): Promise<DeliveryPhoto> {
    const [record] = await db.insert(deliveryPhotos).values(photo).returning();
    return record;
  }
  async deleteDeliveryPhoto(id: number): Promise<void> {
    await db.delete(deliveryPhotos).where(eq(deliveryPhotos.id, id));
  }

  // Communications (with soft delete)
  async getCommunications(customerId: number): Promise<Communication[]> {
    return await db.select().from(communications).where(and(eq(communications.customerId, customerId), isNull(communications.deletedAt))).orderBy(desc(communications.contactDate));
  }
  async createCommunication(insertComm: InsertCommunication): Promise<Communication> {
    const [comm] = await db.insert(communications).values(insertComm).returning();
    return comm;
  }
  async deleteCommunication(id: number): Promise<void> {
    await db.update(communications).set({ deletedAt: new Date() }).where(eq(communications.id, id));
  }

  // Schedule Entries (with soft delete)
  async getScheduleEntries(): Promise<ScheduleEntry[]> {
    return await db.select().from(scheduleEntries).where(isNull(scheduleEntries.deletedAt)).orderBy(scheduleEntries.startDate);
  }
  async getScheduleEntry(id: number): Promise<ScheduleEntry | undefined> {
    const [entry] = await db.select().from(scheduleEntries).where(and(eq(scheduleEntries.id, id), isNull(scheduleEntries.deletedAt)));
    return entry;
  }
  async createScheduleEntry(entry: InsertScheduleEntry): Promise<ScheduleEntry> {
    const [created] = await db.insert(scheduleEntries).values(entry).returning();
    return created;
  }
  async updateScheduleEntry(id: number, updates: Partial<InsertScheduleEntry>): Promise<ScheduleEntry> {
    const [updated] = await db.update(scheduleEntries).set(updates).where(eq(scheduleEntries.id, id)).returning();
    return updated;
  }
  async deleteScheduleEntry(id: number): Promise<void> {
    await db.update(scheduleEntries).set({ deletedAt: new Date() }).where(eq(scheduleEntries.id, id));
  }

  // Allocations (with soft delete)
  async getAllocations(): Promise<Allocation[]> {
    return await db.select().from(allocations).where(isNull(allocations.deletedAt)).orderBy(allocations.startDate);
  }
  async getAllocationsByScheduleEntry(scheduleEntryId: number): Promise<Allocation[]> {
    return await db.select().from(allocations).where(and(eq(allocations.scheduleEntryId, scheduleEntryId), isNull(allocations.deletedAt)));
  }
  async createAllocation(insertAllocation: InsertAllocation): Promise<Allocation> {
    const [allocation] = await db.insert(allocations).values(insertAllocation).returning();
    return allocation;
  }
  async updateAllocation(id: number, updates: Partial<InsertAllocation>): Promise<Allocation> {
    const [allocation] = await db.update(allocations).set(updates).where(eq(allocations.id, id)).returning();
    return allocation;
  }
  async deleteAllocation(id: number): Promise<void> {
    await db.update(allocations).set({ deletedAt: new Date() }).where(eq(allocations.id, id));
  }

  // Folders (with soft delete)
  async getFolders(projectId: number): Promise<Folder[]> {
    return await db.select().from(folders).where(and(eq(folders.projectId, projectId), isNull(folders.deletedAt))).orderBy(asc(folders.id));
  }
  async getFolder(id: number): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(and(eq(folders.id, id), isNull(folders.deletedAt)));
    return folder;
  }
  async getChildFolders(projectId: number, parentId: number | null): Promise<Folder[]> {
    if (parentId === null) {
      return await db.select().from(folders).where(
        and(eq(folders.projectId, projectId), isNull(folders.parentId), isNull(folders.deletedAt))
      ).orderBy(asc(folders.id));
    }
    return await db.select().from(folders).where(
      and(eq(folders.projectId, projectId), eq(folders.parentId, parentId), isNull(folders.deletedAt))
    ).orderBy(asc(folders.id));
  }
  async getFolderPath(folderId: number): Promise<Array<{ id: number; name: string }>> {
    const path: Array<{ id: number; name: string }> = [];
    let currentId: number | null = folderId;
    
    while (currentId !== null) {
      const folder = await this.getFolder(currentId);
      if (!folder) break;
      path.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parentId;
    }
    
    return path;
  }
  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    const [folder] = await db.insert(folders).values(insertFolder).returning();
    return folder;
  }
  async updateFolder(id: number, updates: Partial<InsertFolder>): Promise<Folder> {
    const [folder] = await db.update(folders).set(updates).where(eq(folders.id, id)).returning();
    return folder;
  }
  async deleteFolder(id: number): Promise<void> {
    await db.update(folders).set({ deletedAt: new Date() }).where(eq(folders.id, id));
  }
  async batchDeleteFiles(ids: number[]): Promise<void> {
    for (const id of ids) {
      await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
    }
  }
  async batchMoveFiles(ids: number[], folderId: number | null): Promise<void> {
    for (const id of ids) {
      await db.update(files).set({ folderId }).where(eq(files.id, id));
    }
  }

  // Files (with soft delete)
  async getFiles(projectId: number): Promise<FileMetadata[]> {
    return await db.select().from(files).where(and(eq(files.projectId, projectId), isNull(files.deletedAt))).orderBy(asc(files.id));
  }
  async getFile(id: number): Promise<FileMetadata | undefined> {
    const [file] = await db.select().from(files).where(and(eq(files.id, id), isNull(files.deletedAt)));
    return file;
  }
  async createFile(insertFile: InsertFileMetadata): Promise<FileMetadata> {
    const [file] = await db.insert(files).values(insertFile).returning();
    return file;
  }
  async updateFile(id: number, updates: Partial<InsertFileMetadata>): Promise<FileMetadata> {
    const [file] = await db.update(files).set(updates).where(eq(files.id, id)).returning();
    return file;
  }
  async deleteFile(id: number): Promise<void> {
    await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
  }

  // Photo Albums (with soft delete)
  async getPhotoAlbums(projectId: number): Promise<PhotoAlbum[]> {
    return await db.select().from(photoAlbums).where(and(eq(photoAlbums.projectId, projectId), isNull(photoAlbums.deletedAt))).orderBy(desc(photoAlbums.createdAt));
  }
  async getPhotoAlbum(id: number): Promise<PhotoAlbum | undefined> {
    const [album] = await db.select().from(photoAlbums).where(and(eq(photoAlbums.id, id), isNull(photoAlbums.deletedAt)));
    return album;
  }
  async getPhotoAlbumByName(projectId: number, name: string): Promise<PhotoAlbum | undefined> {
    const [album] = await db.select().from(photoAlbums)
      .where(and(eq(photoAlbums.projectId, projectId), eq(photoAlbums.name, name), isNull(photoAlbums.deletedAt)));
    return album;
  }
  async getOrCreateGeneralAlbum(projectId: number): Promise<PhotoAlbum> {
    const albumName = "General";
    let album = await this.getPhotoAlbumByName(projectId, albumName);
    if (!album) {
      album = await this.createPhotoAlbum({ projectId, name: albumName });
    }
    return album;
  }
  async getOrCreateDailyReportAlbum(projectId: number): Promise<PhotoAlbum> {
    const albumName = "Daily Report Photos";
    let album = await this.getPhotoAlbumByName(projectId, albumName);
    if (!album) {
      album = await this.createPhotoAlbum({ projectId, name: albumName });
    }
    return album;
  }
  async ensureDefaultAlbums(projectId: number): Promise<{ general: PhotoAlbum; dailyReport: PhotoAlbum }> {
    const general = await this.getOrCreateGeneralAlbum(projectId);
    const dailyReport = await this.getOrCreateDailyReportAlbum(projectId);
    return { general, dailyReport };
  }
  async createPhotoAlbum(insertAlbum: InsertPhotoAlbum): Promise<PhotoAlbum> {
    const [album] = await db.insert(photoAlbums).values(insertAlbum).returning();
    return album;
  }
  async updatePhotoAlbum(id: number, updates: Partial<InsertPhotoAlbum>): Promise<PhotoAlbum> {
    const [album] = await db.update(photoAlbums).set(updates).where(eq(photoAlbums.id, id)).returning();
    return album;
  }
  async deletePhotoAlbum(id: number): Promise<void> {
    await db.update(photoAlbums).set({ deletedAt: new Date() }).where(eq(photoAlbums.id, id));
  }

  // Photos (separate from files/documents)
  async getPhotos(projectId: number): Promise<Photo[]> {
    return await db.select().from(photos)
      .where(and(eq(photos.projectId, projectId), isNull(photos.deletedAt)))
      .orderBy(desc(photos.displayDate));
  }

  async getPhotosPaginated(projectId: number, options: { cursor?: string; limit?: number; albumId?: number | null }): Promise<{ photos: Photo[]; nextCursor: string | null; totalCount: number; hasMore: boolean }> {
    const limit = options.limit || 50;
    const conditions = [eq(photos.projectId, projectId), isNull(photos.deletedAt)];
    
    if (options.albumId !== undefined && options.albumId !== null) {
      conditions.push(eq(photos.albumId, options.albumId));
    }

    if (options.cursor) {
      const cursorDate = new Date(options.cursor);
      conditions.push(sql`${photos.displayDate} < ${cursorDate}`);
    }

    const results = await db.select().from(photos)
      .where(and(...conditions))
      .orderBy(desc(photos.displayDate))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const photosResult = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore && photosResult.length > 0 
      ? photosResult[photosResult.length - 1].displayDate?.toISOString() || null
      : null;

    const countConditions = [eq(photos.projectId, projectId), isNull(photos.deletedAt)];
    if (options.albumId !== undefined && options.albumId !== null) {
      countConditions.push(eq(photos.albumId, options.albumId));
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(photos).where(and(...countConditions));

    return {
      photos: photosResult,
      nextCursor,
      totalCount: Number(count),
      hasMore,
    };
  }

  async getPhoto(id: number): Promise<Photo | undefined> {
    const [photo] = await db.select().from(photos).where(and(eq(photos.id, id), isNull(photos.deletedAt)));
    return photo;
  }

  async createPhoto(photo: InsertPhoto): Promise<Photo> {
    const displayDate = photo.takenAt || new Date();
    const [record] = await db.insert(photos).values({ ...photo, displayDate }).returning();
    return record;
  }

  async updatePhoto(id: number, updates: Partial<InsertPhoto>): Promise<Photo> {
    const [record] = await db.update(photos).set(updates).where(eq(photos.id, id)).returning();
    return record;
  }

  async deletePhoto(id: number): Promise<void> {
    await db.update(photos).set({ deletedAt: new Date() }).where(eq(photos.id, id));
  }

  async getPhotosCount(projectId: number, albumId?: number | null): Promise<number> {
    const conditions = [eq(photos.projectId, projectId), isNull(photos.deletedAt)];
    if (albumId !== undefined && albumId !== null) {
      conditions.push(eq(photos.albumId, albumId));
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(photos).where(and(...conditions));
    return Number(count);
  }

  // New Daily Report Task Entries (with soft delete)
  async getDailyReportTaskEntries(reportId: number): Promise<DailyReportTaskEntry[]> {
    return await db.select().from(dailyReportTaskEntries).where(and(eq(dailyReportTaskEntries.reportId, reportId), isNull(dailyReportTaskEntries.deletedAt))).orderBy(asc(dailyReportTaskEntries.id));
  }
  async getDailyReportTaskEntry(id: number): Promise<DailyReportTaskEntry | undefined> {
    const [entry] = await db.select().from(dailyReportTaskEntries).where(and(eq(dailyReportTaskEntries.id, id), isNull(dailyReportTaskEntries.deletedAt)));
    return entry;
  }
  async createDailyReportTaskEntry(entry: InsertDailyReportTaskEntry): Promise<DailyReportTaskEntry> {
    const [record] = await db.insert(dailyReportTaskEntries).values(entry).returning();
    return record;
  }
  async updateDailyReportTaskEntry(id: number, updates: Partial<InsertDailyReportTaskEntry>): Promise<DailyReportTaskEntry> {
    const [record] = await db.update(dailyReportTaskEntries).set(updates).where(eq(dailyReportTaskEntries.id, id)).returning();
    return record;
  }
  async deleteDailyReportTaskEntry(id: number): Promise<void> {
    // Soft delete associated labor and equipment lines first
    await db.update(dailyReportLaborLines).set({ deletedAt: new Date() }).where(eq(dailyReportLaborLines.taskEntryId, id));
    await db.update(dailyReportEquipmentLines).set({ deletedAt: new Date() }).where(eq(dailyReportEquipmentLines.taskEntryId, id));
    await db.update(dailyReportPhotos).set({ deletedAt: new Date() }).where(eq(dailyReportPhotos.taskEntryId, id));
    await db.update(dailyReportTaskEntries).set({ deletedAt: new Date() }).where(eq(dailyReportTaskEntries.id, id));
  }

  // New Daily Report Labor Lines (with soft delete)
  async getDailyReportLaborLines(taskEntryId: number): Promise<DailyReportLaborLine[]> {
    return await db.select().from(dailyReportLaborLines).where(and(eq(dailyReportLaborLines.taskEntryId, taskEntryId), isNull(dailyReportLaborLines.deletedAt))).orderBy(asc(dailyReportLaborLines.id));
  }
  async createDailyReportLaborLine(line: InsertDailyReportLaborLine): Promise<DailyReportLaborLine> {
    const [record] = await db.insert(dailyReportLaborLines).values(line).returning();
    return record;
  }
  async updateDailyReportLaborLine(id: number, updates: Partial<InsertDailyReportLaborLine>): Promise<DailyReportLaborLine> {
    const [record] = await db.update(dailyReportLaborLines).set(updates).where(eq(dailyReportLaborLines.id, id)).returning();
    return record;
  }
  async deleteDailyReportLaborLine(id: number): Promise<void> {
    await db.update(dailyReportLaborLines).set({ deletedAt: new Date() }).where(eq(dailyReportLaborLines.id, id));
  }

  // New Daily Report Equipment Lines (with soft delete)
  async getDailyReportEquipmentLines(taskEntryId: number): Promise<DailyReportEquipmentLine[]> {
    return await db.select().from(dailyReportEquipmentLines).where(and(eq(dailyReportEquipmentLines.taskEntryId, taskEntryId), isNull(dailyReportEquipmentLines.deletedAt))).orderBy(asc(dailyReportEquipmentLines.id));
  }
  async createDailyReportEquipmentLine(line: InsertDailyReportEquipmentLine): Promise<DailyReportEquipmentLine> {
    const [record] = await db.insert(dailyReportEquipmentLines).values(line).returning();
    return record;
  }
  async updateDailyReportEquipmentLine(id: number, updates: Partial<InsertDailyReportEquipmentLine>): Promise<DailyReportEquipmentLine> {
    const [record] = await db.update(dailyReportEquipmentLines).set(updates).where(eq(dailyReportEquipmentLines.id, id)).returning();
    return record;
  }
  async deleteDailyReportEquipmentLine(id: number): Promise<void> {
    await db.update(dailyReportEquipmentLines).set({ deletedAt: new Date() }).where(eq(dailyReportEquipmentLines.id, id));
  }

  // New Daily Report Delivery Entries (with soft delete)
  async getDailyReportDeliveryEntries(reportId: number): Promise<DailyReportDeliveryEntry[]> {
    return await db.select().from(dailyReportDeliveryEntries).where(and(eq(dailyReportDeliveryEntries.reportId, reportId), isNull(dailyReportDeliveryEntries.deletedAt))).orderBy(asc(dailyReportDeliveryEntries.id));
  }
  async getDailyReportDeliveryEntry(id: number): Promise<DailyReportDeliveryEntry | undefined> {
    const [entry] = await db.select().from(dailyReportDeliveryEntries).where(and(eq(dailyReportDeliveryEntries.id, id), isNull(dailyReportDeliveryEntries.deletedAt)));
    return entry;
  }
  async createDailyReportDeliveryEntry(entry: InsertDailyReportDeliveryEntry): Promise<DailyReportDeliveryEntry> {
    const [record] = await db.insert(dailyReportDeliveryEntries).values(entry).returning();
    return record;
  }
  async updateDailyReportDeliveryEntry(id: number, updates: Partial<InsertDailyReportDeliveryEntry>): Promise<DailyReportDeliveryEntry> {
    const [record] = await db.update(dailyReportDeliveryEntries).set(updates).where(eq(dailyReportDeliveryEntries.id, id)).returning();
    return record;
  }
  async deleteDailyReportDeliveryEntry(id: number): Promise<void> {
    await db.update(dailyReportPhotos).set({ deletedAt: new Date() }).where(eq(dailyReportPhotos.deliveryEntryId, id));
    await db.update(dailyReportDeliveryEntries).set({ deletedAt: new Date() }).where(eq(dailyReportDeliveryEntries.id, id));
  }

  // New Daily Report Inspection Entries (with soft delete)
  async getDailyReportInspectionEntries(reportId: number): Promise<DailyReportInspectionEntry[]> {
    return await db.select().from(dailyReportInspectionEntries).where(and(eq(dailyReportInspectionEntries.reportId, reportId), isNull(dailyReportInspectionEntries.deletedAt))).orderBy(asc(dailyReportInspectionEntries.id));
  }
  async getDailyReportInspectionEntry(id: number): Promise<DailyReportInspectionEntry | undefined> {
    const [entry] = await db.select().from(dailyReportInspectionEntries).where(and(eq(dailyReportInspectionEntries.id, id), isNull(dailyReportInspectionEntries.deletedAt)));
    return entry;
  }
  async createDailyReportInspectionEntry(entry: InsertDailyReportInspectionEntry): Promise<DailyReportInspectionEntry> {
    const [record] = await db.insert(dailyReportInspectionEntries).values(entry).returning();
    return record;
  }
  async updateDailyReportInspectionEntry(id: number, updates: Partial<InsertDailyReportInspectionEntry>): Promise<DailyReportInspectionEntry> {
    const [record] = await db.update(dailyReportInspectionEntries).set(updates).where(eq(dailyReportInspectionEntries.id, id)).returning();
    return record;
  }
  async deleteDailyReportInspectionEntry(id: number): Promise<void> {
    await db.update(dailyReportPhotos).set({ deletedAt: new Date() }).where(eq(dailyReportPhotos.inspectionEntryId, id));
    await db.update(dailyReportInspectionEntries).set({ deletedAt: new Date() }).where(eq(dailyReportInspectionEntries.id, id));
  }

  // New Daily Report Photos (with soft delete)
  async getDailyReportPhotos(reportId?: number, taskEntryId?: number, deliveryEntryId?: number, inspectionEntryId?: number): Promise<DailyReportPhoto[]> {
    if (taskEntryId) {
      return await db.select().from(dailyReportPhotos).where(and(eq(dailyReportPhotos.taskEntryId, taskEntryId), isNull(dailyReportPhotos.deletedAt))).orderBy(asc(dailyReportPhotos.id));
    }
    if (deliveryEntryId) {
      return await db.select().from(dailyReportPhotos).where(and(eq(dailyReportPhotos.deliveryEntryId, deliveryEntryId), isNull(dailyReportPhotos.deletedAt))).orderBy(asc(dailyReportPhotos.id));
    }
    if (inspectionEntryId) {
      return await db.select().from(dailyReportPhotos).where(and(eq(dailyReportPhotos.inspectionEntryId, inspectionEntryId), isNull(dailyReportPhotos.deletedAt))).orderBy(asc(dailyReportPhotos.id));
    }
    if (reportId) {
      return await db.select().from(dailyReportPhotos).where(and(eq(dailyReportPhotos.reportId, reportId), isNull(dailyReportPhotos.deletedAt))).orderBy(asc(dailyReportPhotos.id));
    }
    return [];
  }
  async getReportLevelPhotos(reportId: number): Promise<DailyReportPhoto[]> {
    return await db.select().from(dailyReportPhotos).where(
      and(
        eq(dailyReportPhotos.reportId, reportId),
        isNull(dailyReportPhotos.taskEntryId),
        isNull(dailyReportPhotos.deliveryEntryId),
        isNull(dailyReportPhotos.inspectionEntryId),
        isNull(dailyReportPhotos.deletedAt)
      )
    ).orderBy(asc(dailyReportPhotos.id));
  }
  async createDailyReportPhoto(photo: InsertDailyReportPhoto): Promise<DailyReportPhoto> {
    const [record] = await db.insert(dailyReportPhotos).values(photo).returning();
    return record;
  }
  async deleteDailyReportPhoto(id: number): Promise<void> {
    await db.update(dailyReportPhotos).set({ deletedAt: new Date() }).where(eq(dailyReportPhotos.id, id));
  }

  // Snapshot validation helpers (with soft delete filtering)
  async getLatestDailyReportForProject(projectId: number): Promise<DailyReport | undefined> {
    // Get the latest report by reportDate, then by updatedAt as tie-breaker
    const [report] = await db
      .select()
      .from(dailyReports)
      .where(and(eq(dailyReports.projectId, projectId), isNull(dailyReports.deletedAt)))
      .orderBy(desc(dailyReports.reportDate), desc(dailyReports.updatedAt))
      .limit(1);
    return report;
  }

  async getTaskSnapshotBounds(
    projectId: number, 
    taskId: number, 
    currentReportId: number, 
    currentReportDate: Date
  ): Promise<{ prevSnapshot: number; nextSnapshot: number }> {
    // Get all reports for this project containing this task, ordered by date (excluding soft-deleted)
    const reportsWithTask = await db
      .select({
        reportId: dailyReports.id,
        reportDate: dailyReports.reportDate,
        updatedAt: dailyReports.updatedAt,
        percentComplete: dailyReportTaskEntries.percentComplete,
      })
      .from(dailyReports)
      .innerJoin(dailyReportTaskEntries, eq(dailyReportTaskEntries.reportId, dailyReports.id))
      .where(
        and(
          eq(dailyReports.projectId, projectId),
          eq(dailyReportTaskEntries.taskId, taskId),
          isNull(dailyReports.deletedAt),
          isNull(dailyReportTaskEntries.deletedAt)
        )
      )
      .orderBy(dailyReports.reportDate, dailyReports.updatedAt);

    // Find bounds based on time ordering
    let prevSnapshot = 0;
    let nextSnapshot = 100;

    for (let i = 0; i < reportsWithTask.length; i++) {
      const report = reportsWithTask[i];
      if (report.reportId === currentReportId) continue;

      const reportTime = new Date(report.reportDate).getTime();
      const currentTime = new Date(currentReportDate).getTime();
      
      if (reportTime < currentTime || (reportTime === currentTime && new Date(report.updatedAt!).getTime() < new Date(currentReportDate).getTime())) {
        // This is an earlier report
        prevSnapshot = Math.max(prevSnapshot, report.percentComplete);
      } else {
        // This is a later report
        nextSnapshot = Math.min(nextSnapshot, report.percentComplete);
      }
    }

    return { prevSnapshot, nextSnapshot };
  }

  // Project Email Connections
  async getProjectEmailConnection(projectId: number): Promise<ProjectEmailConnection | undefined> {
    const [conn] = await db.select().from(projectEmailConnections).where(eq(projectEmailConnections.projectId, projectId));
    return conn;
  }

  async createProjectEmailConnection(conn: InsertProjectEmailConnection): Promise<ProjectEmailConnection> {
    const [result] = await db.insert(projectEmailConnections).values(conn).returning();
    return result;
  }

  async updateProjectEmailConnection(id: number, updates: Partial<InsertProjectEmailConnection>): Promise<ProjectEmailConnection> {
    const [result] = await db.update(projectEmailConnections).set(updates).where(eq(projectEmailConnections.id, id)).returning();
    return result;
  }

  async deleteProjectEmailConnection(projectId: number): Promise<void> {
    await db.delete(projectEmailConnections).where(eq(projectEmailConnections.projectId, projectId));
  }

  // Project Emails
  async getProjectEmails(projectId: number, options?: { isInternal?: boolean; search?: string; limit?: number; offset?: number }): Promise<ProjectEmail[]> {
    const conditions = [eq(projectEmails.projectId, projectId)];

    if (options?.isInternal !== undefined) {
      conditions.push(eq(projectEmails.isInternal, options.isInternal));
    }

    if (options?.search) {
      const pattern = `%${options.search}%`;
      conditions.push(
        or(
          ilike(projectEmails.subject, pattern),
          ilike(projectEmails.fromEmail, pattern),
          ilike(projectEmails.fromName, pattern)
        )!
      );
    }

    return await db.select().from(projectEmails)
      .where(and(...conditions))
      .orderBy(desc(projectEmails.receivedAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  }

  async getProjectEmail(id: number): Promise<ProjectEmail | undefined> {
    const [email] = await db.select().from(projectEmails).where(eq(projectEmails.id, id));
    return email;
  }

  async getProjectEmailByOutlookId(projectId: number, outlookMessageId: string): Promise<ProjectEmail | undefined> {
    const [email] = await db.select().from(projectEmails).where(
      and(eq(projectEmails.projectId, projectId), eq(projectEmails.outlookMessageId, outlookMessageId))
    );
    return email;
  }

  async createProjectEmail(email: InsertProjectEmail): Promise<ProjectEmail> {
    const [result] = await db.insert(projectEmails).values(email).returning();
    return result;
  }

  async getProjectEmailsCount(projectId: number, isInternal?: boolean, search?: string): Promise<number> {
    const conditions = [eq(projectEmails.projectId, projectId)];
    if (isInternal !== undefined) {
      conditions.push(eq(projectEmails.isInternal, isInternal));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(projectEmails.subject, pattern),
          ilike(projectEmails.fromEmail, pattern),
          ilike(projectEmails.fromName, pattern)
        )!
      );
    }
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(projectEmails).where(and(...conditions));
    return Number(result.count);
  }

  // Project Email Attachments
  async getProjectEmailAttachments(emailId: number): Promise<ProjectEmailAttachment[]> {
    return await db.select().from(projectEmailAttachments).where(eq(projectEmailAttachments.emailId, emailId)).orderBy(asc(projectEmailAttachments.id));
  }

  async createProjectEmailAttachment(att: InsertProjectEmailAttachment): Promise<ProjectEmailAttachment> {
    const [result] = await db.insert(projectEmailAttachments).values(att).returning();
    return result;
  }

  // Fingercheck Employees
  async getFingercheckEmployees(): Promise<FingercheckEmployee[]> {
    return await db.select().from(fingercheckEmployees).orderBy(fingercheckEmployees.lastName, fingercheckEmployees.firstName);
  }

  async getFingercheckEmployee(id: number): Promise<FingercheckEmployee | undefined> {
    const [employee] = await db.select().from(fingercheckEmployees).where(eq(fingercheckEmployees.id, id));
    return employee;
  }

  async getFingercheckEmployeeByEmployeeId(employeeId: number): Promise<FingercheckEmployee | undefined> {
    const [employee] = await db.select().from(fingercheckEmployees).where(eq(fingercheckEmployees.employeeId, employeeId));
    return employee;
  }

  async upsertFingercheckEmployee(employee: InsertFingercheckEmployee): Promise<FingercheckEmployee> {
    const now = new Date();
    const [result] = await db
      .insert(fingercheckEmployees)
      .values({ ...employee, lastSyncedAt: now })
      .onConflictDoUpdate({
        target: fingercheckEmployees.employeeId,
        set: {
          ...employee,
          lastSyncedAt: now,
        },
      })
      .returning();
    return result;
  }

  async deleteFingercheckEmployee(id: number): Promise<void> {
    await db.delete(fingercheckEmployees).where(eq(fingercheckEmployees.id, id));
  }

  // Fingercheck Time Punches
  async getTimePunches(filters?: { employeeId?: number; startDate?: string; endDate?: string; jobCode?: string }): Promise<FingercheckTimePunch[]> {
    const conditions = [];
    if (filters?.employeeId) {
      conditions.push(eq(fingercheckTimePunches.employeeId, filters.employeeId));
    }
    if (filters?.startDate) {
      conditions.push(sql`${fingercheckTimePunches.date} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${fingercheckTimePunches.date} <= ${filters.endDate + "T23:59:59"}`);
    }
    if (filters?.jobCode) {
      conditions.push(eq(fingercheckTimePunches.jobCode, filters.jobCode));
    }
    if (conditions.length > 0) {
      return db.select().from(fingercheckTimePunches).where(and(...conditions)).orderBy(fingercheckTimePunches.actualTime);
    }
    return db.select().from(fingercheckTimePunches).orderBy(fingercheckTimePunches.actualTime);
  }

  async upsertTimePunch(punch: InsertFingercheckTimePunch): Promise<FingercheckTimePunch> {
    const now = new Date();
    const [result] = await db
      .insert(fingercheckTimePunches)
      .values({ ...punch, lastSyncedAt: now })
      .onConflictDoUpdate({
        target: fingercheckTimePunches.guid,
        set: {
          ...punch,
          lastSyncedAt: now,
        },
      })
      .returning();
    return result;
  }

  async deleteTimePunchesByDateRange(startDate: string, endDate: string): Promise<void> {
    await db.delete(fingercheckTimePunches).where(
      and(
        sql`${fingercheckTimePunches.date} >= ${startDate}`,
        sql`${fingercheckTimePunches.date} <= ${endDate + "T23:59:59"}`
      )
    );
  }

  // Fingercheck Project Mappings
  async getProjectMappings(): Promise<FingercheckProjectMapping[]> {
    return db.select().from(fingercheckProjectMappings).orderBy(fingercheckProjectMappings.createdAt);
  }

  async getProjectMappingsByProjectId(projectId: number): Promise<FingercheckProjectMapping[]> {
    return db.select().from(fingercheckProjectMappings).where(eq(fingercheckProjectMappings.projectId, projectId)).orderBy(asc(fingercheckProjectMappings.id));
  }

  async getProjectMappingByJobCode(jobCode: string): Promise<FingercheckProjectMapping | undefined> {
    const [result] = await db.select().from(fingercheckProjectMappings).where(eq(fingercheckProjectMappings.fingercheckJobCode, jobCode));
    return result;
  }

  async createProjectMapping(mapping: InsertFingercheckProjectMapping): Promise<FingercheckProjectMapping> {
    const [result] = await db.insert(fingercheckProjectMappings).values(mapping).returning();
    return result;
  }

  async deleteProjectMapping(id: number): Promise<void> {
    await db.delete(fingercheckProjectMappings).where(eq(fingercheckProjectMappings.id, id));
  }

  // RFIs
  async getRfis(projectId: number): Promise<Rfi[]> {
    return db.select().from(rfis)
      .where(and(eq(rfis.projectId, projectId), isNull(rfis.deletedAt)))
      .orderBy(rfis.rfiNumber);
  }

  async getRfi(id: number): Promise<Rfi | undefined> {
    const [rfi] = await db.select().from(rfis).where(and(eq(rfis.id, id), isNull(rfis.deletedAt)));
    return rfi;
  }

  async getNextRfiNumber(projectId: number): Promise<number> {
    const allRfis = await db
      .select({ rfiNumber: rfis.rfiNumber, status: rfis.status, deletedAt: rfis.deletedAt })
      .from(rfis)
      .where(eq(rfis.projectId, projectId));
    const activeNumbers = new Set(
      allRfis.filter(r => !r.deletedAt).map(r => r.rfiNumber)
    );
    const maxNum = allRfis.length > 0 ? Math.max(...allRfis.map(r => r.rfiNumber)) : 0;
    for (let i = 1; i <= maxNum + 1; i++) {
      if (!activeNumbers.has(i)) return i;
    }
    return maxNum + 1;
  }

  async createRfi(rfi: InsertRfi): Promise<Rfi> {
    const [result] = await db.insert(rfis).values(rfi).returning();
    return result;
  }

  async updateRfi(id: number, updates: Partial<InsertRfi>): Promise<Rfi> {
    const [result] = await db.update(rfis).set({ ...updates, updatedAt: new Date() }).where(eq(rfis.id, id)).returning();
    return result;
  }

  async deleteRfi(id: number): Promise<void> {
    await db.update(rfis).set({ deletedAt: new Date() }).where(eq(rfis.id, id));
  }

  // RFI Responses
  async getRfiResponses(rfiId: number): Promise<RfiResponse[]> {
    return db.select().from(rfiResponses)
      .where(eq(rfiResponses.rfiId, rfiId))
      .orderBy(rfiResponses.receivedAt);
  }

  async getRfiResponseByOutlookId(outlookMessageId: string): Promise<RfiResponse | undefined> {
    const [result] = await db.select().from(rfiResponses).where(eq(rfiResponses.outlookMessageId, outlookMessageId));
    return result;
  }

  async createRfiResponse(response: InsertRfiResponse): Promise<RfiResponse> {
    const [result] = await db.insert(rfiResponses).values(response).returning();
    return result;
  }

  async getUserOutlookConnection(userId: string): Promise<UserOutlookConnection | undefined> {
    const [result] = await db.select().from(userOutlookConnections).where(eq(userOutlookConnections.userId, userId));
    return result;
  }

  async upsertUserOutlookConnection(data: { userId: string; email: string; accessToken: string; refreshToken: string; expiresAt: Date }): Promise<UserOutlookConnection> {
    const [result] = await db.insert(userOutlookConnections).values(data)
      .onConflictDoUpdate({
        target: userOutlookConnections.userId,
        set: {
          email: data.email,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteUserOutlookConnection(userId: string): Promise<void> {
    await db.delete(userOutlookConnections).where(eq(userOutlookConnections.userId, userId));
  }

  async getProjectDailyReportRecipients(projectId: number): Promise<ProjectDailyReportRecipient[]> {
    return await db.select().from(projectDailyReportRecipients).where(and(eq(projectDailyReportRecipients.projectId, projectId), isNull(projectDailyReportRecipients.deletedAt))).orderBy(asc(projectDailyReportRecipients.id));
  }
  async createProjectDailyReportRecipient(recipient: InsertProjectDailyReportRecipient): Promise<ProjectDailyReportRecipient> {
    const [record] = await db.insert(projectDailyReportRecipients).values(recipient).returning();
    return record;
  }
  async deleteProjectDailyReportRecipient(id: number): Promise<void> {
    await db.update(projectDailyReportRecipients).set({ deletedAt: new Date() }).where(eq(projectDailyReportRecipients.id, id));
  }
}

export const storage = new DatabaseStorage();
export const authStorage = storage;
