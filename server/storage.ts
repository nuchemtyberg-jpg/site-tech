import {
  projects, tasks, equipment, allocations, folders, files, users, customers, dailyReports, maintenanceLogs, communications, taskStatusHistory, photoAlbums,
  type InsertProject, type InsertTask, type InsertEquipment, type InsertAllocation, type InsertFolder, type InsertFileMetadata,
  type InsertCustomer, type InsertDailyReport, type InsertMaintenanceLog, type InsertCommunication, type InsertTaskStatusHistory, type InsertPhotoAlbum,
  type Project, type Task, type Equipment, type Allocation, type Folder, type FileMetadata,
  type Customer, type DailyReport, type MaintenanceLog, type Communication, type TaskStatusHistory, type PhotoAlbum,
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
  createDailyReport(report: InsertDailyReport): Promise<DailyReport>;
  updateDailyReport(id: number, report: Partial<InsertDailyReport>): Promise<DailyReport>;
  deleteDailyReport(id: number): Promise<void>;

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
    return await db.select().from(dailyReports).where(eq(dailyReports.projectId, projectId)).orderBy(desc(dailyReports.reportDate));
  }
  async getDailyReport(id: number): Promise<DailyReport | undefined> {
    const [report] = await db.select().from(dailyReports).where(eq(dailyReports.id, id));
    return report;
  }
  async createDailyReport(insertReport: InsertDailyReport): Promise<DailyReport> {
    const [report] = await db.insert(dailyReports).values(insertReport).returning();
    return report;
  }
  async updateDailyReport(id: number, updates: Partial<InsertDailyReport>): Promise<DailyReport> {
    const [report] = await db.update(dailyReports).set(updates).where(eq(dailyReports.id, id)).returning();
    return report;
  }
  async deleteDailyReport(id: number): Promise<void> {
    await db.delete(dailyReports).where(eq(dailyReports.id, id));
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
}

export const storage = new DatabaseStorage();
export const authStorage = storage;
