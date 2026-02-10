import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { registerObjectStorageRoutes, ObjectStorageService } from "./replit_integrations/object_storage";
import type { User } from "@shared/schema";
import { insertAuthorizedUserSchema, insertRfiSchema } from "@shared/schema";
import { isAdmin, isAuthorizedUser } from "./middleware/auth";
import { sendInviteEmail } from "./services/email";
import { generateUploadSignature, deleteFromCloudinary } from "./services/cloudinary";
import {
  isOutlookConfigured, getAuthUrl, exchangeCodeForTokens, getRedirectUri,
  syncProjectEmails, getAttachmentContent, validateOAuthState
} from "./services/outlook";
import { processInboundEmail, verifyMailgunSignature } from "./services/inboundEmail";
import multer from "multer";

// Weather fetch helper using Open-Meteo API
async function fetchWeatherData(address: string, city: string, state: string): Promise<{
  weatherSummary: string;
  temperature: string;
  temperatureHigh: string;
  temperatureLow: string;
  windSpeed: string;
} | null> {
  try {
    // Geocode the address using OpenStreetMap Nominatim
    const locationQuery = `${address || ''} ${city || ''} ${state || ''}`.trim();
    if (!locationQuery) return null;
    
    const geocodeUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationQuery)}&format=json&limit=1`;
    const geocodeRes = await fetch(geocodeUrl, {
      headers: { 'User-Agent': 'SiteTech-Construction-App/1.0' }
    });
    
    if (!geocodeRes.ok) return null;
    const geocodeData = await geocodeRes.json();
    if (!geocodeData.length) return null;
    
    const { lat, lon } = geocodeData[0];
    
    // Fetch weather from Open-Meteo
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1`;
    const weatherRes = await fetch(weatherUrl);
    
    if (!weatherRes.ok) return null;
    const weatherData = await weatherRes.json();
    
    // Map WMO weather codes to descriptions
    const weatherCodes: Record<number, string> = {
      0: 'Clear sky',
      1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
      45: 'Foggy', 48: 'Depositing rime fog',
      51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
      61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
      71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow',
      80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
      95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
    };
    
    const weatherCode = weatherData.current?.weather_code || 0;
    const weatherSummary = weatherCodes[weatherCode] || 'Unknown';
    
    return {
      weatherSummary,
      temperature: weatherData.current?.temperature_2m?.toFixed(0) || '',
      temperatureHigh: weatherData.daily?.temperature_2m_max?.[0]?.toFixed(0) || '',
      temperatureLow: weatherData.daily?.temperature_2m_min?.[0]?.toFixed(0) || '',
      windSpeed: weatherData.current?.wind_speed_10m?.toFixed(0) || '',
    };
  } catch (err) {
    console.error('Weather fetch error:', err);
    return null;
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Auth Setup
  await setupAuth(app);
  registerAuthRoutes(app);
  
  // Object Storage Setup
  registerObjectStorageRoutes(app);

  // Admin Routes - User Management
  
  // Get all users (admin only)
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req, res) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers);
  });

  // Update user (admin only) - change role or authorization status
  app.put("/api/admin/users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { role, isAuthorized } = req.body;
      const updates: any = {};
      if (role) updates.role = role;
      if (isAuthorized) updates.isAuthorized = isAuthorized;
      
      const user = await storage.updateUser(req.params.id, updates);
      res.json(user);
    } catch (err) {
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Get all authorized emails (admin only)
  app.get("/api/admin/authorized-users", isAuthenticated, isAdmin, async (req, res) => {
    const authorizedUsers = await storage.getAuthorizedUsers();
    res.json(authorizedUsers);
  });

  // Add authorized email (admin only)
  app.post("/api/admin/authorized-users", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const input = insertAuthorizedUserSchema.parse(req.body);
      
      // Check if email already exists
      const existing = await storage.getAuthorizedUserByEmail(input.email);
      if (existing) {
        return res.status(400).json({ message: "Email already authorized" });
      }
      
      // Get admin user info
      const adminUser = req.user as any;
      const dbAdmin = await storage.getUser(adminUser.claims.sub);
      
      const authorized = await storage.createAuthorizedUser({
        ...input,
        addedBy: adminUser.claims.sub,
        addedByName: dbAdmin ? `${dbAdmin.firstName || ''} ${dbAdmin.lastName || ''}`.trim() || dbAdmin.email : undefined,
      });
      
      // Send invite email to the new authorized user (if Mailgun is configured)
      const mailgunDomain = process.env.MAILGUN_DOMAIN;
      const mailgunApiKey = process.env.MAILGUN_API_KEY;
      const mailgunFromEmail = process.env.MAILGUN_FROM_EMAIL;
      
      if (mailgunDomain && mailgunApiKey && mailgunFromEmail) {
        try {
          await sendInviteEmail(
            input.email, 
            input.role || 'user',
            mailgunDomain,
            mailgunApiKey,
            mailgunFromEmail
          );
        } catch (emailError) {
          console.error('Failed to send invite email:', emailError);
          // Don't fail the request if email fails - user is still authorized
        }
      } else {
        console.log('Mailgun not configured - skipping invite email');
      }
      
      res.status(201).json(authorized);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to add authorized user" });
    }
  });

  // Update authorized email (admin only)
  app.patch("/api/admin/authorized-users/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const updates = req.body;
      const updated = await storage.updateAuthorizedUser(req.params.id, updates);
      if (!updated) {
        return res.status(404).json({ message: "Authorized user not found" });
      }
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: "Failed to update authorized user" });
    }
  });

  // Delete authorized email (admin only)
  app.delete("/api/admin/authorized-users/:id", isAuthenticated, isAdmin, async (req, res) => {
    await storage.deleteAuthorizedUser(req.params.id);
    res.status(204).send();
  });

  // Customers - all routes protected by authorization
  app.get(api.customers.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const customers = await storage.getCustomers();
    res.json(customers);
  });

  app.get(api.customers.get.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const customer = await storage.getCustomer(Number(req.params.id));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json(customer);
  });

  app.post(api.customers.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put(api.customers.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.customers.update.input.parse(req.body);
      const customer = await storage.updateCustomer(Number(req.params.id), input);
      res.json(customer);
    } catch (err) {
      return res.status(404).json({ message: "Customer not found" });
    }
  });

  app.delete(api.customers.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteCustomer(Number(req.params.id));
    res.status(204).send();
  });

  // Projects - all routes protected by authorization
  app.get(api.projects.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const projects = await storage.getProjects();
    res.json(projects);
  });
  
  app.get("/api/projects/next-number", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const nextNumber = await storage.getNextProjectNumber();
    res.json({ projectNumber: nextNumber });
  });

  app.get(api.projects.get.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const project = await storage.getProject(Number(req.params.id));
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json(project);
  });

  app.post(api.projects.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.projects.create.input.parse(req.body);
      const project = await storage.createProject(input);
      
      // Auto-create default albums for the new project
      await storage.ensureDefaultAlbums(project.id);
      
      res.status(201).json(project);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.projects.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.projects.update.input.parse(req.body);
      const project = await storage.updateProject(Number(req.params.id), input);
      res.json(project);
    } catch (err) {
      return res.status(404).json({ message: "Project not found" });
    }
  });

  app.delete(api.projects.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteProject(Number(req.params.id));
    res.status(204).send();
  });

  // Tasks - all routes protected by authorization
  app.get(api.tasks.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const tasks = await storage.getTasks(Number(req.params.projectId));
    res.json(tasks);
  });

  app.get(api.tasks.getAll.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const tasks = await storage.getTasks();
    res.json(tasks);
  });

  app.post(api.tasks.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put(api.tasks.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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
  app.get("/api/tasks/:id/history", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const history = await storage.getTaskStatusHistory(Number(req.params.id));
    res.json(history);
  });

  app.delete(api.tasks.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteTask(Number(req.params.id));
    res.status(204).send();
  });

  // Equipment - all routes protected by authorization
  app.get(api.equipment.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const list = await storage.getEquipmentList();
    res.json(list);
  });

  app.get(api.equipment.get.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const item = await storage.getEquipment(Number(req.params.id));
    if (!item) return res.status(404).json({ message: "Equipment not found" });
    res.json(item);
  });

  app.post(api.equipment.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put(api.equipment.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.equipment.update.input.parse(req.body);
      const item = await storage.updateEquipment(Number(req.params.id), input);
      res.json(item);
    } catch (err) {
      return res.status(404).json({ message: "Equipment not found" });
    }
  });

  app.delete(api.equipment.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteEquipment(Number(req.params.id));
    res.status(204).send();
  });

  // Maintenance Logs - all routes protected by authorization
  app.get(api.maintenanceLogs.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const logs = await storage.getMaintenanceLogs(Number(req.params.equipmentId));
    res.json(logs);
  });

  app.post(api.maintenanceLogs.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.maintenanceLogs.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteMaintenanceLog(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Reports - all routes protected by authorization
  app.get(api.dailyReports.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const reports = await storage.getDailyReports(Number(req.params.projectId));
    res.json(reports);
  });

  // Get report by date
  app.get("/api/projects/:projectId/reports/by-date", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      return res.status(400).json({ message: "Date query parameter is required" });
    }
    const report = await storage.getDailyReportByDate(Number(req.params.projectId), date);
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  });

  app.get(api.dailyReports.get.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const report = await storage.getDailyReport(Number(req.params.id));
    if (!report) return res.status(404).json({ message: "Report not found" });
    
    // Check if this is the latest report for the project
    const latestReport = await storage.getLatestDailyReportForProject(report.projectId);
    const isLatestReport = latestReport?.id === report.id;
    
    // Fetch related data
    const taskEntries = await storage.getDailyReportTaskEntries(report.id);
    const deliveryEntries = await storage.getDailyReportDeliveryEntries(report.id);
    
    // For each task entry, get labor lines, equipment lines, photos, and snapshot bounds
    const taskEntriesWithDetails = await Promise.all(taskEntries.map(async (entry) => {
      const laborLines = await storage.getDailyReportLaborLines(entry.id);
      const equipmentLines = await storage.getDailyReportEquipmentLines(entry.id);
      const photos = await storage.getDailyReportPhotos(undefined, entry.id, undefined);
      const bounds = await storage.getTaskSnapshotBounds(
        report.projectId,
        entry.taskId,
        report.id,
        new Date(report.reportDate)
      );
      return { 
        ...entry, 
        laborLines, 
        equipmentLines, 
        photos,
        allowedMin: bounds.prevSnapshot,
        allowedMax: bounds.nextSnapshot
      };
    }));
    
    // For each delivery entry, get photos
    const deliveryEntriesWithPhotos = await Promise.all(deliveryEntries.map(async (entry) => {
      const photos = await storage.getDailyReportPhotos(undefined, undefined, entry.id);
      return { ...entry, photos };
    }));
    
    res.json({
      ...report,
      isLatestReport,
      taskEntries: taskEntriesWithDetails,
      deliveryEntries: deliveryEntriesWithPhotos,
    });
  });

  app.post(api.dailyReports.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const { reportDate, ...rest } = req.body;
      
      if (!reportDate) {
        return res.status(400).json({ message: "Report date is required" });
      }
      
      const today = new Date().toISOString().split('T')[0];
      if (reportDate > today) {
        return res.status(400).json({ message: "Cannot create reports for future dates" });
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
      
      // Fetch weather data using project address
      const project = await storage.getProject(projectId);
      let weatherData: Awaited<ReturnType<typeof fetchWeatherData>> = null;
      if (project) {
        weatherData = await fetchWeatherData(
          project.streetAddress || '',
          project.city || '',
          project.state || ''
        );
      }
      
      const report = await storage.createDailyReport({
        ...rest,
        reportDate,
        projectId,
        status: 'draft',
        ...(weatherData && {
          weatherSummary: weatherData.weatherSummary,
          temperature: weatherData.temperature,
          temperatureHigh: weatherData.temperatureHigh,
          temperatureLow: weatherData.temperatureLow,
          windSpeed: weatherData.windSpeed,
          weatherFetchedAt: new Date(),
        }),
      });
      res.status(201).json(report);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.dailyReports.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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
  app.post("/api/reports/:id/complete", isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.dailyReports.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const report = await storage.getDailyReport(Number(req.params.id));
    if (report?.status === 'completed') {
      return res.status(403).json({ message: "Cannot delete a completed report" });
    }
    await storage.deleteDailyReport(Number(req.params.id));
    res.status(204).send();
  });

  // PDF Export for Daily Report
  app.get("/api/reports/:id/pdf", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
      
      const reportId = Number(req.params.id);
      const includePhotos = req.query.includePhotos === 'true';
      
      // Object storage service for direct file access (bypasses auth)
      const objectStorageService = new ObjectStorageService();
      
      // Helper to convert photo URL to object path format
      const getObjectPath = (url: string): string => {
        if (!url) return url;
        if (url.startsWith('/objects/')) return url;
        if (url.startsWith('/.private/uploads/')) return url.replace('/.private/uploads/', '/objects/uploads/');
        if (url.startsWith('/uploads/')) return `/objects${url}`;
        if (url.includes('storage.googleapis.com')) {
          const match = url.match(/\/(?:\.private\/)?uploads\/([a-f0-9-]+)/);
          if (match) return `/objects/uploads/${match[1]}`;
        }
        return url;
      };
      
      const fetchPhotoFromUrl = async (url: string): Promise<Uint8Array | null> => {
        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.log(`[PDF Photo] HTTP fetch failed for: ${url} (${response.status})`);
            return null;
          }
          const arrayBuffer = await response.arrayBuffer();
          return new Uint8Array(arrayBuffer);
        } catch (err) {
          console.error(`[PDF Photo] Failed to fetch photo from URL: ${url}`, err);
          return null;
        }
      };

      const getPhotoBytes = async (url: string): Promise<Uint8Array | null> => {
        try {
          if (url.startsWith('http://') || url.startsWith('https://')) {
            const objectPath = getObjectPath(url);
            if (objectPath.startsWith('/objects/')) {
              try {
                const file = await objectStorageService.getObjectEntityFile(objectPath);
                const [buffer] = await file.download();
                return new Uint8Array(buffer);
              } catch {
                console.log(`[PDF Photo] Object storage failed, trying HTTP fetch: ${url}`);
              }
            }
            return await fetchPhotoFromUrl(url);
          }

          const objectPath = getObjectPath(url);
          if (!objectPath.startsWith('/objects/')) {
            console.log(`[PDF Photo] Skipping unrecognized URL: ${url}`);
            return null;
          }
          const file = await objectStorageService.getObjectEntityFile(objectPath);
          const [buffer] = await file.download();
          return new Uint8Array(buffer);
        } catch (err) {
          console.error(`[PDF Photo] Failed to read photo: ${url}`, err);
          return null;
        }
      };
      
      const report = await storage.getDailyReport(reportId);
      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }
      
      const project = await storage.getProject(report.projectId);
      const taskEntries = await storage.getDailyReportTaskEntries(reportId);
      const deliveryEntries = await storage.getDailyReportDeliveryEntries(reportId);
      
      // Load labor, equipment lines, and photos for each task entry
      const taskEntriesWithLines = await Promise.all(
        taskEntries.map(async (entry) => ({
          ...entry,
          laborLines: await storage.getDailyReportLaborLines(entry.id),
          equipmentLines: await storage.getDailyReportEquipmentLines(entry.id),
          photos: includePhotos ? await storage.getDailyReportPhotos(undefined, entry.id, undefined) : [],
        }))
      );
      
      // Load photos for delivery entries if including photos
      const deliveryEntriesWithPhotos = await Promise.all(
        deliveryEntries.map(async (entry) => ({
          ...entry,
          photos: includePhotos ? await storage.getDailyReportPhotos(undefined, undefined, entry.id) : [],
        }))
      );
      
      // Create PDF
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      
      const pageWidth = 612;
      const pageHeight = 792;
      let page = pdfDoc.addPage([pageWidth, pageHeight]);
      const { height } = page.getSize();
      let y = height;
      const margin = 45;
      const contentWidth = pageWidth - margin * 2;
      const rightEdge = pageWidth - margin;
      const lineHeight = 14;

      const brandNavy = rgb(0.12, 0.18, 0.28);
      const brandGold = rgb(0.82, 0.66, 0.2);
      const darkText = rgb(0.1, 0.1, 0.1);
      const mediumText = rgb(0.35, 0.35, 0.35);
      const lightText = rgb(0.55, 0.55, 0.55);
      const sectionBg = rgb(0.94, 0.95, 0.97);
      const tableBorder = rgb(0.82, 0.84, 0.88);
      const successGreen = rgb(0.18, 0.55, 0.24);
      const warningRed = rgb(0.7, 0.15, 0.15);
      
      const drawText = (text: string, x: number, yPos: number, size = 10, useBold = false, color = darkText) => {
        const safeText = (text || '').replace(/[\n\r\t]/g, ' ');
        page.drawText(safeText, { x, y: yPos, size, font: useBold ? boldFont : font, color });
      };

      const drawItalicText = (text: string, x: number, yPos: number, size = 10, color = mediumText) => {
        const safeText = (text || '').replace(/[\n\r\t]/g, ' ');
        page.drawText(safeText, { x, y: yPos, size, font: italicFont, color });
      };

      const wrapText = (text: string, maxWidth: number, fontSize: number, useFont = font): string[] => {
        const lines: string[] = [];
        const paragraphs = (text || '').split('\n');
        for (const para of paragraphs) {
          const words = para.split(' ');
          let currentLine = '';
          for (const word of words) {
            const testLine = currentLine + (currentLine ? ' ' : '') + word;
            const w = useFont.widthOfTextAtSize(testLine, fontSize);
            if (w > maxWidth && currentLine) {
              lines.push(currentLine);
              currentLine = word;
            } else {
              currentLine = testLine;
            }
          }
          if (currentLine) lines.push(currentLine);
        }
        return lines;
      };

      const addDraftWatermark = (pg: any) => {
        if (report.status === 'draft') {
          pg.drawText("DRAFT", {
            x: 150,
            y: 350,
            size: 100,
            font: boldFont,
            color: rgb(0.92, 0.92, 0.92),
            rotate: degrees(45),
          });
        }
      };
      
      const addNewPageIfNeeded = (spaceNeeded = 80) => {
        if (y < spaceNeeded) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          y = height - 50;
          addDraftWatermark(page);
        }
      };

      const drawSectionHeader = (title: string) => {
        addNewPageIfNeeded(60);
        page.drawRectangle({
          x: margin,
          y: y - 6,
          width: contentWidth,
          height: 22,
          color: brandNavy,
        });
        page.drawText(title, {
          x: margin + 10,
          y: y,
          size: 10,
          font: boldFont,
          color: rgb(1, 1, 1),
        });
        y -= 28;
      };

      const drawInfoRow = (label: string, value: string, x: number, labelWidth = 90) => {
        drawText(label, x, y, 9, true, mediumText);
        drawText(value, x + labelWidth, y, 9, false, darkText);
        y -= lineHeight;
      };

      const drawTableHeader = (columns: { label: string; x: number; width: number }[]) => {
        page.drawRectangle({
          x: margin + 10,
          y: y - 4,
          width: contentWidth - 20,
          height: 16,
          color: sectionBg,
        });
        page.drawLine({
          start: { x: margin + 10, y: y - 4 },
          end: { x: rightEdge - 10, y: y - 4 },
          thickness: 0.5,
          color: tableBorder,
        });
        for (const col of columns) {
          page.drawText(col.label, {
            x: col.x,
            y: y,
            size: 8,
            font: boldFont,
            color: mediumText,
          });
        }
        y -= 18;
      };
      
      addDraftWatermark(page);

      // === HEADER WITH LOGO ===
      let logoImage: any = null;
      try {
        const fs = await import('fs');
        const path = await import('path');
        const logoPaths = [
          path.resolve('attached_assets/Logo_1770600587313.png'),
          path.resolve('client/src/assets/sitetech-logo.png'),
          path.join(__dirname, '..', 'attached_assets', 'Logo_1770600587313.png'),
          path.join(__dirname, '..', 'client', 'src', 'assets', 'sitetech-logo.png'),
        ];
        for (const lp of logoPaths) {
          try {
            if (fs.existsSync(lp)) {
              const logoBytes = fs.readFileSync(lp);
              logoImage = await pdfDoc.embedPng(logoBytes);
              break;
            }
          } catch { continue; }
        }
      } catch (logoErr) {
        console.log('[PDF] Could not embed logo:', logoErr);
      }

      page.drawRectangle({
        x: 0,
        y: height - 90,
        width: pageWidth,
        height: 90,
        color: brandNavy,
      });

      page.drawRectangle({
        x: 0,
        y: height - 94,
        width: pageWidth,
        height: 4,
        color: brandGold,
      });

      if (logoImage) {
        const logoMaxH = 55;
        const logoMaxW = 140;
        const logoScale = Math.min(logoMaxW / logoImage.width, logoMaxH / logoImage.height);
        const logoW = logoImage.width * logoScale;
        const logoH = logoImage.height * logoScale;
        page.drawImage(logoImage, {
          x: margin,
          y: height - 18 - logoH,
          width: logoW,
          height: logoH,
        });
      } else {
        page.drawText("SiteTech", {
          x: margin,
          y: height - 55,
          size: 24,
          font: boldFont,
          color: rgb(1, 1, 1),
        });
      }

      page.drawText("DAILY FIELD REPORT", {
        x: rightEdge - boldFont.widthOfTextAtSize("DAILY FIELD REPORT", 18),
        y: height - 42,
        size: 18,
        font: boldFont,
        color: rgb(1, 1, 1),
      });

      const statusLabel = report.status === 'completed' ? 'COMPLETED' : 'DRAFT';
      const statusColor = report.status === 'completed' ? successGreen : brandGold;
      const statusWidth = boldFont.widthOfTextAtSize(statusLabel, 9);
      page.drawRectangle({
        x: rightEdge - statusWidth - 14,
        y: height - 64,
        width: statusWidth + 14,
        height: 16,
        color: statusColor,
        borderColor: statusColor,
        borderWidth: 0,
      });
      page.drawText(statusLabel, {
        x: rightEdge - statusWidth - 7,
        y: height - 60,
        size: 9,
        font: boldFont,
        color: rgb(1, 1, 1),
      });

      y = height - 110;

      // === PROJECT INFO BAND ===
      page.drawRectangle({
        x: margin,
        y: y - 8,
        width: contentWidth,
        height: 56,
        color: sectionBg,
        borderColor: tableBorder,
        borderWidth: 0.5,
      });

      const reportDate = new Date(report.reportDate);
      const formattedDate = reportDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

      const infoLeftX = margin + 12;
      const infoRightX = margin + contentWidth / 2 + 10;
      let infoY = y + 30;

      if (project) {
        drawText('Project:', infoLeftX, infoY, 8, true, mediumText);
        drawText(`${project.projectNumber || ''} - ${project.name}`, infoLeftX + 45, infoY, 9, true, darkText);
      }
      drawText('Date:', infoRightX, infoY, 8, true, mediumText);
      drawText(formattedDate, infoRightX + 32, infoY, 9, false, darkText);
      infoY -= 16;

      if (project && (project.streetAddress || project.city || project.state)) {
        const address = [project.streetAddress, project.city, project.state].filter(Boolean).join(", ");
        drawText('Location:', infoLeftX, infoY, 8, true, mediumText);
        drawText(address, infoLeftX + 50, infoY, 9, false, darkText);
      }
      if (report.status === 'completed' && report.completedByName) {
        drawText('Prepared by:', infoRightX, infoY, 8, true, mediumText);
        drawText(report.completedByName, infoRightX + 65, infoY, 9, false, darkText);
      }

      y -= 20;

      // === WEATHER CONDITIONS ===
      drawSectionHeader("WEATHER CONDITIONS");
      
      const weatherItems = [
        report.weatherSummary ? `Conditions: ${report.weatherSummary}` : null,
        report.temperature ? `Temperature: ${report.temperature}\u00B0F` : null,
        (report.temperatureHigh || report.temperatureLow) 
          ? `High/Low: ${report.temperatureHigh || '--'}\u00B0F / ${report.temperatureLow || '--'}\u00B0F` 
          : null,
        report.windSpeed ? `Wind: ${report.windSpeed} mph` : null,
      ].filter(Boolean);
      
      if (weatherItems.length > 0) {
        const weatherCol1 = weatherItems.slice(0, 2);
        const weatherCol2 = weatherItems.slice(2);
        const maxRows = Math.max(weatherCol1.length, weatherCol2.length);
        for (let i = 0; i < maxRows; i++) {
          if (weatherCol1[i]) drawText(weatherCol1[i] as string, margin + 12, y, 9, false, darkText);
          if (weatherCol2[i]) drawText(weatherCol2[i] as string, margin + contentWidth / 2, y, 9, false, darkText);
          y -= lineHeight;
        }
      } else {
        drawItalicText("No weather data recorded", margin + 12, y, 9);
        y -= lineHeight;
      }
      y -= 10;

      // === DAILY OPERATIONS ===
      drawSectionHeader("DAILY OPERATIONS");
      
      if (taskEntriesWithLines.length === 0) {
        drawItalicText("No tasks recorded", margin + 12, y, 9);
        y -= lineHeight;
      } else {
        for (let tIdx = 0; tIdx < taskEntriesWithLines.length; tIdx++) {
          const entry = taskEntriesWithLines[tIdx];
          addNewPageIfNeeded(50);

          page.drawRectangle({
            x: margin + 5,
            y: y - 4,
            width: contentWidth - 10,
            height: 18,
            color: rgb(0.96, 0.97, 0.99),
            borderColor: tableBorder,
            borderWidth: 0.3,
          });
          drawText(`${tIdx + 1}. ${entry.taskTitleSnapshot}`, margin + 12, y, 10, true, brandNavy);
          
          const progressLabel = `${entry.percentComplete}%`;
          const progressLabelWidth = boldFont.widthOfTextAtSize(progressLabel, 9);
          const progressBarX = rightEdge - 100;
          const progressBarWidth = 80;
          const progressFill = (entry.percentComplete / 100) * progressBarWidth;

          page.drawRectangle({ x: progressBarX, y: y - 2, width: progressBarWidth, height: 10, color: rgb(0.88, 0.88, 0.88) });
          page.drawRectangle({ x: progressBarX, y: y - 2, width: progressFill, height: 10, color: brandGold });
          drawText(progressLabel, progressBarX - progressLabelWidth - 5, y, 9, true, darkText);
          y -= 24;
          
          if (entry.comments) {
            const commentLines = wrapText(entry.comments, contentWidth - 40, 9);
            for (const cLine of commentLines) {
              addNewPageIfNeeded();
              drawItalicText(cLine, margin + 15, y, 9, mediumText);
              y -= lineHeight;
            }
            y -= 2;
          }
          
          if (entry.laborLines && entry.laborLines.length > 0) {
            addNewPageIfNeeded(40);
            drawText("Labor", margin + 15, y, 9, true, mediumText);
            y -= 14;
            
            const laborCols = [
              { label: "EMPLOYEE", x: margin + 20, width: 180 },
              { label: "ROLE", x: margin + 220, width: 120 },
              { label: "HOURS", x: margin + 370, width: 80 },
            ];
            drawTableHeader(laborCols);
            
            let totalHours = 0;
            for (const labor of entry.laborLines) {
              addNewPageIfNeeded();
              drawText(labor.employeeName || 'Unknown', margin + 20, y, 9);
              drawText(labor.laborType, margin + 220, y, 9);
              drawText(String(labor.hours), margin + 385, y, 9);
              totalHours += Number(labor.hours);
              y -= lineHeight;
            }
            page.drawLine({
              start: { x: margin + 10, y: y + 4 },
              end: { x: rightEdge - 10, y: y + 4 },
              thickness: 0.5,
              color: tableBorder,
            });
            drawText("Totals:", margin + 20, y, 9, true, mediumText);
            drawText(`${entry.laborLines.length} workers`, margin + 220, y, 9, true, darkText);
            drawText(String(totalHours.toFixed(2)), margin + 385, y, 9, true, darkText);
            y -= lineHeight + 4;
          }
          
          if (entry.equipmentLines && entry.equipmentLines.length > 0) {
            addNewPageIfNeeded(40);
            drawText("Equipment", margin + 15, y, 9, true, mediumText);
            y -= 14;
            
            const equipCols = [
              { label: "TYPE", x: margin + 20, width: 200 },
              { label: "UNITS", x: margin + 250, width: 80 },
              { label: "HOURS", x: margin + 350, width: 80 },
              { label: "TOTAL HRS", x: margin + 430, width: 80 },
            ];
            drawTableHeader(equipCols);
            
            let totalUnits = 0;
            let totalEquipHours = 0;
            for (const equip of entry.equipmentLines) {
              addNewPageIfNeeded();
              drawText(equip.equipmentType, margin + 20, y, 9);
              drawText(String(equip.quantity), margin + 270, y, 9);
              drawText(String(equip.hours), margin + 365, y, 9);
              const lineTotal = equip.quantity * equip.hours;
              drawText(String(lineTotal), margin + 450, y, 9);
              totalUnits += equip.quantity;
              totalEquipHours += lineTotal;
              y -= lineHeight;
            }
            page.drawLine({
              start: { x: margin + 10, y: y + 4 },
              end: { x: rightEdge - 10, y: y + 4 },
              thickness: 0.5,
              color: tableBorder,
            });
            drawText("Totals:", margin + 20, y, 9, true, mediumText);
            drawText(String(totalUnits), margin + 270, y, 9, true, darkText);
            drawText(String(totalEquipHours), margin + 450, y, 9, true, darkText);
            y -= lineHeight + 4;
          }
          
          if (entry.photos && entry.photos.length > 0) {
            addNewPageIfNeeded(40);
            drawText("Photos", margin + 15, y, 9, true, mediumText);
            y -= lineHeight + 5;
            
            const photoMaxWidth = 235;
            const photoMaxHeight = 160;
            const photoGap = 20;
            
            for (let i = 0; i < entry.photos.length; i += 2) {
              const photosInRow: { image: any; width: number; height: number }[] = [];
              for (let j = 0; j < 2 && i + j < entry.photos.length; j++) {
                const photo = entry.photos[i + j];
                try {
                  const imageBytes = await getPhotoBytes(photo.url);
                  if (!imageBytes) continue;
                  let embeddedImage;
                  try { embeddedImage = await pdfDoc.embedJpg(imageBytes); }
                  catch { try { embeddedImage = await pdfDoc.embedPng(imageBytes); } catch { continue; } }
                  const scale = Math.min(photoMaxWidth / embeddedImage.width, photoMaxHeight / embeddedImage.height);
                  photosInRow.push({ image: embeddedImage, width: embeddedImage.width * scale, height: embeddedImage.height * scale });
                } catch (err) { console.error("Failed to embed task photo:", err); }
              }
              if (photosInRow.length > 0) {
                const maxRowHeight = Math.max(...photosInRow.map(p => p.height));
                if (y - maxRowHeight < 80) { page = pdfDoc.addPage([pageWidth, pageHeight]); y = height - 50; addDraftWatermark(page); }
                let xPos = margin + 15;
                for (const p of photosInRow) {
                  page.drawRectangle({ x: xPos - 2, y: y - p.height - 2, width: p.width + 4, height: p.height + 4, borderColor: tableBorder, borderWidth: 0.5, color: rgb(1, 1, 1) });
                  page.drawImage(p.image, { x: xPos, y: y - p.height, width: p.width, height: p.height });
                  xPos += p.width + photoGap;
                }
                y -= maxRowHeight + 12;
              }
            }
          }
          
          if (tIdx < taskEntriesWithLines.length - 1) {
            page.drawLine({
              start: { x: margin + 10, y: y + 2 },
              end: { x: rightEdge - 10, y: y + 2 },
              thickness: 0.3,
              color: rgb(0.85, 0.85, 0.85),
            });
            y -= 8;
          }
        }
      }
      y -= 12;

      // === DELIVERIES ===
      drawSectionHeader("DELIVERIES");
      
      if (deliveryEntriesWithPhotos.length === 0) {
        drawItalicText("No deliveries recorded", margin + 12, y, 9);
        y -= lineHeight;
      } else {
        for (const delivery of deliveryEntriesWithPhotos) {
          addNewPageIfNeeded(50);
          drawText(delivery.vendor || 'Unknown vendor', margin + 12, y, 10, true, darkText);
          if (delivery.deliveryTime) {
            const timeStr = delivery.deliveryTime;
            drawText(timeStr, rightEdge - 10 - font.widthOfTextAtSize(timeStr, 9), y, 9, false, mediumText);
          }
          y -= lineHeight + 2;
          
          if (delivery.description) {
            const descLines = wrapText(delivery.description, contentWidth - 40, 9);
            for (const dLine of descLines) {
              addNewPageIfNeeded();
              drawText(dLine, margin + 15, y, 9, false, darkText);
              y -= lineHeight;
            }
          }
          
          const delivered = delivery.allDelivered;
          const statusText = delivered ? "All items delivered" : "Missing items";
          const statusClr = delivered ? successGreen : warningRed;
          drawText("Status: ", margin + 15, y, 9, true, mediumText);
          drawText(statusText, margin + 55, y, 9, true, statusClr);
          y -= lineHeight;
          
          if (!delivery.allDelivered && delivery.missingItemsDetails) {
            drawText("Missing: ", margin + 15, y, 9, true, mediumText);
            const missingLines = wrapText(delivery.missingItemsDetails, contentWidth - 90, 9);
            for (let mIdx = 0; mIdx < missingLines.length; mIdx++) {
              addNewPageIfNeeded();
              drawText(missingLines[mIdx], mIdx === 0 ? margin + 60 : margin + 15, y, 9, false, warningRed);
              y -= lineHeight;
            }
          }
          
          if (delivery.photos && delivery.photos.length > 0) {
            drawText("Photos:", margin + 15, y, 9, true, mediumText);
            y -= lineHeight + 5;
            const photoMaxWidth = 235;
            const photoMaxHeight = 160;
            const photoGap = 20;
            for (let i = 0; i < delivery.photos.length; i += 2) {
              const photosInRow: { image: any; width: number; height: number }[] = [];
              for (let j = 0; j < 2 && i + j < delivery.photos.length; j++) {
                const photo = delivery.photos[i + j];
                try {
                  const imageBytes = await getPhotoBytes(photo.url);
                  if (!imageBytes) continue;
                  let embeddedImage;
                  try { embeddedImage = await pdfDoc.embedJpg(imageBytes); }
                  catch { try { embeddedImage = await pdfDoc.embedPng(imageBytes); } catch { continue; } }
                  const scale = Math.min(photoMaxWidth / embeddedImage.width, photoMaxHeight / embeddedImage.height);
                  photosInRow.push({ image: embeddedImage, width: embeddedImage.width * scale, height: embeddedImage.height * scale });
                } catch (err) { console.error("Failed to embed delivery photo:", err); }
              }
              if (photosInRow.length > 0) {
                const maxRowHeight = Math.max(...photosInRow.map(p => p.height));
                if (y - maxRowHeight < 80) { page = pdfDoc.addPage([pageWidth, pageHeight]); y = height - 50; addDraftWatermark(page); }
                let xPos = margin + 15;
                for (const p of photosInRow) {
                  page.drawRectangle({ x: xPos - 2, y: y - p.height - 2, width: p.width + 4, height: p.height + 4, borderColor: tableBorder, borderWidth: 0.5, color: rgb(1, 1, 1) });
                  page.drawImage(p.image, { x: xPos, y: y - p.height, width: p.width, height: p.height });
                  xPos += p.width + photoGap;
                }
                y -= maxRowHeight + 12;
              }
            }
          }
          
          y -= 5;
          addNewPageIfNeeded();
        }
      }
      y -= 12;
      
      // === NOTES ===
      if (report.notes) {
        drawSectionHeader("NOTES");
        const noteLines = wrapText(report.notes, contentWidth - 30, 9);
        for (const nLine of noteLines) {
          addNewPageIfNeeded();
          drawText(nLine, margin + 12, y, 9, false, darkText);
          y -= lineHeight;
        }
        y -= 12;
      }
      
      // === SIGNATURE ===
      if (report.status === 'completed' && report.completedByName) {
        drawSectionHeader("VERIFICATION & SIGNATURE");

        drawText("I hereby certify that this report is an accurate record of the day's activities.", margin + 12, y, 9, false, mediumText);
        y -= lineHeight + 8;

        if (report.signatureType === 'freehand' && report.signatureValue) {
          try {
            const base64Data = report.signatureValue.replace(/^data:image\/\w+;base64,/, '');
            const signatureBytes = Buffer.from(base64Data, 'base64');
            let signatureImage;
            try { signatureImage = await pdfDoc.embedPng(signatureBytes); }
            catch { try { signatureImage = await pdfDoc.embedJpg(signatureBytes); } catch { signatureImage = null; } }
            if (signatureImage) {
              const sigMaxWidth = 200;
              const sigMaxHeight = 60;
              const sigScale = Math.min(sigMaxWidth / signatureImage.width, sigMaxHeight / signatureImage.height);
              const sigWidth = signatureImage.width * sigScale;
              const sigHeight = signatureImage.height * sigScale;
              if (y - sigHeight < 80) { page = pdfDoc.addPage([pageWidth, pageHeight]); y = height - 50; addDraftWatermark(page); }
              page.drawImage(signatureImage, { x: margin + 12, y: y - sigHeight, width: sigWidth, height: sigHeight });
              y -= sigHeight + 6;
            }
          } catch (sigErr) {
            console.error("Failed to embed signature image:", sigErr);
          }
        } else if (report.signatureType === 'typed' && report.signatureValue) {
          drawItalicText(report.signatureValue, margin + 12, y, 16, darkText);
          y -= 24;
        }

        page.drawLine({
          start: { x: margin + 12, y: y },
          end: { x: margin + 220, y: y },
          thickness: 1,
          color: darkText,
        });
        y -= 14;
        drawText(report.completedByName, margin + 12, y, 10, true, darkText);
        
        if (report.completedAt) {
          const signedDate = new Date(report.completedAt).toLocaleString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
          });
          drawText(signedDate, margin + 240, y, 9, false, mediumText);
        }
        y -= lineHeight;
        drawText("Signature", margin + 12, y, 8, false, lightText);
        drawText("Date", margin + 240, y, 8, false, lightText);
      }
      
      // === FOOTER ON ALL PAGES ===
      const totalPages = pdfDoc.getPageCount();
      for (let i = 0; i < totalPages; i++) {
        const pg = pdfDoc.getPage(i);
        pg.drawLine({
          start: { x: margin, y: 38 },
          end: { x: pageWidth - margin, y: 38 },
          thickness: 0.5,
          color: tableBorder,
        });
        pg.drawText("SiteTech", { x: margin, y: 24, size: 8, font: boldFont, color: mediumText });
        pg.drawText(`Page ${i + 1} of ${totalPages}`, {
          x: pageWidth / 2 - font.widthOfTextAtSize(`Page ${i + 1} of ${totalPages}`, 8) / 2,
          y: 24, size: 8, font, color: lightText
        });
        pg.drawText(`Generated: ${new Date().toLocaleString('en-US')}`, {
          x: pageWidth - margin - font.widthOfTextAtSize(`Generated: ${new Date().toLocaleString('en-US')}`, 7),
          y: 24, size: 7, font, color: lightText
        });
      }
      
      const pdfBytes = await pdfDoc.save();
      
      const filename = `daily-report-${report.reportDate}-${project?.projectNumber || 'unknown'}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(Buffer.from(pdfBytes));
    } catch (err) {
      console.error("PDF generation error:", err);
      return res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Daily Report Task Entries - all routes protected by authorization
  app.get("/api/reports/:reportId/task-entries", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const entries = await storage.getDailyReportTaskEntries(Number(req.params.reportId));
    res.json(entries);
  });

  app.post("/api/reports/:reportId/task-entries", isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put("/api/daily-report-task-entries/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const entryId = Number(req.params.id);
      const entry = await storage.getDailyReportTaskEntry(entryId);
      if (!entry) return res.status(404).json({ message: "Task entry not found" });
      
      const report = await storage.getDailyReport(entry.reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (report.status === 'completed') return res.status(403).json({ code: "REPORT_LOCKED", message: "Cannot edit a completed report" });
      
      // Validate monotonic constraint for percentComplete changes
      if (req.body.percentComplete !== undefined) {
        const newPercent = req.body.percentComplete;
        const bounds = await storage.getTaskSnapshotBounds(
          report.projectId, 
          entry.taskId, 
          report.id, 
          new Date(report.reportDate)
        );
        
        if (newPercent < bounds.prevSnapshot || newPercent > bounds.nextSnapshot) {
          return res.status(409).json({
            code: "SNAPSHOT_OUT_OF_RANGE",
            message: `Value must be between ${bounds.prevSnapshot}% (previous report) and ${bounds.nextSnapshot}% (later report).`,
            allowedMin: bounds.prevSnapshot,
            allowedMax: bounds.nextSnapshot
          });
        }
      }
      
      const updated = await storage.updateDailyReportTaskEntry(entryId, req.body);
      
      // Only sync progress to the main task if this is the latest report for the project
      if (req.body.percentComplete !== undefined) {
        const latestReport = await storage.getLatestDailyReportForProject(report.projectId);
        const isLatestReport = latestReport?.id === report.id;
        
        if (isLatestReport) {
          const task = await storage.getTask(entry.taskId);
          if (task) {
            const newPercent = req.body.percentComplete;
            const newStatus = newPercent === 0 ? 'pending' 
              : newPercent === 100 ? 'completed' 
              : 'in_progress';
            
            const statusChanged = newStatus !== task.status;
            const percentChanged = newPercent !== task.percentComplete;
            
            await storage.updateTask(entry.taskId, { 
              percentComplete: newPercent,
              status: newStatus
            });
            
            // Create status history entry for changes from Daily Report
            if (statusChanged || percentChanged) {
              try {
                let changedByUserId = "unknown";
                let changedByName = "Unknown User";
                
                if (req.user) {
                  const user = req.user as User;
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
                  taskId: entry.taskId,
                  previousStatus: statusChanged ? task.status : null,
                  newStatus: statusChanged ? newStatus : null,
                  previousPercentComplete: percentChanged ? task.percentComplete : null,
                  newPercentComplete: percentChanged ? newPercent : null,
                  changedByUserId,
                  changedByName,
                  source: "daily_report",
                  dailyReportId: report.id,
                });
              } catch (historyErr) {
                console.error("Failed to create task status history from daily report:", historyErr);
              }
            }
          }
        }
      }
      
      res.json(updated);
    } catch (err) {
      console.error("Update task entry error:", err);
      return res.status(500).json({ message: "Failed to update task entry" });
    }
  });

  app.delete("/api/daily-report-task-entries/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const entry = await storage.getDailyReportTaskEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ message: "Task entry not found" });
    
    const report = await storage.getDailyReport(entry.reportId);
    if (report?.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
    
    await storage.deleteDailyReportTaskEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report - Get employees who punched in to a project on a specific date
  app.get("/api/daily-reports/project-employees", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { projectId, date } = req.query;
      if (!projectId || !date) {
        return res.status(400).json({ message: "projectId and date are required" });
      }

      const mappings = await storage.getProjectMappingsByProjectId(Number(projectId));
      if (mappings.length === 0) {
        return res.json([]);
      }

      const jobCodes = mappings.map(m => m.fingercheckJobCode);

      const allPunches = await storage.getTimePunches({
        startDate: date as string,
        endDate: date as string,
      });

      const projectPunches = allPunches.filter(p => p.jobCode && jobCodes.includes(p.jobCode));

      if (projectPunches.length === 0) {
        return res.json([]);
      }

      const { buildDailyTimeSummaries } = await import("./services/fingercheck");
      const summaries = buildDailyTimeSummaries(projectPunches);

      const result = summaries.map(s => {
        let availableHours = s.totalHours;
        const hasOpenShift = s.shifts.some(shift => shift.punchOut === null);
        if (hasOpenShift) {
          const openShift = s.shifts.find(shift => shift.punchOut === null);
          if (openShift) {
            const punchInTime = new Date(openShift.punchIn);
            const now = new Date();
            const openHours = (now.getTime() - punchInTime.getTime()) / (1000 * 60 * 60);
            availableHours = s.shifts
              .filter(shift => shift.punchOut !== null)
              .reduce((sum, shift) => sum + (shift.hours || 0), 0)
              + Math.round(openHours * 100) / 100;
          }
        }

        return {
          employeeId: s.employeeId,
          employeeName: s.employeeName,
          totalHours: Math.round(availableHours * 100) / 100,
          hasOpenShift,
          shifts: s.shifts,
          jobCode: s.jobCode,
          jobDescription: s.jobDescription,
        };
      });

      res.json(result);
    } catch (err: any) {
      console.error("Get project employees error:", err);
      res.status(500).json({ message: err.message || "Failed to get project employees" });
    }
  });

  // Daily Report Labor Lines - all routes protected by authorization
  app.post("/api/daily-report-task-entries/:taskEntryId/labor-lines", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const taskEntryId = Number(req.params.taskEntryId);
      const entry = await storage.getDailyReportTaskEntry(taskEntryId);
      if (!entry) return res.status(404).json({ message: "Task entry not found" });
      
      const report = await storage.getDailyReport(entry.reportId);
      if (report?.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
      
      const { laborType, quantity, hours, employeeId, employeeName } = req.body;
      const line = await storage.createDailyReportLaborLine({
        taskEntryId,
        laborType: laborType || 'Laborer',
        quantity: quantity || 1,
        hours: hours || 0,
        employeeId: employeeId || null,
        employeeName: employeeName || null,
      });
      res.status(201).json(line);
    } catch (err) {
      console.error("Create labor line error:", err);
      return res.status(500).json({ message: "Failed to create labor line" });
    }
  });

  app.put("/api/daily-report-labor-lines/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const updated = await storage.updateDailyReportLaborLine(Number(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update labor line" });
    }
  });

  app.delete("/api/daily-report-labor-lines/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteDailyReportLaborLine(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report Equipment Lines - all routes protected by authorization
  app.post("/api/daily-report-task-entries/:taskEntryId/equipment-lines", isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put("/api/daily-report-equipment-lines/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const updated = await storage.updateDailyReportEquipmentLine(Number(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update equipment line" });
    }
  });

  app.delete("/api/daily-report-equipment-lines/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteDailyReportEquipmentLine(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report Delivery Entries
  app.post("/api/reports/:reportId/delivery-entries", isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put("/api/daily-report-delivery-entries/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete("/api/daily-report-delivery-entries/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const entry = await storage.getDailyReportDeliveryEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ message: "Delivery entry not found" });
    
    const report = await storage.getDailyReport(entry.reportId);
    if (report?.status === 'completed') return res.status(403).json({ message: "Cannot delete from a completed report" });
    
    await storage.deleteDailyReportDeliveryEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report Photos
  app.post("/api/daily-report-photos", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { reportId, taskEntryId, deliveryEntryId, url, caption, createdBy, createdByName, cloudinaryPublicId, cloudinaryUrl, fileName, takenAt } = req.body;
      
      // Validate that at least one reference is provided
      if (!reportId && !taskEntryId && !deliveryEntryId) {
        return res.status(400).json({ message: "Must provide reportId, taskEntryId, or deliveryEntryId" });
      }
      
      // Get the report and check if it's completed
      let checkReportId = reportId;
      if (taskEntryId) {
        const entry = await storage.getDailyReportTaskEntry(taskEntryId);
        if (entry) checkReportId = entry.reportId;
      }
      if (deliveryEntryId) {
        const entry = await storage.getDailyReportDeliveryEntry(deliveryEntryId);
        if (entry) checkReportId = entry.reportId;
      }
      
      let report = null;
      if (checkReportId) {
        report = await storage.getDailyReport(checkReportId);
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
        takenAt: takenAt ? new Date(takenAt) : null,
      });
      
      // Also add the photo to the "Daily Report Photos" album in Project Photos
      // Support both Cloudinary (new) and objectPath (legacy)
      if (report && (cloudinaryPublicId || cloudinaryUrl)) {
        try {
          const album = await storage.getOrCreateDailyReportAlbum(report.projectId);
          
          await storage.createPhoto({
            projectId: report.projectId,
            albumId: album.id,
            name: fileName || `daily-report-photo-${photo.id}`,
            cloudinaryPublicId,
            cloudinaryUrl,
            contentType: 'image/jpeg',
            takenAt: takenAt ? new Date(takenAt) : null,
            displayDate: takenAt ? new Date(takenAt) : new Date(),
          });
        } catch (albumErr) {
          console.error("Failed to add photo to album:", albumErr);
        }
      }
      
      res.status(201).json(photo);
    } catch (err) {
      console.error("Create photo error:", err);
      return res.status(500).json({ message: "Failed to create photo" });
    }
  });

  app.delete("/api/daily-report-photos/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteDailyReportPhoto(Number(req.params.id));
    res.status(204).send();
  });

  // Communications
  app.get(api.communications.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const comms = await storage.getCommunications(Number(req.params.customerId));
    res.json(comms);
  });

  app.post(api.communications.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.communications.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteCommunication(Number(req.params.id));
    res.status(204).send();
  });

  // Allocations
  app.get(api.allocations.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const list = await storage.getAllocations();
    res.json(list);
  });

  app.post(api.allocations.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put(api.allocations.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.allocations.update.input.parse(req.body);
      const allocation = await storage.updateAllocation(Number(req.params.id), input);
      res.json(allocation);
    } catch (err) {
      return res.status(404).json({ message: "Allocation not found" });
    }
  });

  app.delete(api.allocations.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteAllocation(Number(req.params.id));
    res.status(204).send();
  });

  // Folders & Files
  app.get(api.folders.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const list = await storage.getFolders(Number(req.params.projectId));
    res.json(list);
  });

  app.post(api.folders.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.folders.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteFolder(Number(req.params.id));
    res.status(204).send();
  });

  // Get child folders for hierarchical folder picker
  app.get('/api/projects/:projectId/folders/children', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const projectId = Number(req.params.projectId);
    const parentId = req.query.parentId === 'null' || req.query.parentId === undefined 
      ? null 
      : Number(req.query.parentId);
    
    const childFolders = await storage.getChildFolders(projectId, parentId);
    
    // Add hasChildren flag to each folder
    const foldersWithChildren = await Promise.all(
      childFolders.map(async (folder) => {
        const children = await storage.getChildFolders(projectId, folder.id);
        return {
          ...folder,
          hasChildren: children.length > 0
        };
      })
    );
    
    // Sort alphabetically by name
    foldersWithChildren.sort((a, b) => a.name.localeCompare(b.name));
    
    res.json(foldersWithChildren);
  });

  // Get folder breadcrumb path
  app.get('/api/folders/:id/path', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const folderId = Number(req.params.id);
    const path = await storage.getFolderPath(folderId);
    res.json(path);
  });

  // Get single folder
  app.get('/api/folders/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const folder = await storage.getFolder(Number(req.params.id));
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }
    res.json(folder);
  });

  app.get(api.files.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const list = await storage.getFiles(Number(req.params.projectId));
    res.json(list);
  });

  app.post(api.files.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.files.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteFile(Number(req.params.id));
    res.status(204).send();
  });

  // Batch file operations
  app.post('/api/files/batch-delete', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ message: "ids array is required" });
    }
    await storage.batchDeleteFiles(ids.map(Number));
    res.status(204).send();
  });

  app.post('/api/files/batch-move', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const { ids, folderId } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ message: "ids array is required" });
    }
    await storage.batchMoveFiles(ids.map(Number), folderId === null ? null : Number(folderId));
    res.json({ success: true });
  });

  // Update folder (rename)
  app.put('/api/folders/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const folder = await storage.updateFolder(Number(req.params.id), req.body);
      res.json(folder);
    } catch (err) {
      throw err;
    }
  });

  // Photo Albums
  app.get(api.photoAlbums.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const albums = await storage.getPhotoAlbums(Number(req.params.projectId));
    res.json(albums);
  });

  app.post(api.photoAlbums.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put(api.photoAlbums.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.photoAlbums.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deletePhotoAlbum(Number(req.params.id));
    res.status(204).send();
  });

  // Photos (separate from documents/files)
  app.get('/api/projects/:projectId/photos', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const { cursor, limit, albumId } = req.query;
    
    if (cursor || limit) {
      const result = await storage.getPhotosPaginated(Number(req.params.projectId), {
        cursor: cursor as string | undefined,
        limit: limit ? Number(limit) : 50,
        albumId: albumId ? Number(albumId) : undefined,
      });
      res.json(result);
    } else {
      const photos = await storage.getPhotos(Number(req.params.projectId));
      res.json(photos);
    }
  });

  app.post('/api/cloudinary/signature', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { folder } = req.body;
      const signature = generateUploadSignature({ folder: folder || 'sitetech/photos' });
      res.json(signature);
    } catch (err) {
      console.error("Error generating Cloudinary signature:", err);
      res.status(500).json({ error: "Failed to generate upload signature" });
    }
  });

  app.post('/api/projects/:projectId/photos', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const generalAlbum = await storage.getOrCreateGeneralAlbum(projectId);
      const takenAt = req.body.takenAt ? new Date(req.body.takenAt) : null;
      const photo = await storage.createPhoto({
        ...req.body,
        projectId,
        albumId: req.body.albumId || generalAlbum.id,
        takenAt,
        displayDate: takenAt || new Date(),
      });
      
      res.status(201).json(photo);
    } catch (err) {
      console.error("Error creating photo:", err);
      throw err;
    }
  });

  app.patch('/api/photos/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const photo = await storage.updatePhoto(Number(req.params.id), req.body);
      res.json(photo);
    } catch (err) {
      console.error("Error updating photo:", err);
      throw err;
    }
  });

  app.delete('/api/photos/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const photo = await storage.getPhoto(Number(req.params.id));
      if (photo?.cloudinaryPublicId) {
        await deleteFromCloudinary(photo.cloudinaryPublicId).catch(console.error);
      }
      await storage.deletePhoto(Number(req.params.id));
      res.status(204).send();
    } catch (err) {
      console.error("Error deleting photo:", err);
      res.status(204).send();
    }
  });

  // Update file to assign to album
  app.put('/api/files/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const file = await storage.updateFile(Number(req.params.id), req.body);
      res.json(file);
    } catch (err) {
      throw err;
    }
  });

  // Check if report exists for a specific date
  app.get('/api/projects/:projectId/reports/by-date/:date', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const report = await storage.getDailyReportByDate(Number(req.params.projectId), req.params.date);
    if (!report) return res.status(404).json({ message: "No report for this date" });
    res.json(report);
  });

  // Report Tasks
  app.get(api.reportTasks.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const tasks = await storage.getReportTasks(Number(req.params.reportId));
    res.json(tasks);
  });

  app.post(api.reportTasks.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put(api.reportTasks.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.reportTasks.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteReportTask(Number(req.params.id));
    res.status(204).send();
  });

  // Labor Entries
  app.get(api.laborEntries.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const entries = await storage.getLaborEntries(Number(req.params.reportTaskId));
    res.json(entries);
  });

  app.post(api.laborEntries.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put(api.laborEntries.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.laborEntries.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteLaborEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Equipment Entries
  app.get(api.equipmentEntriesApi.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const entries = await storage.getEquipmentEntries(Number(req.params.reportTaskId));
    res.json(entries);
  });

  app.post(api.equipmentEntriesApi.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put(api.equipmentEntriesApi.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.equipmentEntriesApi.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteEquipmentEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Deliveries
  app.get(api.deliveriesApi.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const deliveries = await storage.getDeliveries(Number(req.params.reportId));
    res.json(deliveries);
  });

  app.post(api.deliveriesApi.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.put(api.deliveriesApi.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
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

  app.delete(api.deliveriesApi.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteDelivery(Number(req.params.id));
    res.status(204).send();
  });

  // ===== Project Email / Outlook Integration Routes =====

  app.get("/api/outlook/configured", isAuthenticated, isAuthorizedUser, async (req, res) => {
    res.json({ configured: isOutlookConfigured() });
  });

  app.get("/api/projects/:projectId/email-connection", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const projectId = Number(req.params.projectId);
    const project = await storage.getProject(projectId);
    const connection = await storage.getProjectEmailConnection(projectId);
    res.json({
      connected: !!connection,
      emailAddress: connection?.emailAddress,
      status: connection?.status,
      lastSyncAt: connection?.lastSyncAt,
      connectedByName: connection?.connectedByName,
      projectEmail: project?.projectEmail || null,
    });
  });

  app.get("/api/outlook/auth/:projectId", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const authUrl = getAuthUrl(projectId);
      res.json({ authUrl });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate auth URL" });
    }
  });

  app.get("/api/outlook/callback", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const sendCallbackPage = (success: boolean, message: string) => {
      res.send(`<!DOCTYPE html><html><head><title>Outlook Connection</title>
        <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0;}
        .card{text-align:center;padding:2rem;border-radius:0.75rem;background:#1e293b;max-width:400px;}
        .icon{font-size:3rem;margin-bottom:1rem;}
        h2{margin:0 0 0.5rem;}
        p{color:#94a3b8;margin:0 0 1rem;}
        .btn{display:inline-block;padding:0.5rem 1.5rem;border-radius:0.375rem;background:${success ? '#f97316' : '#ef4444'};color:white;text-decoration:none;cursor:pointer;border:none;font-size:1rem;}
        </style></head><body><div class="card">
        <div class="icon">${success ? '&#10003;' : '&#10007;'}</div>
        <h2>${success ? 'Connected Successfully' : 'Connection Failed'}</h2>
        <p>${message}</p>
        <button class="btn" onclick="window.close()">Close this tab</button>
        </div>
        <script>if(window.opener){window.opener.postMessage({type:'outlook_callback',success:${success}},'*');}</script>
        </body></html>`);
    };

    try {
      const { code, state, error } = req.query;
      if (error) {
        return sendCallbackPage(false, String(error));
      }
      if (!code || !state) {
        return sendCallbackPage(false, "Missing required parameters from Microsoft.");
      }

      const projectId = validateOAuthState(String(state));
      if (projectId === null) {
        return sendCallbackPage(false, "The connection request expired. Please try again.");
      }

      const tokens = await exchangeCodeForTokens(String(code));

      const user = req.user as any;
      const existing = await storage.getProjectEmailConnection(projectId);
      if (existing) {
        await storage.updateProjectEmailConnection(existing.id, {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          emailAddress: tokens.email,
          status: "active",
        });
      } else {
        await storage.createProjectEmailConnection({
          projectId,
          emailAddress: tokens.email,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          status: "active",
          connectedBy: user?.claims?.sub || null,
          connectedByName: user?.claims?.first_name
            ? `${user.claims.first_name} ${user.claims.last_name || ""}`.trim()
            : null,
        });
      }

      try {
        await syncProjectEmails(projectId);
      } catch (syncErr) {
        console.error("Initial sync failed:", syncErr);
      }

      sendCallbackPage(true, "Your Outlook email is now connected to this project. You can close this tab and return to SiteTech.");
    } catch (err: any) {
      console.error("Outlook callback error:", err);
      sendCallbackPage(false, err.message || "An unexpected error occurred. Please try again.");
    }
  });

  app.post("/api/projects/:projectId/emails/sync", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const result = await syncProjectEmails(projectId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Sync failed" });
    }
  });

  app.get("/api/projects/:projectId/emails", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const projectId = Number(req.params.projectId);
    const { filter, search, limit, offset } = req.query;

    const options: { isInternal?: boolean; search?: string; limit?: number; offset?: number } = {};
    if (filter === "internal") options.isInternal = true;
    if (filter === "external") options.isInternal = false;
    if (search) options.search = String(search);
    if (limit) options.limit = Number(limit);
    if (offset) options.offset = Number(offset);

    const emails = await storage.getProjectEmails(projectId, options);
    const total = await storage.getProjectEmailsCount(
      projectId,
      filter === "internal" ? true : filter === "external" ? false : undefined,
      search ? String(search) : undefined
    );

    res.json({ emails, total });
  });

  app.get("/api/projects/:projectId/emails/:emailId", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const projectId = Number(req.params.projectId);
    const email = await storage.getProjectEmail(Number(req.params.emailId));
    if (!email || email.projectId !== projectId) return res.status(404).json({ message: "Email not found" });
    const attachments = await storage.getProjectEmailAttachments(email.id);
    res.json({ ...email, attachments });
  });

  app.get("/api/projects/:projectId/emails/:emailId/attachments/:attachmentId/download", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const email = await storage.getProjectEmail(Number(req.params.emailId));
      if (!email || email.projectId !== projectId) return res.status(404).json({ message: "Email not found" });

      const attachments = await storage.getProjectEmailAttachments(email.id);
      const att = attachments.find(a => a.id === Number(req.params.attachmentId));
      if (!att) return res.status(404).json({ message: "Attachment not found" });

      if (att.storagePath) {
        const { Client } = await import("@replit/object-storage");
        const client = new Client();
        const { ok, value } = await client.downloadAsBytes(att.storagePath);
        if (!ok) return res.status(404).json({ message: "Attachment file not found" });
        res.setHeader("Content-Type", att.contentType || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${att.name}"`);
        res.send(Buffer.from(value));
      } else if (att.outlookAttachmentId && email.outlookMessageId) {
        const content = await getAttachmentContent(projectId, email.outlookMessageId, att.outlookAttachmentId);
        if (!content) return res.status(404).json({ message: "Attachment content not available" });
        res.setHeader("Content-Type", content.contentType);
        res.setHeader("Content-Disposition", `attachment; filename="${content.name}"`);
        res.send(content.content);
      } else {
        return res.status(404).json({ message: "Attachment content not available" });
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to download attachment" });
    }
  });

  app.delete("/api/projects/:projectId/email-connection", isAuthenticated, isAdmin, async (req, res) => {
    await storage.deleteProjectEmailConnection(Number(req.params.projectId));
    res.status(204).send();
  });

  const inboundUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
  app.post("/api/webhooks/inbound-email", inboundUpload.any(), async (req, res) => {
    try {
      const { timestamp, token, signature } = req.body;
      if (process.env.MAILGUN_API_KEY) {
        if (!timestamp || !token || !signature) {
          console.warn("Inbound email webhook: missing Mailgun signature fields");
          return res.status(406).json({ processed: false, error: "Missing authentication" });
        }
        if (!verifyMailgunSignature(timestamp, token, signature)) {
          console.warn("Inbound email webhook: invalid Mailgun signature");
          return res.status(406).json({ processed: false, error: "Invalid signature" });
        }
      }

      const result = await processInboundEmail(req.body, (req.files as any[]) || []);
      res.status(200).json(result);
    } catch (err: any) {
      console.error("Inbound email webhook error:", err);
      res.status(200).json({ processed: false, error: err.message });
    }
  });

  app.get("/api/projects/:projectId/project-email", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const project = await storage.getProject(Number(req.params.projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });
    res.json({ projectEmail: project.projectEmail });
  });

  app.post("/api/admin/backfill-project-emails", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const updated = await storage.backfillProjectEmails();
      res.json({ success: true, updated });
    } catch (error: any) {
      console.error("Failed to backfill project emails:", error);
      res.status(500).json({ message: "Failed to backfill project emails", error: error.message });
    }
  });

  app.get("/api/admin/email-setup", isAuthenticated, isAdmin, async (req, res) => {
    const baseUrl = process.env.APP_BASE_URL || `https://${process.env.REPL_SLUG}.replit.app`;
    res.json({
      webhookUrl: `${baseUrl}/api/webhooks/inbound-email`,
      domain: "updates.sitetechnj.com",
      mxRecord: "mxa.mailgun.org",
      mxRecord2: "mxb.mailgun.org",
      mxPriority: 10,
    });
  });

  // Fingercheck Employees
  app.get("/api/employees", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const employees = await storage.getFingercheckEmployees();
    res.json(employees);
  });

  app.get("/api/employees/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const employee = await storage.getFingercheckEmployee(Number(req.params.id));
    if (!employee) return res.status(404).json({ message: "Employee not found" });
    res.json(employee);
  });

  app.post("/api/employees/sync", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { fetchEmployeesFromFingercheck, mapFingercheckEmployee, isValidEmployee } = await import("./services/fingercheck");
      const fcEmployees = await fetchEmployeesFromFingercheck();
      
      const results = [];
      const skipped = [];
      for (const fcEmp of fcEmployees) {
        if (!isValidEmployee(fcEmp)) {
          skipped.push(fcEmp.EmployeeID || "unknown");
          continue;
        }
        try {
          const mapped = mapFingercheckEmployee(fcEmp);
          const employee = await storage.upsertFingercheckEmployee(mapped);
          results.push(employee);
        } catch (innerErr) {
          console.error(`Failed to sync employee ${fcEmp.EmployeeID}:`, innerErr);
          skipped.push(fcEmp.EmployeeID);
        }
      }

      res.json({ 
        message: `Synced ${results.length} employees from Fingercheck${skipped.length ? `, ${skipped.length} skipped` : ""}`,
        count: results.length,
        skipped: skipped.length,
        employees: results,
      });
    } catch (err: any) {
      console.error("Fingercheck sync error:", err);
      res.status(500).json({ message: err.message || "Failed to sync employees from Fingercheck" });
    }
  });

  app.delete("/api/employees/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      await storage.deleteFingercheckEmployee(Number(req.params.id));
      res.json({ message: "Employee deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete employee" });
    }
  });

  // Fingercheck Time Punches
  app.get("/api/time-punches", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const { employeeId, startDate, endDate, jobCode } = req.query;
    const punches = await storage.getTimePunches({
      employeeId: employeeId ? Number(employeeId) : undefined,
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      jobCode: jobCode as string | undefined,
    });
    res.json(punches);
  });

  app.get("/api/time-punches/summary", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const { startDate, endDate, employeeId, jobCode } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate are required" });
    }
    const punches = await storage.getTimePunches({
      employeeId: employeeId ? Number(employeeId) : undefined,
      startDate: startDate as string,
      endDate: endDate as string,
      jobCode: jobCode as string | undefined,
    });
    const { buildDailyTimeSummaries } = await import("./services/fingercheck");
    const summaries = buildDailyTimeSummaries(punches);
    res.json(summaries);
  });

  app.post("/api/time-punches/sync", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { startDate, endDate } = req.body;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "startDate and endDate are required" });
      }

      const { fetchTimeCardData, mapTimePunch, isValidTimePunch } = await import("./services/fingercheck");
      const rawPunches = await fetchTimeCardData(startDate, endDate);

      let synced = 0;
      let skipped = 0;
      for (const punch of rawPunches) {
        if (!isValidTimePunch(punch)) {
          skipped++;
          continue;
        }
        try {
          const mapped = mapTimePunch(punch);
          await storage.upsertTimePunch(mapped);
          synced++;
        } catch (innerErr) {
          console.error(`Failed to sync punch ${punch.TimeClockHistoryGuid}:`, innerErr);
          skipped++;
        }
      }

      res.json({
        message: `Synced ${synced} time punches${skipped ? `, ${skipped} skipped` : ""}`,
        synced,
        skipped,
        total: rawPunches.length,
      });
    } catch (err: any) {
      console.error("Time punch sync error:", err);
      res.status(500).json({ message: err.message || "Failed to sync time punches" });
    }
  });

  // Fingercheck Jobs (derived from synced time punches)
  app.get("/api/fingercheck-jobs", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const allPunches = await storage.getTimePunches();
    const jobMap = new Map<string, string>();
    for (const p of allPunches) {
      if (p.jobCode && !jobMap.has(p.jobCode)) {
        jobMap.set(p.jobCode, p.jobDescription || p.jobCode);
      }
    }
    const jobs = Array.from(jobMap.entries()).map(([code, description]) => ({ code, description }));
    res.json(jobs);
  });

  // Fingercheck Jobs (fetched directly from Fingercheck API - shows ALL jobs)
  app.get("/api/fingercheck-jobs/all", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { fetchJobsFromFingercheck } = await import("./services/fingercheck");
      const jobs = await fetchJobsFromFingercheck();
      res.json(jobs);
    } catch (error: any) {
      console.error("Error fetching Fingercheck jobs:", error);
      res.status(500).json({ message: error.message || "Failed to fetch jobs from Fingercheck" });
    }
  });

  // Fingercheck Project Mappings
  app.get("/api/project-mappings", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const mappings = await storage.getProjectMappings();
    res.json(mappings);
  });

  app.get("/api/project-mappings/project/:projectId", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const mappings = await storage.getProjectMappingsByProjectId(Number(req.params.projectId));
    res.json(mappings);
  });

  app.post("/api/project-mappings", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { projectId, fingercheckJobCode, fingercheckJobDescription } = req.body;
      if (!projectId || !fingercheckJobCode) {
        return res.status(400).json({ message: "projectId and fingercheckJobCode are required" });
      }
      const mapping = await storage.createProjectMapping({
        projectId: Number(projectId),
        fingercheckJobCode,
        fingercheckJobDescription: fingercheckJobDescription || null,
      });
      res.json(mapping);
    } catch (err: any) {
      if (err.message?.includes("unique") || err.code === "23505") {
        return res.status(409).json({ message: "This project is already mapped to that Fingercheck job" });
      }
      res.status(500).json({ message: "Failed to create project mapping" });
    }
  });

  app.delete("/api/project-mappings/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      await storage.deleteProjectMapping(Number(req.params.id));
      res.json({ message: "Mapping deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete mapping" });
    }
  });

  // ============================================================
  // RFI Routes
  // ============================================================

  app.get("/api/projects/:projectId/rfis", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfis = await storage.getRfis(Number(req.params.projectId));
      res.json(rfis);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch RFIs" });
    }
  });

  app.get("/api/rfis/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });
      res.json(rfi);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch RFI" });
    }
  });

  app.get("/api/projects/:projectId/rfis/next-number", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const nextNumber = await storage.getNextRfiNumber(Number(req.params.projectId));
      res.json({ nextNumber });
    } catch (err) {
      res.status(500).json({ message: "Failed to get next RFI number" });
    }
  });

  const createRfiBodySchema = z.object({
    subject: z.string().min(1, "Subject is required"),
    question: z.string().min(1, "Question is required"),
    directedTo: z.string().min(1, "Directed To is required"),
    directedToEmail: z.string().email("Valid email is required"),
    ccEmails: z.array(z.string()).optional().nullable(),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    dueDate: z.string().nullable().optional(),
    additionalBody: z.string().nullable().optional(),
    status: z.enum(["draft", "open", "responded", "closed"]).default("draft"),
  });

  app.post("/api/projects/:projectId/rfis", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const parsed = createRfiBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
      }
      const user = req.user as User;
      const rfiNumber = await storage.getNextRfiNumber(projectId);
      const rfi = await storage.createRfi({
        ...parsed.data,
        projectId,
        rfiNumber,
        createdBy: user.id,
        createdByName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown",
      });
      res.json(rfi);
    } catch (err: any) {
      console.error("Failed to create RFI:", err);
      res.status(500).json({ message: "Failed to create RFI" });
    }
  });

  const updateRfiBodySchema = createRfiBodySchema.partial();

  app.patch("/api/rfis/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const parsed = updateRfiBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation error", errors: parsed.error.flatten() });
      }
      const rfi = await storage.updateRfi(Number(req.params.id), parsed.data);
      res.json(rfi);
    } catch (err) {
      res.status(500).json({ message: "Failed to update RFI" });
    }
  });

  app.delete("/api/rfis/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      await storage.deleteRfi(Number(req.params.id));
      res.json({ message: "RFI deleted" });
    } catch (err) {
      res.status(500).json({ message: "Failed to delete RFI" });
    }
  });

  // RFI: Upload attachment
  const rfiUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
  app.post("/api/rfis/:id/attachments", isAuthenticated, isAuthorizedUser, rfiUpload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file provided" });

      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });

      const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
      const { randomUUID } = await import("crypto");
      const fileId = randomUUID();
      const ext = req.file.originalname.split(".").pop() || "";
      const objectPath = `${privateDir}/rfis/project-${rfi.projectId}/attachments/${fileId}.${ext}`;

      const parseObjectPath = (path: string) => {
        if (!path.startsWith("/")) path = `/${path}`;
        const parts = path.split("/");
        return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
      };

      const { Storage } = await import("@google-cloud/storage");
      const { objectStorageClient } = await import("../replit_integrations/object_storage/objectStorage");
      const { bucketName, objectName } = parseObjectPath(objectPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);
      await file.save(req.file.buffer, { contentType: req.file.mimetype });

      const entityId = objectPath.replace(privateDir + "/", "");
      const storedPath = `/objects/${entityId}`;

      const existingAttachments = rfi.attachments || [];
      const attachmentEntry = JSON.stringify({ name: req.file.originalname, path: storedPath, contentType: req.file.mimetype, size: req.file.size });
      await storage.updateRfi(rfi.id, {
        attachments: [...existingAttachments, attachmentEntry],
      });

      res.json({ name: req.file.originalname, path: storedPath, contentType: req.file.mimetype, size: req.file.size });
    } catch (err: any) {
      console.error("Failed to upload RFI attachment:", err);
      res.status(500).json({ message: "Failed to upload attachment" });
    }
  });

  // RFI: Remove attachment
  app.delete("/api/rfis/:id/attachments/:index", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });

      const index = Number(req.params.index);
      const existingAttachments = rfi.attachments || [];
      if (index < 0 || index >= existingAttachments.length) {
        return res.status(400).json({ message: "Invalid attachment index" });
      }

      const updated = [...existingAttachments];
      updated.splice(index, 1);
      await storage.updateRfi(rfi.id, { attachments: updated });
      res.json({ message: "Attachment removed" });
    } catch (err) {
      res.status(500).json({ message: "Failed to remove attachment" });
    }
  });

  // RFI: Generate PDF and send via Outlook
  app.post("/api/rfis/:id/send", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });

      const project = await storage.getProject(rfi.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const user = req.user as User;

      // Parse attachment entries
      const attachmentFiles = (rfi.attachments || []).map((att: string) => {
        try {
          return JSON.parse(att);
        } catch {
          return null;
        }
      }).filter(Boolean);

      // Generate PDF
      const { generateRfiPdf, uploadPdfToStorage } = await import("./services/rfiPdfGenerator");
      const pdfBuffer = await generateRfiPdf({
        rfi,
        projectName: project.name,
        projectNumber: project.projectNumber || undefined,
        attachmentFiles,
      });

      const pdfPath = await uploadPdfToStorage(pdfBuffer, rfi.projectId, rfi.rfiNumber);

      // Prepare email attachments
      const { sendEmail, getConnectedEmail } = await import("./services/outlookConnector");
      const connectedEmail = await getConnectedEmail();

      const emailAttachments: Array<{ name: string; contentType: string; contentBytes: string }> = [
        {
          name: `RFI-${String(rfi.rfiNumber).padStart(3, "0")}_${project.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
          contentType: "application/pdf",
          contentBytes: pdfBuffer.toString("base64"),
        },
      ];

      // Also attach the original files
      for (const att of attachmentFiles) {
        try {
          const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
          const privateDir = process.env.PRIVATE_OBJECT_DIR || "";
          let fullPath: string;
          if (att.path.startsWith("/objects/")) {
            const entityId = att.path.slice("/objects/".length);
            fullPath = `${privateDir}/${entityId}`;
          } else {
            fullPath = att.path;
          }
          const parsePath = (p: string) => {
            if (!p.startsWith("/")) p = `/${p}`;
            const parts = p.split("/");
            return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
          };
          const { bucketName, objectName } = parsePath(fullPath);
          const bucket = objectStorageClient.bucket(bucketName);
          const file = bucket.file(objectName);
          const [contents] = await file.download();
          emailAttachments.push({
            name: att.name,
            contentType: att.contentType || "application/octet-stream",
            contentBytes: contents.toString("base64"),
          });
        } catch (attErr) {
          console.error(`Failed to attach file ${att.name}:`, attErr);
        }
      }

      const rfiLabel = `RFI-${String(rfi.rfiNumber).padStart(3, "0")}`;
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 700px;">
          <h2 style="color: #1a365d;">Request for Information - ${rfiLabel}</h2>
          <p><strong>Project:</strong> ${project.name}${project.projectNumber ? ` (#${project.projectNumber})` : ""}</p>
          <p><strong>Subject:</strong> ${rfi.subject}</p>
          <p><strong>Priority:</strong> ${(rfi.priority || "normal").toUpperCase()}</p>
          ${rfi.dueDate ? `<p><strong>Response Due:</strong> ${new Date(rfi.dueDate).toLocaleDateString()}</p>` : ""}
          <hr style="border: 1px solid #e2e8f0;" />
          <p><strong>Question:</strong></p>
          <p>${rfi.question.replace(/\n/g, "<br/>")}</p>
          ${rfi.additionalBody ? `<p>${rfi.additionalBody.replace(/\n/g, "<br/>")}</p>` : ""}
          <hr style="border: 1px solid #e2e8f0;" />
          <p style="color: #718096; font-size: 12px;">
            Please reply to this email with your response. The full RFI document is attached as a PDF.
            <br/>Sent via SiteTech Construction Management
          </p>
        </div>
      `;

      const result = await sendEmail({
        to: [rfi.directedToEmail],
        cc: rfi.ccEmails?.filter(Boolean) || [],
        subject: `${rfiLabel}: ${rfi.subject} - ${project.name}`,
        bodyHtml: emailBody,
        attachments: emailAttachments,
      });

      await storage.updateRfi(rfi.id, {
        status: "open",
        pdfUrl: pdfPath,
        outlookMessageId: result.messageId,
        outlookConversationId: result.conversationId,
        sentAt: new Date(),
        sentBy: user.id,
        sentByName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email || "Unknown",
        sentByEmail: connectedEmail || user.email || "",
      });

      const updatedRfi = await storage.getRfi(rfi.id);
      res.json(updatedRfi);
    } catch (err: any) {
      console.error("Failed to send RFI:", err);
      res.status(500).json({ message: err.message || "Failed to send RFI" });
    }
  });

  // RFI: Check for replies from Outlook
  app.post("/api/rfis/:id/check-replies", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });
      if (!rfi.outlookConversationId) return res.json({ responses: [], newCount: 0 });

      const { getEmailReplies } = await import("./services/outlookConnector");
      const replies = await getEmailReplies(rfi.outlookConversationId);

      let newCount = 0;
      for (const reply of replies) {
        if (reply.id === rfi.outlookMessageId) continue;

        const existing = await storage.getRfiResponseByOutlookId(reply.id);
        if (!existing) {
          await storage.createRfiResponse({
            rfiId: rfi.id,
            outlookMessageId: reply.id,
            fromEmail: reply.from.email,
            fromName: reply.from.name,
            bodyPreview: reply.bodyPreview,
            bodyHtml: reply.bodyHtml,
            receivedAt: new Date(reply.receivedAt),
          });
          newCount++;
        }
      }

      if (newCount > 0 && rfi.status === "open") {
        await storage.updateRfi(rfi.id, { status: "responded" });
      }

      const responses = await storage.getRfiResponses(rfi.id);
      res.json({ responses, newCount });
    } catch (err: any) {
      console.error("Failed to check RFI replies:", err);
      res.status(500).json({ message: "Failed to check for replies" });
    }
  });

  // RFI: Get responses
  app.get("/api/rfis/:id/responses", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const responses = await storage.getRfiResponses(Number(req.params.id));
      res.json(responses);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch responses" });
    }
  });

  // RFI: Update status (close/reopen)
  app.patch("/api/rfis/:id/status", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { status } = req.body;
      if (!["draft", "open", "responded", "closed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const rfi = await storage.updateRfi(Number(req.params.id), { status });
      res.json(rfi);
    } catch (err) {
      res.status(500).json({ message: "Failed to update status" });
    }
  });

  // Outlook connector status
  app.get("/api/outlook/status", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { isOutlookConnectorConfigured, getConnectedEmail } = await import("./services/outlookConnector");
      const connected = await isOutlookConnectorConfigured();
      let email = null;
      if (connected) {
        email = await getConnectedEmail();
      }
      res.json({ connected, email });
    } catch (err) {
      res.json({ connected: false, email: null });
    }
  });

  return httpServer;
}
