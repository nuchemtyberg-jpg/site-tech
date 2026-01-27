import {
  projects, tasks, equipment, allocations, folders, files, users, customers, dailyReports, maintenanceLogs, communications, taskStatusHistory, photoAlbums,
  reportTasks, laborEntries, equipmentEntries, reportTaskPhotos, deliveries, deliveryPhotos,
  dailyReportTaskEntries, dailyReportLaborLines, dailyReportEquipmentLines, dailyReportDeliveryEntries, dailyReportPhotos,
  type InsertProject, type InsertTask, type InsertEquipment, type InsertAllocation, type InsertFolder, type InsertFileMetadata,
  type InsertCustomer, type InsertDailyReport, type InsertMaintenanceLog, type InsertCommunication, type InsertTaskStatusHistory, type InsertPhotoAlbum,
  type InsertReportTask, type InsertLaborEntry, type InsertEquipmentEntry, type InsertReportTaskPhoto, type InsertDelivery, type InsertDeliveryPhoto,
  type InsertDailyReportTaskEntry, type InsertDailyReportLaborLine, type InsertDailyReportEquipmentLine, type InsertDailyReportDeliveryEntry, type InsertDailyReportPhoto,
  type Project, type Task, type Equipment, type Allocation, type Folder, type FileMetadata,
  type Customer, type DailyReport, type MaintenanceLog, type Communication, type TaskStatusHistory, type PhotoAlbum,
  type ReportTask, type LaborEntry, type EquipmentEntry, type ReportTaskPhoto, type Delivery, type DeliveryPhoto,
  type DailyReportTaskEntry, type DailyReportLaborLine, type DailyReportEquipmentLine, type DailyReportDeliveryEntry, type DailyReportPhoto,
  type User, type UpsertUser
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and } from "drizzle-orm";

export interface IStorage {
  // Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;

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

  // Tasks
  getTasks(projectId?: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: number): Promise<void>;

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

  // Allocations
  getAllocations(): Promise<Allocation[]>;
  createAllocation(allocation: InsertAllocation): Promise<Allocation>;
  updateAllocation(id: number, allocation: Partial<InsertAllocation>): Promise<Allocation>;
  deleteAllocation(id: number): Promise<void>;

  // Folders & Files
  getFolders(projectId: number): Promise<Folder[]>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  deleteFolder(id: number): Promise<void>;

  getFiles(projectId: number): Promise<FileMetadata[]>;
  getFile(id: number): Promise<FileMetadata | undefined>;
  createFile(file: InsertFileMetadata): Promise<FileMetadata>;
  updateFile(id: number, file: Partial<InsertFileMetadata>): Promise<FileMetadata>;
  deleteFile(id: number): Promise<void>;

  // Photo Albums
  getPhotoAlbums(projectId: number): Promise<PhotoAlbum[]>;
  getPhotoAlbum(id: number): Promise<PhotoAlbum | undefined>;
  createPhotoAlbum(album: InsertPhotoAlbum): Promise<PhotoAlbum>;
  updatePhotoAlbum(id: number, album: Partial<InsertPhotoAlbum>): Promise<PhotoAlbum>;
  deletePhotoAlbum(id: number): Promise<void>;

  // New Daily Report Task Entries
  getDailyReportTaskEntries(reportId: number): Promise<DailyReportTaskEntry[]>;
  getDailyReportTaskEntry(id: number): Promise<DailyReportTaskEntry | undefined>;
  createDailyReportTaskEntry(entry: InsertDailyReportTaskEntry): Promise<DailyReportTaskEntry>;
  updateDailyReportTaskEntry(id: number, entry: Partial<InsertDailyReportTaskEntry>): Promise<DailyReportTaskEntry>;
  deleteDailyReportTaskEntry(id: number): Promise<void>;

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

  // New Daily Report Photos
  getDailyReportPhotos(reportId?: number, taskEntryId?: number, deliveryEntryId?: number): Promise<DailyReportPhoto[]>;
  createDailyReportPhoto(photo: InsertDailyReportPhoto): Promise<DailyReportPhoto>;
  deleteDailyReportPhoto(id: number): Promise<void>;
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

