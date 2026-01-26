import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import type { User } from "@shared/schema";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth Setup
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Object Storage Setup
  registerObjectStorageRoutes(app);

  // Customers
  app.get(api.customers.list.path, async (req, res) => {
    const customers = await storage.getCustomers();
    res.json(customers);
  });

  app.get(api.customers.get.path, async (req, res) => {
    const customer = await storage.getCustomer(Number(req.params.id));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.post(api.customers.create.path, async (req, res) => {
    try {
      const input = api.customers.create.input.parse(req.body);
      const customer = await storage.createCustomer(input);
      res.status(201).json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.customers.update.path, async (req, res) => {
    try {
      const input = api.customers.update.input.parse(req.body);
      const customer = await storage.updateCustomer(Number(req.params.id), input);
      res.json(customer);
    } catch (err) {
      return res.status(404).json({ message: "Customer not found" });
    }
  });

  app.delete(api.customers.delete.path, async (req, res) => {
    await storage.deleteCustomer(Number(req.params.id));
    res.status(204).send();
  });

  // Projects
  app.get(api.projects.list.path, async (req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });
  
  app.get("/api/projects/next-number", async (req, res) => {
    const nextNumber = await storage.getNextProjectNumber();
    res.json({ projectNumber: nextNumber });
  });

  app.get(api.projects.get.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post(api.projects.create.path, async (req, res) => {
    try {
      const input = api.projects.create.input.parse(req.body);
      const project = await storage.createProject(input);
      res.status(201).json(project);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.projects.update.path, async (req, res) => {
    try {
      const input = api.projects.update.input.parse(req.body);
      const project = await storage.updateProject(Number(req.params.id), input);
      res.json(project);
    } catch (err) {
      return res.status(404).json({ message: "Project not found" });
    }
  });

  app.delete(api.projects.delete.path, async (req, res) => {
    await storage.deleteProject(Number(req.params.id));
    res.status(204).send();
  });

  // Tasks
  app.get(api.tasks.list.path, async (req, res) => {
    const tasks = await storage.getTasks(Number(req.params.projectId));
    res.json(tasks);
  });

  app.get(api.tasks.getAll.path, async (req, res) => {
    const tasks = await storage.getTasks();
    res.json(tasks);
  });

  app.post(api.tasks.create.path, async (req, res) => {
    try {
      const input = api.tasks.create.input.parse(req.body);
      // Convert empty strings to null for date fields
      const sanitizedInput = {
        ...input,
        dueDate: input.dueDate || null,
        scheduledDate: input.scheduledDate || null,
        description: input.description || null,
      };
      const task = await storage.createTask(sanitizedInput);
      res.status(201).json(task);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.tasks.update.path, async (req, res) => {
    try {
      const input = api.tasks.update.input.parse(req.body);
      const taskId = Number(req.params.id);
      
      // Get the current task to compare status/percent changes
      const currentTask = await storage.getTask(taskId);
      if (!currentTask) {
        return res.status(404).json({ message: "Task not found" });
      }
      
      // Check if status or percentComplete changed
      const statusChanged = input.status !== undefined && input.status !== currentTask.status;
      const percentChanged = input.percentComplete !== undefined && input.percentComplete !== currentTask.percentComplete;
      
      // Update the task
      const task = await storage.updateTask(taskId, input);
      
      // Log status/percent changes if there were any (non-blocking - don't fail the update if history fails)
      if (statusChanged || percentChanged) {
        try {
          let changedByUserId = "unknown";
          let changedByName = "Unknown User";
          
          if (req.user) {
            const user = req.user as User;
            // Safely get user id, falling back to "unknown" if null/undefined
            if (user.id) {
              changedByUserId = user.id;
            }
            const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
            if (fullName) {
              changedByName = fullName;
            } else if (user.email) {
              changedByName = user.email;
            }
          }
          
          await storage.createTaskStatusHistory({
            taskId,
            previousStatus: statusChanged ? currentTask.status : null,
            newStatus: statusChanged ? input.status! : null,
            previousPercentComplete: percentChanged ? currentTask.percentComplete : null,
            newPercentComplete: percentChanged ? input.percentComplete! : null,
            changedByUserId,
            changedByName,
          });
        } catch (historyErr) {
          console.error("Failed to create task status history:", historyErr);
          // Continue anyway - task update succeeded
        }
      }
      
      res.json(task);
    } catch (err) {
      console.error("Error updating task:", err);
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(500).json({ message: "Failed to update task" });
    }
  });

  // Task Status History
  app.get("/api/tasks/:id/history", async (req, res) => {
    const history = await storage.getTaskStatusHistory(Number(req.params.id));
    res.json(history);
  });

  app.delete(api.tasks.delete.path, async (req, res) => {
    await storage.deleteTask(Number(req.params.id));
    res.status(204).send();
  });

  // Equipment
  app.get(api.equipment.list.path, async (req, res) => {
    const list = await storage.getEquipmentList();
    res.json(list);
  });

  app.get(api.equipment.get.path, async (req, res) => {
    const item = await storage.getEquipment(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Equipment not found" });
    res.json(item);
  });

  app.post(api.equipment.create.path, async (req, res) => {
    try {
      const input = api.equipment.create.input.parse(req.body);
      const item = await storage.createEquipment(input);
      res.status(201).json(item);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.equipment.update.path, async (req, res) => {
    try {
      const input = api.equipment.update.input.parse(req.body);
      const item = await storage.updateEquipment(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      return res.status(404).json({ message: "Equipment not found" });
    }
  });

  app.delete(api.equipment.delete.path, async (req, res) => {
    await storage.deleteEquipment(Number(req.params.id));
    res.status(204).send();
  });

  // Maintenance Logs
  app.get(api.maintenanceLogs.list.path, async (req, res) => {
    const logs = await storage.getMaintenanceLogs(Number(req.params.equipmentId));
    res.json(logs);
  });

  app.post(api.maintenanceLogs.create.path, async (req, res) => {
    try {
      const input = api.maintenanceLogs.create.input.parse(req.body);
      const log = await storage.createMaintenanceLog({
        ...input,
        equipmentId: Number(req.params.equipmentId),
      });
      res.status(201).json(log);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.maintenanceLogs.delete.path, async (req, res) => {
    await storage.deleteMaintenanceLog(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Reports
  app.get(api.dailyReports.list.path, async (req, res) => {
    const reports = await storage.getDailyReports(Number(req.params.projectId));
    res.json(reports);
  });

  app.get(api.dailyReports.get.path, async (req, res) => {
    const report = await storage.getDailyReport(Number(req.params.id));
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  });

  app.post(api.dailyReports.create.path, async (req, res) => {
    try {
      const input = api.dailyReports.create.input.parse(req.body);
      const report = await storage.createDailyReport({
        ...input,
        projectId: Number(req.params.projectId),
      });
      res.status(201).json(report);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.dailyReports.update.path, async (req, res) => {
    try {
      const input = api.dailyReports.update.input.parse(req.body);
      const report = await storage.updateDailyReport(Number(req.params.id), input);
      res.json(report);
    } catch (err) {
      return res.status(404).json({ message: "Report not found" });
    }
  });

  app.delete(api.dailyReports.delete.path, async (req, res) => {
    await storage.deleteDailyReport(Number(req.params.id));
    res.status(204).send();
  });

  // Communications
  app.get(api.communications.list.path, async (req, res) => {
    const comms = await storage.getCommunications(Number(req.params.customerId));
    res.json(comms);
  });

  app.post(api.communications.create.path, async (req, res) => {
    try {
      const input = api.communications.create.input.parse(req.body);
      const comm = await storage.createCommunication({
        ...input,
        customerId: Number(req.params.customerId),
      });
      res.status(201).json(comm);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.communications.delete.path, async (req, res) => {
    await storage.deleteCommunication(Number(req.params.id));
    res.status(204).send();
  });

  // Allocations
  app.get(api.allocations.list.path, async (req, res) => {
    const list = await storage.getAllocations();
    res.json(list);
  });

  app.post(api.allocations.create.path, async (req, res) => {
    try {
      const input = api.allocations.create.input.parse(req.body);
      const allocation = await storage.createAllocation(input);
      res.status(201).json(allocation);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.allocations.update.path, async (req, res) => {
    try {
      const input = api.allocations.update.input.parse(req.body);
      const allocation = await storage.updateAllocation(Number(req.params.id), input);
      res.json(allocation);
    } catch (err) {
      return res.status(404).json({ message: "Allocation not found" });
    }
  });

  app.delete(api.allocations.delete.path, async (req, res) => {
    await storage.deleteAllocation(Number(req.params.id));
    res.status(204).send();
  });

  // Folders & Files
  app.get(api.folders.list.path, async (req, res) => {
    const list = await storage.getFolders(Number(req.params.projectId));
    res.json(list);
  });

  app.post(api.folders.create.path, async (req, res) => {
    try {
      const input = api.folders.create.input.parse(req.body);
      const folder = await storage.createFolder({
        ...input,
        projectId: Number(req.params.projectId),
      });
      res.status(201).json(folder);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.folders.delete.path, async (req, res) => {
    await storage.deleteFolder(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.files.list.path, async (req, res) => {
    const list = await storage.getFiles(Number(req.params.projectId));
    res.json(list);
  });

  app.post(api.files.create.path, async (req, res) => {
    try {
      const input = api.files.create.input.parse(req.body);
      if (!input.objectPath) {
        return res.status(400).json({ message: "objectPath is required" });
      }
      const file = await storage.createFile({
        ...input,
        projectId: Number(req.params.projectId),
      });
      res.status(201).json(file);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.files.delete.path, async (req, res) => {
    await storage.deleteFile(Number(req.params.id));
    res.status(204).send();
  });

  // Photo Albums
  app.get(api.photoAlbums.list.path, async (req, res) => {
    const albums = await storage.getPhotoAlbums(Number(req.params.projectId));
    res.json(albums);
  });

  app.post(api.photoAlbums.create.path, async (req, res) => {
    try {
      const input = api.photoAlbums.create.input.parse(req.body);
      const album = await storage.createPhotoAlbum({
        ...input,
        projectId: Number(req.params.projectId),
      });
      res.status(201).json(album);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.photoAlbums.update.path, async (req, res) => {
    try {
      const input = api.photoAlbums.update.input.parse(req.body);
      const album = await storage.updatePhotoAlbum(Number(req.params.id), input);
      res.json(album);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.photoAlbums.delete.path, async (req, res) => {
    await storage.deletePhotoAlbum(Number(req.params.id));
    res.status(204).send();
  });

  // Update file to assign to album
  app.put('/api/files/:id', async (req, res) => {
    try {
      const file = await storage.updateFile(Number(req.params.id), req.body);
      res.json(file);
    } catch (err) {
      throw err;
    }
  });

  return httpServer;
}
