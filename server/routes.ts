import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth Setup
  await setupAuth(app);
  registerAuthRoutes(app);

  // Projects
  app.get(api.projects.list.path, async (req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });

  app.get(api.projects.get.path, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post(api.projects.create.path, async (req, res) => {
    try {
      const bodySchema = api.projects.create.input.extend({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
      });
      const input = bodySchema.parse(req.body);
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
      const bodySchema = api.projects.update.input.extend({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
      });
      const input = bodySchema.parse(req.body);
      const project = await storage.updateProject(Number(req.params.id), input);
      res.json(project);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
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
      const bodySchema = api.tasks.create.input.extend({
        startDate: z.coerce.date(),
        endDate: z.coerce.date(),
        projectId: z.coerce.number(),
      });
      const input = bodySchema.parse(req.body);
      const task = await storage.createTask(input);
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
      const bodySchema = api.tasks.update.input.extend({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        projectId: z.coerce.number().optional(),
      });
      const input = bodySchema.parse(req.body);
      const task = await storage.updateTask(Number(req.params.id), input);
      res.json(task);
    } catch (err) {
      return res.status(404).json({ message: "Task not found" });
    }
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

  // Allocations
  app.get(api.allocations.list.path, async (req, res) => {
    const list = await storage.getAllocations();
    res.json(list);
  });

  app.post(api.allocations.create.path, async (req, res) => {
    try {
      const input = api.allocations.create.input.parse(req.body);
      const allocation = await storage.createAllocation({
        ...input,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
      });
      res.status(201).json(allocation);
    } catch (err) {
       if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.allocations.delete.path, async (req, res) => {
    await storage.deleteAllocation(Number(req.params.id));
    res.status(204).send();
  });

  // Seed Data
  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const projects = await storage.getProjects();
  if (projects.length === 0) {
    const p1 = await storage.createProject({
      name: "Downtown Office Complex",
      description: "Excavation and foundation work for 12-story office building",
      location: "100 Main St, Cityville",
      startDate: new Date("2024-03-01"),
      endDate: new Date("2024-08-15"),
      status: "active",
      color: "#f97316"
    });
    
    const p2 = await storage.createProject({
      name: "Highway 95 Expansion",
      description: "Road widening and drainage installation",
      location: "Highway 95, Mile Marker 45-50",
      startDate: new Date("2024-04-15"),
      endDate: new Date("2024-11-30"),
      status: "planning",
      color: "#3b82f6"
    });

    await storage.createTask({
      projectId: p1.id,
      title: "Site Clearing",
      description: "Remove vegetation and existing debris",
      startDate: new Date("2024-03-01"),
      endDate: new Date("2024-03-14"),
      status: "completed",
      priority: "high"
    });

    await storage.createTask({
      projectId: p1.id,
      title: "Foundation Excavation",
      description: "Dig main foundation pit to 20ft depth",
      startDate: new Date("2024-03-15"),
      endDate: new Date("2024-04-30"),
      status: "in_progress",
      priority: "high"
    });

    await storage.createEquipment({
      name: "CAT 336 Excavator",
      type: "excavator",
      status: "in_use",
      notes: "Unit #101"
    });

    await storage.createEquipment({
      name: "D8 Dozer",
      type: "dozer",
      status: "available",
      notes: "Unit #205"
    });
  }
}
