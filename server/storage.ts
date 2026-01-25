import { db } from "./db";
import {
  projects, tasks, equipment, allocations,
  type InsertProject, type InsertTask, type InsertEquipment, type InsertAllocation,
  type Project, type Task, type Equipment, type Allocation
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: number): Promise<void>;

  // Tasks
  getTasks(projectId?: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: number): Promise<void>;

  // Equipment
  getEquipmentList(): Promise<Equipment[]>;
  getEquipment(id: number): Promise<Equipment | undefined>;
  createEquipment(equipment: InsertEquipment): Promise<Equipment>;
  updateEquipment(id: number, equipment: Partial<InsertEquipment>): Promise<Equipment>;
  deleteEquipment(id: number): Promise<void>;

  // Allocations
  getAllocations(): Promise<Allocation[]>;
  createAllocation(allocation: InsertAllocation): Promise<Allocation>;
  deleteAllocation(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Projects
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.startDate));
  }
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }
  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
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
      return await db.select().from(tasks).where(eq(tasks.projectId, projectId)).orderBy(tasks.startDate);
    }
    return await db.select().from(tasks).orderBy(tasks.startDate);
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

  // Allocations
  async getAllocations(): Promise<Allocation[]> {
    return await db.select().from(allocations);
  }
  async createAllocation(insertAllocation: InsertAllocation): Promise<Allocation> {
    const [allocation] = await db.insert(allocations).values(insertAllocation).returning();
    return allocation;
  }
  async deleteAllocation(id: number): Promise<void> {
    await db.delete(allocations).where(eq(allocations.id, id));
  }
}

export const storage = new DatabaseStorage();