  // Customers
  async getCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).orderBy(customers.name);
  }
  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(eq(customers.id, id));
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
    await db.delete(customers).where(eq(customers.id, id));
  }

  // Projects
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }
  async getProjectsByCustomer(customerId: number): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.customerId, customerId));
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
    // Auto-generate project number
    const projectNumber = await this.getNextProjectNumber();
    
    const [project] = await db.insert(projects).values({
      ...insertProject,
      projectNumber
    }).returning();
    
    // Create default folder structure for new projects
    await this.createDefaultFolders(project.id);
    
    return project;
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
    await db.delete(projects).where(eq(projects.id, id));
  }

  // Tasks
  async getTasks(projectId?: number): Promise<Task[]> {
    if (projectId) {
      return await db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(tasks.scheduledDate);
    }
    return await db.select().from(tasks).orderBy(tasks.scheduledDate);
  }
  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
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
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  // Task Status History
  async getTaskStatusHistory(taskId: number): Promise<TaskStatusHistory[]> {
    return db.select().from(taskStatusHistory).where(eq(taskStatusHistory.taskId, taskId)).orderBy(desc(taskStatusHistory.changedAt));
  }
  async createTaskStatusHistory(history: InsertTaskStatusHistory): Promise<TaskStatusHistory> {
    const [record] = await db.insert(taskStatusHistory).values(history).returning();
    return record;
  }

  // Equipment
  async getEquipmentList(): Promise<Equipment[]> {
    return await db.select().from(equipment).orderBy(equipment.type, equipment.name);
  }
  async getEquipment(id: number): Promise<Equipment | undefined> {
    const [item] = await db.select().from(equipment).where(eq(equipment.id, id));
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
    await db.delete(equipment).where(eq(equipment.id, id));
  }

  // Maintenance Logs
  async getMaintenanceLogs(equipmentId: number): Promise<MaintenanceLog[]> {
    return await db.select().from(maintenanceLogs).where(eq(maintenanceLogs.equipmentId, equipmentId)).orderBy(desc(maintenanceLogs.performedDate));
  }
  async createMaintenanceLog(insertLog: InsertMaintenanceLog): Promise<MaintenanceLog> {
    const [log] = await db.insert(maintenanceLogs).values(insertLog).returning();
    return log;
  }
  async deleteMaintenanceLog(id: number): Promise<void> {
    await db.delete(maintenanceLogs).where(eq(maintenanceLogs.id, id));
  }

  // Daily Reports
  async getDailyReports(projectId: number): Promise<DailyReport[]> {
    return await db.select().from(dailyReports).where(eq(dailyReports.projectId, projectId)).orderBy(desc(dailyReports.reportDate), desc(dailyReports.updatedAt));
  }
  async getDailyReport(id: number): Promise<DailyReport | undefined> {
    const [report] = await db.select().from(dailyReports).where(eq(dailyReports.id, id));
    return report;
  }
  async getDailyReportByDate(projectId: number, reportDate: string): Promise<DailyReport | undefined> {
    const [report] = await db.select().from(dailyReports).where(
      and(eq(dailyReports.projectId, projectId), eq(dailyReports.reportDate, reportDate))
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
    await db.delete(dailyReports).where(eq(dailyReports.id, id));
  }

  // Report Tasks
  async getReportTasks(reportId: number): Promise<ReportTask[]> {
    return await db.select().from(reportTasks).where(eq(reportTasks.reportId, reportId));
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
    return await db.select().from(laborEntries).where(eq(laborEntries.reportTaskId, reportTaskId));
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
    return await db.select().from(equipmentEntries).where(eq(equipmentEntries.reportTaskId, reportTaskId));
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
    return await db.select().from(reportTaskPhotos).where(eq(reportTaskPhotos.reportTaskId, reportTaskId));
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
    return await db.select().from(deliveries).where(eq(deliveries.reportId, reportId));
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
    return await db.select().from(deliveryPhotos).where(eq(deliveryPhotos.deliveryId, deliveryId));
  }
  async createDeliveryPhoto(photo: InsertDeliveryPhoto): Promise<DeliveryPhoto> {
    const [record] = await db.insert(deliveryPhotos).values(photo).returning();
    return record;
  }
  async deleteDeliveryPhoto(id: number): Promise<void> {
    await db.delete(deliveryPhotos).where(eq(deliveryPhotos.id, id));
  }

  // Communications
  async getCommunications(customerId: number): Promise<Communication[]> {
    return await db.select().from(communications).where(eq(communications.customerId, customerId)).orderBy(desc(communications.contactDate));
  }
  async createCommunication(insertComm: InsertCommunication): Promise<Communication> {
    const [comm] = await db.insert(communications).values(insertComm).returning();
    return comm;
  }
  async deleteCommunication(id: number): Promise<void> {
    await db.delete(communications).where(eq(communications.id, id));
  }

  // Allocations
  async getAllocations(): Promise<Allocation[]> {
    return await db.select().from(allocations).orderBy(allocations.startDate);
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
    await db.delete(allocations).where(eq(allocations.id, id));
  }

  // Folders
  async getFolders(projectId: number): Promise<Folder[]> {
    return await db.select().from(folders).where(eq(folders.projectId, projectId));
  }
  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    const [folder] = await db.insert(folders).values(insertFolder).returning();
    return folder;
  }
  async deleteFolder(id: number): Promise<void> {
    await db.delete(folders).where(eq(folders.id, id));
  }

  // Files
  async getFiles(projectId: number): Promise<FileMetadata[]> {
    return await db.select().from(files).where(eq(files.projectId, projectId));
  }
  async getFile(id: number): Promise<FileMetadata | undefined> {
    const [file] = await db.select().from(files).where(eq(files.id, id));
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
    await db.delete(files).where(eq(files.id, id));
  }

  // Photo Albums
  async getPhotoAlbums(projectId: number): Promise<PhotoAlbum[]> {
    return await db.select().from(photoAlbums).where(eq(photoAlbums.projectId, projectId)).orderBy(desc(photoAlbums.createdAt));
  }
  async getPhotoAlbum(id: number): Promise<PhotoAlbum | undefined> {
    const [album] = await db.select().from(photoAlbums).where(eq(photoAlbums.id, id));
    return album;
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
    await db.delete(photoAlbums).where(eq(photoAlbums.id, id));
  }

  // New Daily Report Task Entries
  async getDailyReportTaskEntries(reportId: number): Promise<DailyReportTaskEntry[]> {
    return await db.select().from(dailyReportTaskEntries).where(eq(dailyReportTaskEntries.reportId, reportId));
  }
  async getDailyReportTaskEntry(id: number): Promise<DailyReportTaskEntry | undefined> {
    const [entry] = await db.select().from(dailyReportTaskEntries).where(eq(dailyReportTaskEntries.id, id));
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
    // Delete associated labor and equipment lines first
    await db.delete(dailyReportLaborLines).where(eq(dailyReportLaborLines.taskEntryId, id));
    await db.delete(dailyReportEquipmentLines).where(eq(dailyReportEquipmentLines.taskEntryId, id));
    await db.delete(dailyReportPhotos).where(eq(dailyReportPhotos.taskEntryId, id));
    await db.delete(dailyReportTaskEntries).where(eq(dailyReportTaskEntries.id, id));
  }

  // New Daily Report Labor Lines
  async getDailyReportLaborLines(taskEntryId: number): Promise<DailyReportLaborLine[]> {
    return await db.select().from(dailyReportLaborLines).where(eq(dailyReportLaborLines.taskEntryId, taskEntryId));
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
    await db.delete(dailyReportLaborLines).where(eq(dailyReportLaborLines.id, id));
  }

  // New Daily Report Equipment Lines
  async getDailyReportEquipmentLines(taskEntryId: number): Promise<DailyReportEquipmentLine[]> {
    return await db.select().from(dailyReportEquipmentLines).where(eq(dailyReportEquipmentLines.taskEntryId, taskEntryId));
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
    await db.delete(dailyReportEquipmentLines).where(eq(dailyReportEquipmentLines.id, id));
  }

  // New Daily Report Delivery Entries
  async getDailyReportDeliveryEntries(reportId: number): Promise<DailyReportDeliveryEntry[]> {
    return await db.select().from(dailyReportDeliveryEntries).where(eq(dailyReportDeliveryEntries.reportId, reportId));
  }
  async getDailyReportDeliveryEntry(id: number): Promise<DailyReportDeliveryEntry | undefined> {
    const [entry] = await db.select().from(dailyReportDeliveryEntries).where(eq(dailyReportDeliveryEntries.id, id));
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
    await db.delete(dailyReportPhotos).where(eq(dailyReportPhotos.deliveryEntryId, id));
    await db.delete(dailyReportDeliveryEntries).where(eq(dailyReportDeliveryEntries.id, id));
  }

  // New Daily Report Photos
  async getDailyReportPhotos(reportId?: number, taskEntryId?: number, deliveryEntryId?: number): Promise<DailyReportPhoto[]> {
    if (taskEntryId) {
      return await db.select().from(dailyReportPhotos).where(eq(dailyReportPhotos.taskEntryId, taskEntryId));
    }
    if (deliveryEntryId) {
      return await db.select().from(dailyReportPhotos).where(eq(dailyReportPhotos.deliveryEntryId, deliveryEntryId));
    }
    if (reportId) {
      return await db.select().from(dailyReportPhotos).where(eq(dailyReportPhotos.reportId, reportId));
    }
    return [];
  }
  async createDailyReportPhoto(photo: InsertDailyReportPhoto): Promise<DailyReportPhoto> {
    const [record] = await db.insert(dailyReportPhotos).values(photo).returning();
    return record;
  }
  async deleteDailyReportPhoto(id: number): Promise<void> {
    await db.delete(dailyReportPhotos).where(eq(dailyReportPhotos.id, id));
  }
}

export const storage = new DatabaseStorage();
export const authStorage = storage;
