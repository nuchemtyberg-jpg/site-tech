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

  // Get report by date
  app.get("/api/projects/:projectId/reports/by-date", async (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ message: "Date query parameter is required" });
    }
    const report = await storage.getDailyReportByDate(Number(req.params.projectId), date);
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  });

  app.get(api.dailyReports.get.path, async (req, res) => {
    const report = await storage.getDailyReport(Number(req.params.id));
    if (!report) return res.status(404).json({ message: "Report not found" });
    
    // Fetch related data
    const taskEntries = await storage.getDailyReportTaskEntries(report.id);
    const deliveryEntries = await storage.getDailyReportDeliveryEntries(report.id);
    
    // For each task entry, get labor lines, equipment lines, and photos
    const taskEntriesWithDetails = await Promise.all(taskEntries.map(async (entry) => {
      const laborLines = await storage.getDailyReportLaborLines(entry.id);
      const equipmentLines = await storage.getDailyReportEquipmentLines(entry.id);
      const photos = await storage.getDailyReportPhotos(undefined, entry.id, undefined);
      return { ...entry, laborLines, equipmentLines, photos };
    }));
    
    // For each delivery entry, get photos
    const deliveryEntriesWithPhotos = await Promise.all(deliveryEntries.map(async (entry) => {
      const photos = await storage.getDailyReportPhotos(undefined, undefined, entry.id);
      return { ...entry, photos };
    }));
    
    res.json({
      ...report,
      taskEntries: taskEntriesWithDetails,
      deliveryEntries: deliveryEntriesWithPhotos,
    });
  });

  app.post(api.dailyReports.create.path, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const { reportDate, ...rest } = req.body;
      
      if (!reportDate) {
        return res.status(400).json({ message: "Report date is required" });
      }
      
      // Check for existing report on same date - return 409 if exists
      const existingReport = await storage.getDailyReportByDate(projectId, reportDate);
      if (existingReport) {
        return res.status(409).json({ 
          error: "REPORT_EXISTS_FOR_DATE",
          message: "A report for this date already exists",
          existingReportId: existingReport.id
        });
      }
      
      const report = await storage.createDailyReport({
        ...rest,
        reportDate,
        projectId,
        status: 'draft',
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
      const reportId = Number(req.params.id);
      
      // Check if report exists and is not completed
      const existingReport = await storage.getDailyReport(reportId);
      if (!existingReport) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      // Reject edits if report is completed (read-only)
      if (existingReport.status === 'completed' && !req.body.status) {
        return res.status(403).json({ message: "Cannot edit a completed report" });
      }
      
      const body = { ...req.body };
      
      // Handle timestamp conversion
      if (body.completedAt && typeof body.completedAt === 'string') {
        body.completedAt = new Date(body.completedAt);
      }
      if (body.weatherFetchedAt && typeof body.weatherFetchedAt === 'string') {
        body.weatherFetchedAt = new Date(body.weatherFetchedAt);
      }
      
      const report = await storage.updateDailyReport(reportId, body);
      res.json(report);
    } catch (err) {
      if (err instanceof z.ZodError) {
        console.error("Validation error:", err.errors);
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Update report error:", err);
      return res.status(500).json({ message: "Failed to update report" });
    }
  });

  // Complete and sign report
  app.post("/api/reports/:id/complete", async (req, res) => {
    try {
      const reportId = Number(req.params.id);
      const { signatureType, signatureValue, completedBy, completedByName } = req.body;
      
      const existingReport = await storage.getDailyReport(reportId);
      if (!existingReport) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      if (existingReport.status === 'completed') {
        return res.status(403).json({ message: "Report is already completed" });
      }
      
      if (!signatureType || !signatureValue) {
        return res.status(400).json({ message: "Signature is required to complete report" });
      }
      
      const report = await storage.updateDailyReport(reportId, {
        status: 'completed',
        signatureType,
        signatureValue,
        completedAt: new Date(),
        completedBy,
        completedByName,
      });
      
      res.json(report);
    } catch (err) {
      console.error("Complete report error:", err);
      return res.status(500).json({ message: "Failed to complete report" });
    }
  });

  app.delete(api.dailyReports.delete.path, async (req, res) => {
    const report = await storage.getDailyReport(Number(req.params.id));
    if (report?.status === 'completed') {
      return res.status(403).json({ message: "Cannot delete a completed report" });
    }
    await storage.deleteDailyReport(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report Task Entries
  app.get("/api/reports/:reportId/task-entries", async (req, res) => {
    const entries = await storage.getDailyReportTaskEntries(Number(req.params.reportId));
    res.json(entries);
  });

  app.post("/api/reports/:reportId/task-entries", async (req, res) => {
    try {
      const reportId = Number(req.params.reportId);
      const report = await storage.getDailyReport(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (report.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
      
      const { taskId, taskTitleSnapshot, percentComplete, comments } = req.body;
      if (!taskId || !taskTitleSnapshot) {
        return res.status(400).json({ message: "taskId and taskTitleSnapshot are required" });
      }
      
      const entry = await storage.createDailyReportTaskEntry({
        reportId,
        taskId,
        taskTitleSnapshot,
        percentComplete: percentComplete || 0,
        comments,
      });
      res.status(201).json(entry);
    } catch (err) {
      console.error("Create task entry error:", err);
      return res.status(500).json({ message: "Failed to create task entry" });
    }
  });

  app.put("/api/daily-report-task-entries/:id", async (req, res) => {
    try {
      const entryId = Number(req.params.id);
      const entry = await storage.getDailyReportTaskEntry(entryId);
      if (!entry) return res.status(404).json({ message: "Task entry not found" });
      
      const report = await storage.getDailyReport(entry.reportId);
      if (report?.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
      
      const updated = await storage.updateDailyReportTaskEntry(entryId, req.body);
      
      // Sync progress back to the main task
      if (req.body.percentComplete !== undefined) {
        const task = await storage.getTask(entry.taskId);
        if (task) {
          const newStatus = req.body.percentComplete === 0 ? 'pending' 
            : req.body.percentComplete === 100 ? 'completed' 
            : 'in_progress';
          await storage.updateTask(entry.taskId, { 
            percentComplete: req.body.percentComplete,
            status: newStatus
          });
        }
      }
      
      res.json(updated);
    } catch (err) {
      console.error("Update task entry error:", err);
      return res.status(500).json({ message: "Failed to update task entry" });
    }
  });

  app.delete("/api/daily-report-task-entries/:id", async (req, res) => {
    const entry = await storage.getDailyReportTaskEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ message: "Task entry not found" });
    
    const report = await storage.getDailyReport(entry.reportId);
    if (report?.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
    
    await storage.deleteDailyReportTaskEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report Labor Lines
  app.post("/api/daily-report-task-entries/:taskEntryId/labor-lines", async (req, res) => {
    try {
      const taskEntryId = Number(req.params.taskEntryId);
      const entry = await storage.getDailyReportTaskEntry(taskEntryId);
      if (!entry) return res.status(404).json({ message: "Task entry not found" });
      
      const report = await storage.getDailyReport(entry.reportId);
      if (report?.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
      
      const { laborType, quantity, hours } = req.body;
      const line = await storage.createDailyReportLaborLine({
        taskEntryId,
        laborType: laborType || 'Laborer',
        quantity: quantity || 1,
        hours: hours || 0,
      });
      res.status(201).json(line);
    } catch (err) {
      console.error("Create labor line error:", err);
      return res.status(500).json({ message: "Failed to create labor line" });
    }
  });

  app.put("/api/daily-report-labor-lines/:id", async (req, res) => {
    try {
      const updated = await storage.updateDailyReportLaborLine(Number(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update labor line" });
    }
  });

  app.delete("/api/daily-report-labor-lines/:id", async (req, res) => {
    await storage.deleteDailyReportLaborLine(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report Equipment Lines
  app.post("/api/daily-report-task-entries/:taskEntryId/equipment-lines", async (req, res) => {
    try {
      const taskEntryId = Number(req.params.taskEntryId);
      const entry = await storage.getDailyReportTaskEntry(taskEntryId);
      if (!entry) return res.status(404).json({ message: "Task entry not found" });
      
      const report = await storage.getDailyReport(entry.reportId);
      if (report?.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
      
      const { equipmentType, quantity, hours } = req.body;
      const line = await storage.createDailyReportEquipmentLine({
        taskEntryId,
        equipmentType: equipmentType || 'Excavator',
        quantity: quantity || 1,
        hours: hours || 0,
      });
      res.status(201).json(line);
    } catch (err) {
      console.error("Create equipment line error:", err);
      return res.status(500).json({ message: "Failed to create equipment line" });
    }
  });

  app.put("/api/daily-report-equipment-lines/:id", async (req, res) => {
    try {
      const updated = await storage.updateDailyReportEquipmentLine(Number(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update equipment line" });
    }
  });

  app.delete("/api/daily-report-equipment-lines/:id", async (req, res) => {
    await storage.deleteDailyReportEquipmentLine(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report Delivery Entries
  app.post("/api/reports/:reportId/delivery-entries", async (req, res) => {
    try {
      const reportId = Number(req.params.reportId);
      const report = await storage.getDailyReport(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (report.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
      
      const entry = await storage.createDailyReportDeliveryEntry({
        reportId,
        ...req.body,
      });
      res.status(201).json(entry);
    } catch (err) {
      console.error("Create delivery entry error:", err);
      return res.status(500).json({ message: "Failed to create delivery entry" });
    }
  });

  app.put("/api/daily-report-delivery-entries/:id", async (req, res) => {
    try {
      const entry = await storage.getDailyReportDeliveryEntry(Number(req.params.id));
      if (!entry) return res.status(404).json({ message: "Delivery entry not found" });
      
      const report = await storage.getDailyReport(entry.reportId);
      if (report?.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
      
      const updated = await storage.updateDailyReportDeliveryEntry(Number(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update delivery entry" });
    }
  });

  app.delete("/api/daily-report-delivery-entries/:id", async (req, res) => {
    const entry = await storage.getDailyReportDeliveryEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ message: "Delivery entry not found" });
    
    const report = await storage.getDailyReport(entry.reportId);
    if (report?.status === 'completed') return res.status(403).json({ message: "Cannot delete from a completed report" });
    
    await storage.deleteDailyReportDeliveryEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report Photos
  app.post("/api/daily-report-photos", async (req, res) => {
    try {
      const { reportId, taskEntryId, deliveryEntryId, url, caption, createdBy, createdByName } = req.body;
      
      // Validate that at least one reference is provided
      if (!reportId && !taskEntryId && !deliveryEntryId) {
        return res.status(400).json({ message: "Must provide reportId, taskEntryId, or deliveryEntryId" });
      }
      
      // Check report is not completed
      let checkReportId = reportId;
      if (taskEntryId) {
        const entry = await storage.getDailyReportTaskEntry(taskEntryId);
        if (entry) checkReportId = entry.reportId;
      }
      if (deliveryEntryId) {
        const entry = await storage.getDailyReportDeliveryEntry(deliveryEntryId);
        if (entry) checkReportId = entry.reportId;
      }
      
      if (checkReportId) {
        const report = await storage.getDailyReport(checkReportId);
        if (report?.status === 'completed') {
          return res.status(403).json({ message: "Cannot add photos to a completed report" });
        }
      }
      
      const photo = await storage.createDailyReportPhoto({
        reportId,
        taskEntryId,
        deliveryEntryId,
        url,
        caption,
        createdBy,
        createdByName,
      });
      res.status(201).json(photo);
    } catch (err) {
      console.error("Create photo error:", err);
      return res.status(500).json({ message: "Failed to create photo" });
    }
  });

  app.delete("/api/daily-report-photos/:id", async (req, res) => {
    await storage.deleteDailyReportPhoto(Number(req.params.id));
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

  // Check if report exists for a specific date
  app.get('/api/projects/:projectId/reports/by-date/:date', async (req, res) => {
    const report = await storage.getDailyReportByDate(Number(req.params.projectId), req.params.date);
    if (!report) return res.status(404).json({ message: "No report for this date" });
    res.json(report);
  });

  // Report Tasks
  app.get(api.reportTasks.list.path, async (req, res) => {
    const tasks = await storage.getReportTasks(Number(req.params.reportId));
    res.json(tasks);
  });

  app.post(api.reportTasks.create.path, async (req, res) => {
    try {
      const input = api.reportTasks.create.input.parse(req.body);
      const task = await storage.createReportTask({
        ...input,
        reportId: Number(req.params.reportId),
      });
      res.status(201).json(task);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.reportTasks.update.path, async (req, res) => {
    try {
      const input = api.reportTasks.update.input.parse(req.body);
      const task = await storage.updateReportTask(Number(req.params.id), input);
      res.json(task);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.reportTasks.delete.path, async (req, res) => {
    await storage.deleteReportTask(Number(req.params.id));
    res.status(204).send();
  });

  // Labor Entries
  app.get(api.laborEntries.list.path, async (req, res) => {
    const entries = await storage.getLaborEntries(Number(req.params.reportTaskId));
    res.json(entries);
  });

  app.post(api.laborEntries.create.path, async (req, res) => {
    try {
      const input = api.laborEntries.create.input.parse(req.body);
      const entry = await storage.createLaborEntry({
        ...input,
        reportTaskId: Number(req.params.reportTaskId),
      });
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.laborEntries.update.path, async (req, res) => {
    try {
      const input = api.laborEntries.update.input.parse(req.body);
      const entry = await storage.updateLaborEntry(Number(req.params.id), input);
      res.json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.laborEntries.delete.path, async (req, res) => {
    await storage.deleteLaborEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Equipment Entries
  app.get(api.equipmentEntriesApi.list.path, async (req, res) => {
    const entries = await storage.getEquipmentEntries(Number(req.params.reportTaskId));
    res.json(entries);
  });

  app.post(api.equipmentEntriesApi.create.path, async (req, res) => {
    try {
      const input = api.equipmentEntriesApi.create.input.parse(req.body);
      const entry = await storage.createEquipmentEntry({
        ...input,
        reportTaskId: Number(req.params.reportTaskId),
      });
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.equipmentEntriesApi.update.path, async (req, res) => {
    try {
      const input = api.equipmentEntriesApi.update.input.parse(req.body);
      const entry = await storage.updateEquipmentEntry(Number(req.params.id), input);
      res.json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.equipmentEntriesApi.delete.path, async (req, res) => {
    await storage.deleteEquipmentEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Deliveries
  app.get(api.deliveriesApi.list.path, async (req, res) => {
    const deliveries = await storage.getDeliveries(Number(req.params.reportId));
    res.json(deliveries);
  });

  app.post(api.deliveriesApi.create.path, async (req, res) => {
    try {
      const input = api.deliveriesApi.create.input.parse(req.body);
      const delivery = await storage.createDelivery({
        ...input,
        reportId: Number(req.params.reportId),
      });
      res.status(201).json(delivery);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.deliveriesApi.update.path, async (req, res) => {
    try {
      const input = api.deliveriesApi.update.input.parse(req.body);
      const delivery = await storage.updateDelivery(Number(req.params.id), input);
      res.json(delivery);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.deliveriesApi.delete.path, async (req, res) => {
    await storage.deleteDelivery(Number(req.params.id));
    res.status(204).send();
  });

  return httpServer;
}
