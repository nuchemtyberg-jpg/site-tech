import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes } from "./replit_integrations/auth";
import { registerObjectStorageRoutes } from "./replit_integrations/object_storage";
import type { User } from "@shared/schema";

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

  // PDF Export for Daily Report
  app.get("/api/reports/:id/pdf", async (req, res) => {
    try {
      const { PDFDocument, StandardFonts, rgb, degrees } = await import("pdf-lib");
      
      const reportId = Number(req.params.id);
      const includePhotos = req.query.includePhotos === 'true';
      
      // Helper to convert photo URL to proxy path
      const getProxyPath = (url: string): string => {
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
      
      // Get base URL for fetching photos
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      
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
      
      let page = pdfDoc.addPage([612, 792]); // Letter size
      const { height } = page.getSize();
      let y = height - 50;
      const margin = 50;
      const lineHeight = 14;
      
      const drawText = (text: string, x: number, yPos: number, size = 10, useBold = false) => {
        page.drawText(text, { x, y: yPos, size, font: useBold ? boldFont : font, color: rgb(0, 0, 0) });
      };
      
      const addNewPageIfNeeded = () => {
        if (y < 80) {
          page = pdfDoc.addPage([612, 792]);
          y = height - 50;
          // Add DRAFT watermark to new page if draft
          if (report.status === 'draft') {
            page.drawText("DRAFT", {
              x: 200,
              y: 400,
              size: 80,
              font: boldFont,
              color: rgb(0.9, 0.9, 0.9),
              rotate: degrees(45),
            });
          }
        }
      };
      
      // Add DRAFT watermark if status is draft
      if (report.status === 'draft') {
        page.drawText("DRAFT", {
          x: 200,
          y: 400,
          size: 80,
          font: boldFont,
          color: rgb(0.9, 0.9, 0.9),
          rotate: degrees(45),
        });
      }
      
      // Header
      drawText("DAILY FIELD REPORT", margin, y, 18, true);
      y -= 30;
      
      // Project info
      if (project) {
        drawText(`Project: ${project.projectNumber} - ${project.name}`, margin, y, 12, true);
        y -= lineHeight;
        if (project.streetAddress || project.city || project.state) {
          const address = [project.streetAddress, project.city, project.state].filter(Boolean).join(", ");
          drawText(`Location: ${address}`, margin, y, 10);
          y -= lineHeight;
        }
      }
      
      // Report date
      const reportDate = new Date(report.reportDate);
      const formattedDate = reportDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      drawText(`Date: ${formattedDate}`, margin, y, 10);
      y -= lineHeight;
      
      // Status
      drawText(`Status: ${report.status.charAt(0).toUpperCase() + report.status.slice(1)}`, margin, y, 10);
      y -= 25;
      
      // Weather section
      drawText("WEATHER CONDITIONS", margin, y, 12, true);
      y -= lineHeight + 2;
      page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: 562, y: y + 6 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 4;
      
      const weatherInfo = [
        report.weatherSummary ? `Conditions: ${report.weatherSummary}` : null,
        report.temperature ? `Temperature: ${report.temperature}°F` : null,
        (report.temperatureHigh || report.temperatureLow) 
          ? `High/Low: ${report.temperatureHigh || '--'}°F / ${report.temperatureLow || '--'}°F` 
          : null,
        report.windSpeed ? `Wind: ${report.windSpeed} mph` : null,
      ].filter(Boolean);
      
      if (weatherInfo.length > 0) {
        weatherInfo.forEach((info) => {
          drawText(info as string, margin + 10, y, 10);
          y -= lineHeight;
        });
      } else {
        drawText("No weather data recorded", margin + 10, y, 10);
        y -= lineHeight;
      }
      y -= 15;
      
      // Task Entries
      addNewPageIfNeeded();
      drawText("DAILY OPERATIONS", margin, y, 12, true);
      y -= lineHeight + 2;
      page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: 562, y: y + 6 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 4;
      
      if (taskEntriesWithLines.length === 0) {
        drawText("No tasks recorded", margin + 10, y, 10);
        y -= lineHeight;
      } else {
        for (const entry of taskEntriesWithLines) {
          addNewPageIfNeeded();
          drawText(`• ${entry.taskTitleSnapshot}`, margin + 10, y, 10, true);
          y -= lineHeight;
          drawText(`  Progress: ${entry.percentComplete}%`, margin + 20, y, 9);
          y -= lineHeight;
          
          if (entry.comments) {
            drawText(`  Notes: ${entry.comments}`, margin + 20, y, 9);
            y -= lineHeight;
          }
          
          // Labor lines
          if (entry.laborLines && entry.laborLines.length > 0) {
            drawText("  Labor:", margin + 20, y, 9, true);
            y -= lineHeight;
            for (const labor of entry.laborLines) {
              drawText(`    - ${labor.laborType}: ${labor.quantity} x ${labor.hours} hrs`, margin + 30, y, 9);
              y -= lineHeight;
              addNewPageIfNeeded();
            }
          }
          
          // Equipment lines
          if (entry.equipmentLines && entry.equipmentLines.length > 0) {
            drawText("  Equipment:", margin + 20, y, 9, true);
            y -= lineHeight;
            for (const equip of entry.equipmentLines) {
              drawText(`    - ${equip.equipmentType}: ${equip.quantity} x ${equip.hours} hrs`, margin + 30, y, 9);
              y -= lineHeight;
              addNewPageIfNeeded();
            }
          }
          
          // Add photos for this task entry if any
          if (entry.photos && entry.photos.length > 0) {
            drawText("  Photos:", margin + 20, y, 9, true);
            y -= lineHeight;
            for (const photo of entry.photos) {
              try {
                // Convert URL to proxy path and fetch the image
                const imagePath = getProxyPath(photo.url);
                
                // Fetch the image from the object storage proxy
                const imageResponse = await fetch(`${baseUrl}${imagePath}`);
                if (imageResponse.ok) {
                  const imageBuffer = await imageResponse.arrayBuffer();
                  const imageBytes = new Uint8Array(imageBuffer);
                  
                  // Try to embed as JPEG or PNG
                  let embeddedImage;
                  try {
                    embeddedImage = await pdfDoc.embedJpg(imageBytes);
                  } catch {
                    try {
                      embeddedImage = await pdfDoc.embedPng(imageBytes);
                    } catch {
                      // Skip if can't embed
                      continue;
                    }
                  }
                  
                  // Calculate dimensions to fit within page
                  const maxWidth = 150;
                  const maxHeight = 100;
                  const scale = Math.min(maxWidth / embeddedImage.width, maxHeight / embeddedImage.height);
                  const imgWidth = embeddedImage.width * scale;
                  const imgHeight = embeddedImage.height * scale;
                  
                  // Check if we need a new page
                  if (y - imgHeight < 80) {
                    page = pdfDoc.addPage([612, 792]);
                    y = height - 50;
                    if (report.status === 'draft') {
                      page.drawText("DRAFT", { x: 200, y: 400, size: 80, font: boldFont, color: rgb(0.9, 0.9, 0.9), rotate: degrees(45) });
                    }
                  }
                  
                  page.drawImage(embeddedImage, { x: margin + 30, y: y - imgHeight, width: imgWidth, height: imgHeight });
                  y -= imgHeight + 10;
                }
              } catch (err) {
                // Skip photos that fail to load
                console.error("Failed to embed task photo:", err);
              }
            }
          }
          
          y -= 5;
        }
      }
      y -= 15;
      
      // Deliveries
      addNewPageIfNeeded();
      drawText("DELIVERIES", margin, y, 12, true);
      y -= lineHeight + 2;
      page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: 562, y: y + 6 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
      y -= 4;
      
      if (deliveryEntriesWithPhotos.length === 0) {
        drawText("No deliveries recorded", margin + 10, y, 10);
        y -= lineHeight;
      } else {
        for (const delivery of deliveryEntriesWithPhotos) {
          addNewPageIfNeeded();
          drawText(`• ${delivery.vendor || 'Unknown vendor'}`, margin + 10, y, 10, true);
          y -= lineHeight;
          if (delivery.deliveryTime) {
            drawText(`  Time: ${delivery.deliveryTime}`, margin + 20, y, 9);
            y -= lineHeight;
          }
          if (delivery.description) {
            drawText(`  Description: ${delivery.description}`, margin + 20, y, 9);
            y -= lineHeight;
          }
          const deliveryStatus = delivery.allDelivered ? "All items delivered" : "Missing items";
          drawText(`  Status: ${deliveryStatus}`, margin + 20, y, 9);
          y -= lineHeight;
          if (!delivery.allDelivered && delivery.missingItemsDetails) {
            drawText(`  Missing: ${delivery.missingItemsDetails}`, margin + 20, y, 9);
            y -= lineHeight;
          }
          
          // Add photos for this delivery if any
          if (delivery.photos && delivery.photos.length > 0) {
            drawText("  Photos:", margin + 20, y, 9, true);
            y -= lineHeight;
            for (const photo of delivery.photos) {
              try {
                // Convert URL to proxy path and fetch the image
                const imagePath = getProxyPath(photo.url);
                
                // Fetch the image from the object storage proxy
                const imageResponse = await fetch(`${baseUrl}${imagePath}`);
                if (imageResponse.ok) {
                  const imageBuffer = await imageResponse.arrayBuffer();
                  const imageBytes = new Uint8Array(imageBuffer);
                  
                  // Try to embed as JPEG or PNG
                  let embeddedImage;
                  try {
                    embeddedImage = await pdfDoc.embedJpg(imageBytes);
                  } catch {
                    try {
                      embeddedImage = await pdfDoc.embedPng(imageBytes);
                    } catch {
                      // Skip if can't embed
                      continue;
                    }
                  }
                  
                  // Calculate dimensions to fit within page
                  const maxWidth = 150;
                  const maxHeight = 100;
                  const scale = Math.min(maxWidth / embeddedImage.width, maxHeight / embeddedImage.height);
                  const imgWidth = embeddedImage.width * scale;
                  const imgHeight = embeddedImage.height * scale;
                  
                  // Check if we need a new page
                  if (y - imgHeight < 80) {
                    page = pdfDoc.addPage([612, 792]);
                    y = height - 50;
                    if (report.status === 'draft') {
                      page.drawText("DRAFT", { x: 200, y: 400, size: 80, font: boldFont, color: rgb(0.9, 0.9, 0.9), rotate: degrees(45) });
                    }
                  }
                  
                  page.drawImage(embeddedImage, { x: margin + 30, y: y - imgHeight, width: imgWidth, height: imgHeight });
                  y -= imgHeight + 10;
                }
              } catch (err) {
                // Skip photos that fail to load
                console.error("Failed to embed delivery photo:", err);
              }
            }
          }
          
          y -= 5;
          addNewPageIfNeeded();
        }
      }
      y -= 15;
      
      // Notes
      if (report.notes) {
        addNewPageIfNeeded();
        drawText("NOTES", margin, y, 12, true);
        y -= lineHeight + 2;
        page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: 562, y: y + 6 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        y -= 4;
        
        // Word wrap notes
        const words = report.notes.split(' ');
        let line = '';
        const maxWidth = 500;
        for (const word of words) {
          const testLine = line + (line ? ' ' : '') + word;
          const width = font.widthOfTextAtSize(testLine, 10);
          if (width > maxWidth) {
            drawText(line, margin + 10, y, 10);
            y -= lineHeight;
            line = word;
            addNewPageIfNeeded();
          } else {
            line = testLine;
          }
        }
        if (line) {
          drawText(line, margin + 10, y, 10);
          y -= lineHeight;
        }
        y -= 15;
      }
      
      // Signature section (if completed)
      if (report.status === 'completed' && report.completedByName) {
        addNewPageIfNeeded();
        drawText("SIGNATURE", margin, y, 12, true);
        y -= lineHeight + 2;
        page.drawLine({ start: { x: margin, y: y + 6 }, end: { x: 562, y: y + 6 }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
        y -= 4;
        
        drawText(`Signed by: ${report.completedByName}`, margin + 10, y, 10);
        y -= lineHeight;
        if (report.completedAt) {
          const signedDate = new Date(report.completedAt).toLocaleString('en-US');
          drawText(`Date: ${signedDate}`, margin + 10, y, 10);
          y -= lineHeight;
        }
        if (report.signatureType === 'typed' && report.signatureValue) {
          drawText(`Signature: ${report.signatureValue}`, margin + 10, y, 10);
        }
      }
      
      // Footer
      const totalPages = pdfDoc.getPageCount();
      for (let i = 0; i < totalPages; i++) {
        const pg = pdfDoc.getPage(i);
        pg.drawText(`Page ${i + 1} of ${totalPages}`, { x: 500, y: 20, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
        pg.drawText(`Generated: ${new Date().toLocaleString('en-US')}`, { x: 50, y: 20, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
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
      const { reportId, taskEntryId, deliveryEntryId, url, caption, createdBy, createdByName, objectPath, fileName } = req.body;
      
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
      });
      
      // Also add the photo to the "Daily Report Photos" album in Project Photos
      if (report && objectPath) {
        try {
          const album = await storage.getOrCreateDailyReportAlbum(report.projectId);
          // Convert objectPath to proxy format for consistent access
          let proxyPath = objectPath;
          
          // Already a proxy URL
          if (objectPath.startsWith('/objects/')) {
            proxyPath = objectPath;
          }
          // Full GCS URL with .private
          else if (objectPath.includes('storage.googleapis.com') && objectPath.includes('/.private/uploads/')) {
            const match = objectPath.match(/\/.private\/uploads\/([a-f0-9-]+)/);
            if (match) {
              proxyPath = `/objects/uploads/${match[1]}`;
            }
          }
          // Full GCS URL without .private
          else if (objectPath.includes('storage.googleapis.com') && objectPath.includes('/uploads/')) {
            const match = objectPath.match(/\/uploads\/([a-f0-9-]+)/);
            if (match) {
              proxyPath = `/objects/uploads/${match[1]}`;
            }
          }
          // Relative path with .private
          else if (objectPath.startsWith('/.private/uploads/')) {
            proxyPath = objectPath.replace('/.private/uploads/', '/objects/uploads/');
          }
          // Relative path without .private
          else if (objectPath.startsWith('/uploads/')) {
            proxyPath = `/objects${objectPath}`;
          }
          
          await storage.createFile({
            projectId: report.projectId,
            albumId: album.id,
            name: fileName || `daily-report-photo-${photo.id}`,
            objectPath: proxyPath,
            contentType: 'image/jpeg',
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
