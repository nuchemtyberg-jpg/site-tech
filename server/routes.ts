import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { setupAuth, registerAuthRoutes, isAuthenticated } from "./replit_integrations/auth";
import { registerObjectStorageRoutes, ObjectStorageService } from "./replit_integrations/object_storage";
import type { User } from "@shared/schema";
import { insertAuthorizedUserSchema, insertRfiSchema, insertTaskTitleSchema } from "@shared/schema";
import { isAdmin, isAuthorizedUser } from "./middleware/auth";
import { sendInviteEmail } from "./services/email";
import { handleProjectStatusChange } from "./services/workflowEngine";
import { changeOpportunityStatus, OpportunityStatusError } from "./services/opportunityService";
import { logActivity, actorFromUser } from "./services/activityLog";
import { getOpportunityStatusLabel, OPPORTUNITY_STATUS_VALUES, labelFor, OPPORTUNITY_CONTACT_ROLES } from "@shared/opportunityStatus";
import { insertWorkflowRuleSchema } from "@shared/schema";
import { generateUploadSignature, deleteFromCloudinary } from "./services/cloudinary";
import {
  isOutlookConfigured, getAuthUrl, exchangeCodeForTokens, getRedirectUri,
  syncProjectEmails, getAttachmentContent, validateOAuthState
} from "./services/outlook";
import { processInboundEmail, verifyMailgunSignature } from "./services/inboundEmail";
import { generateReport } from "./services/reportingAi";
import multer from "multer";
import sharp from "sharp";

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

  // AI Reporting (admin only) - natural language → SQL → results
  app.post("/api/reports/query", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || typeof question !== "string" || question.trim().length === 0) {
        return res.status(400).json({ error: "Question is required" });
      }
      const result = await generateReport(question.trim());
      res.json(result);
    } catch (err: any) {
      console.error("Report query error:", err);
      res.status(400).json({ error: err?.message || "Failed to generate report" });
    }
  });

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
      
      const user = await storage.updateUser(String(req.params.id), updates);
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
      const updated = await storage.updateAuthorizedUser(String(req.params.id), updates);
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
    await storage.deleteAuthorizedUser(String(req.params.id));
    res.status(204).send();
  });

  // Admin Billing
  app.get("/api/admin/billing", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const completedTasks = await storage.getCompletedTasksForBilling();
      res.json(completedTasks);
    } catch (err) {
      console.error("Error fetching billing tasks:", err);
      res.status(500).json({ message: "Failed to fetch billing tasks" });
    }
  });

  app.patch("/api/admin/billing/:taskId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const taskId = Number(req.params.taskId);
      const billingSchema = z.object({ billed: z.boolean() });
      const { billed } = billingSchema.parse(req.body);
      const user = req.user as User;
      const billedBy = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Admin';

      let task;
      if (billed) {
        task = await storage.markTaskBilled(taskId, billedBy);
      } else {
        task = await storage.markTaskUnbilled(taskId);
      }
      res.json(task);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error updating billing status:", err);
      res.status(500).json({ message: "Failed to update billing status" });
    }
  });

  app.post("/api/admin/billing/bulk", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const bulkSchema = z.object({ taskIds: z.array(z.number().int().positive()).min(1) });
      const { taskIds } = bulkSchema.parse(req.body);
      const user = req.user as User;
      const billedBy = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Admin';
      await storage.bulkMarkTasksBilled(taskIds, billedBy);
      res.json({ success: true, count: taskIds.length });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error bulk updating billing status:", err);
      res.status(500).json({ message: "Failed to bulk update billing status" });
    }
  });

  // Pay Applications (G702 Progress Billing)
  app.get("/api/pay-applications/:projectId", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const apps = await storage.getPayApplications(projectId);
      res.json(apps);
    } catch (err) {
      console.error("Error fetching pay applications:", err);
      res.status(500).json({ message: "Failed to fetch pay applications" });
    }
  });

  app.get("/api/pay-applications/:projectId/next-number", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const nextNumber = await storage.getNextPayApplicationNumber(projectId);
      res.json({ nextNumber });
    } catch (err) {
      console.error("Error fetching next pay application number:", err);
      res.status(500).json({ message: "Failed to fetch next number" });
    }
  });

  app.get("/api/pay-application/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const app = await storage.getPayApplication(id);
      if (!app) return res.status(404).json({ message: "Pay application not found" });
      res.json(app);
    } catch (err) {
      console.error("Error fetching pay application:", err);
      res.status(500).json({ message: "Failed to fetch pay application" });
    }
  });

  app.post("/api/pay-applications", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { insertPayApplicationSchema } = await import("@shared/schema");
      const validated = insertPayApplicationSchema.parse(req.body);
      const user = req.user as User;
      const app = await storage.createPayApplication({
        ...validated,
        createdBy: user.id,
        createdByName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Admin',
      });
      res.status(201).json(app);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error creating pay application:", err);
      res.status(500).json({ message: "Failed to create pay application" });
    }
  });

  app.patch("/api/pay-application/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const updateSchema = z.object({
        periodTo: z.string().optional(),
        contractDate: z.string().nullable().optional(),
        originalContractSum: z.number().int().min(0).nullable().optional(),
        netChangeByChangeOrders: z.number().int().nullable().optional(),
        retainagePercent: z.number().min(0).max(100).nullable().optional(),
        notes: z.string().nullable().optional(),
        status: z.enum(["draft", "submitted", "approved"]).optional(),
      });
      const validated = updateSchema.parse(req.body);
      const app = await storage.updatePayApplication(id, validated);
      res.json(app);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error updating pay application:", err);
      res.status(500).json({ message: "Failed to update pay application" });
    }
  });

  app.delete("/api/pay-application/:id", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      await storage.deletePayApplication(id);
      res.status(204).end();
    } catch (err) {
      console.error("Error deleting pay application:", err);
      res.status(500).json({ message: "Failed to delete pay application" });
    }
  });

  // Pay Application Items (G703 line items)
  app.get("/api/pay-application/:id/items", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const payApplicationId = Number(req.params.id);
      const items = await storage.getPayApplicationItems(payApplicationId);
      res.json(items);
    } catch (err) {
      console.error("Error fetching pay application items:", err);
      res.status(500).json({ message: "Failed to fetch items" });
    }
  });

  app.post("/api/pay-application/:id/items", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const payApplicationId = Number(req.params.id);
      const itemsSchema = z.array(z.object({
        taskId: z.number().int(),
        itemNumber: z.number().int(),
        description: z.string(),
        scheduledValue: z.number().int().min(0),
        previouslyCompleted: z.number().int().min(0),
        thisPeriodsWork: z.number().int().min(0),
        materialsStored: z.number().int().min(0),
      }));
      const items = itemsSchema.parse(req.body);
      const results = await storage.bulkUpsertPayApplicationItems(payApplicationId, items.map(item => ({
        ...item,
        payApplicationId,
      })));
      res.json(results);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      console.error("Error saving pay application items:", err);
      res.status(500).json({ message: "Failed to save items" });
    }
  });

  // Generate G702/G703 PDF for a pay application
  app.get("/api/pay-application/:id/pdf", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const payApp = await storage.getPayApplication(id);
      if (!payApp) return res.status(404).json({ message: "Pay application not found" });

      const items = await storage.getPayApplicationItems(id);
      const project = await storage.getProject(payApp.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const PDFDocument = (await import("pdfkit")).default;
      const doc = new PDFDocument({ size: "LETTER", margins: { top: 40, bottom: 40, left: 40, right: 40 } });

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="G702_App${payApp.applicationNumber}_${project.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"`);
      doc.pipe(res);

      const originalContractSum = payApp.originalContractSum || 0;
      const netChange = payApp.netChangeByChangeOrders || 0;
      const contractSumToDate = originalContractSum + netChange;
      const retainagePercent = payApp.retainagePercent || 0;
      const totalCompleted = items.reduce((sum, item) => sum + (item.previouslyCompleted || 0) + (item.thisPeriodsWork || 0) + (item.materialsStored || 0), 0);
      const totalScheduledValue = items.reduce((sum, item) => sum + (item.scheduledValue || 0), 0);
      const percentComplete = totalScheduledValue > 0 ? (totalCompleted / totalScheduledValue) * 100 : 0;
      const retainageAmount = Math.round(totalCompleted * (retainagePercent / 100));
      const totalEarnedLessRetainage = totalCompleted - retainageAmount;
      const previousItems = items.reduce((sum, item) => sum + (item.previouslyCompleted || 0), 0);
      const previousRetainage = Math.round(previousItems * (retainagePercent / 100));
      const previousCertificates = previousItems - previousRetainage;
      const currentPaymentDue = totalEarnedLessRetainage - previousCertificates;
      const balanceToFinish = contractSumToDate - totalCompleted;

      const fmtCurrency = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
      const fmtDate = (d: string) => { try { return new Date(d + "T00:00:00").toLocaleDateString("en-US"); } catch { return d; } };

      // G702 - Application and Certificate for Payment
      doc.fontSize(14).font("Helvetica-Bold").text("AIA DOCUMENT G702", { align: "center" });
      doc.fontSize(11).text("APPLICATION AND CERTIFICATE FOR PAYMENT", { align: "center" });
      doc.moveDown(0.5);

      doc.fontSize(9).font("Helvetica");
      const leftCol = 40;
      const rightCol = 320;
      let y = doc.y;

      let ownerName = "";
      if (project.customerId) {
        const customer = await storage.getCustomer(project.customerId);
        if (customer) ownerName = customer.name;
      }
      doc.text(`TO OWNER: ${ownerName}`, leftCol, y);
      doc.text(`APPLICATION NO: ${payApp.applicationNumber}`, rightCol, y);
      y += 14;
      doc.text(`PROJECT: ${project.name}`, leftCol, y);
      doc.text(`PERIOD TO: ${fmtDate(payApp.periodTo)}`, rightCol, y);
      y += 14;
      doc.text(`FROM CONTRACTOR:`, leftCol, y);
      if (payApp.contractDate) doc.text(`CONTRACT DATE: ${fmtDate(payApp.contractDate)}`, rightCol, y);
      y += 28;

      doc.font("Helvetica-Bold").fontSize(10);
      doc.text("CONTRACTOR'S APPLICATION FOR PAYMENT", leftCol, y);
      y += 18;
      doc.font("Helvetica").fontSize(9);

      const summaryItems = [
        ["1. ORIGINAL CONTRACT SUM", fmtCurrency(originalContractSum)],
        ["2. NET CHANGE BY CHANGE ORDERS", fmtCurrency(netChange)],
        ["3. CONTRACT SUM TO DATE (Line 1 + 2)", fmtCurrency(contractSumToDate)],
        ["4. TOTAL COMPLETED & STORED TO DATE", fmtCurrency(totalCompleted)],
        ["5. RETAINAGE (" + retainagePercent + "%)", fmtCurrency(retainageAmount)],
        ["6. TOTAL EARNED LESS RETAINAGE (Line 4 - 5)", fmtCurrency(totalEarnedLessRetainage)],
        ["7. LESS PREVIOUS CERTIFICATES FOR PAYMENT", fmtCurrency(previousCertificates)],
        ["8. CURRENT PAYMENT DUE", fmtCurrency(currentPaymentDue)],
        ["9. BALANCE TO FINISH (Line 3 - 4)", fmtCurrency(balanceToFinish)],
      ];

      summaryItems.forEach(([label, value]) => {
        doc.text(label as string, leftCol, y);
        doc.text(value as string, rightCol + 100, y, { align: "right", width: 100 });
        y += 16;
      });

      y += 10;
      doc.text(`PERCENT COMPLETE: ${percentComplete.toFixed(1)}%`, leftCol, y);
      y += 16;
      doc.text(`STATUS: ${payApp.status.toUpperCase()}`, leftCol, y);

      if (payApp.notes) {
        y += 20;
        doc.font("Helvetica-Bold").text("NOTES:", leftCol, y);
        y += 14;
        doc.font("Helvetica").text(payApp.notes, leftCol, y, { width: 530 });
      }

      // G703 - Continuation Sheet (only if items exist)
      if (items.length > 0) {
        doc.addPage();
        doc.fontSize(14).font("Helvetica-Bold").text("AIA DOCUMENT G703", { align: "center" });
        doc.fontSize(11).text("CONTINUATION SHEET", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(8).font("Helvetica").text(`Application No: ${payApp.applicationNumber}    Period To: ${fmtDate(payApp.periodTo)}    Project: ${project.name}`);
        doc.moveDown(0.5);

        const colWidths = [30, 130, 70, 70, 70, 70, 70, 45, 70];
        const colHeaders = ["#", "Description of Work", "Scheduled Value", "From Previous", "This Period", "Materials Stored", "Total Completed", "%", "Balance"];
        const tableLeft = 25;
        y = doc.y;

        doc.font("Helvetica-Bold").fontSize(7);
        let x = tableLeft;
        colHeaders.forEach((header, i) => {
          doc.text(header, x, y, { width: colWidths[i], align: i >= 2 ? "right" : "left" });
          x += colWidths[i] + 3;
        });

        y += 14;
        doc.moveTo(tableLeft, y).lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0) + colWidths.length * 3, y).stroke();
        y += 4;

        doc.font("Helvetica").fontSize(7);
        items.forEach(item => {
          if (y > 720) {
            doc.addPage();
            y = 40;
          }
          const totalComp = (item.previouslyCompleted || 0) + (item.thisPeriodsWork || 0) + (item.materialsStored || 0);
          const pct = item.scheduledValue > 0 ? ((totalComp / item.scheduledValue) * 100).toFixed(1) + "%" : "0.0%";
          const balance = item.scheduledValue - totalComp;

          x = tableLeft;
          const rowData = [
            String(item.itemNumber),
            item.description,
            fmtCurrency(item.scheduledValue),
            fmtCurrency(item.previouslyCompleted),
            fmtCurrency(item.thisPeriodsWork),
            fmtCurrency(item.materialsStored),
            fmtCurrency(totalComp),
            pct,
            fmtCurrency(balance),
          ];
          rowData.forEach((val, i) => {
            doc.text(val, x, y, { width: colWidths[i], align: i >= 2 ? "right" : "left" });
            x += colWidths[i] + 3;
          });
          y += 12;
        });

        // Totals row
        y += 4;
        doc.moveTo(tableLeft, y).lineTo(tableLeft + colWidths.reduce((a, b) => a + b, 0) + colWidths.length * 3, y).stroke();
        y += 4;
        doc.font("Helvetica-Bold").fontSize(7);
        x = tableLeft;
        const totals = [
          "",
          "TOTALS",
          fmtCurrency(totalScheduledValue),
          fmtCurrency(previousItems),
          fmtCurrency(items.reduce((s, i) => s + (i.thisPeriodsWork || 0), 0)),
          fmtCurrency(items.reduce((s, i) => s + (i.materialsStored || 0), 0)),
          fmtCurrency(totalCompleted),
          percentComplete.toFixed(1) + "%",
          fmtCurrency(balanceToFinish),
        ];
        totals.forEach((val, i) => {
          doc.text(val, x, y, { width: colWidths[i], align: i >= 2 ? "right" : "left" });
          x += colWidths[i] + 3;
        });
      }

      doc.end();
    } catch (err) {
      console.error("Error generating PDF:", err);
      res.status(500).json({ message: "Failed to generate PDF" });
    }
  });

  // Get all pay applications across all projects (for billing page)
  app.get("/api/admin/pay-applications", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const projectsData = await storage.getProjects();
      const allApps: any[] = [];
      for (const project of projectsData) {
        const apps = await storage.getPayApplications(project.id);
        for (const app of apps) {
          const items = await storage.getPayApplicationItems(app.id);
          allApps.push({ ...app, projectName: project.name, items });
        }
      }
      res.json(allApps);
    } catch (err) {
      console.error("Error fetching all pay applications:", err);
      res.status(500).json({ message: "Failed to fetch pay applications" });
    }
  });

  // Get tasks with scheduled values for a project (for progress billing)
  app.get("/api/projects/:projectId/tasks-with-values", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      const projectTasks = await storage.getTasks(projectId);
      res.json(projectTasks);
    } catch (err) {
      console.error("Error fetching project tasks for billing:", err);
      res.status(500).json({ message: "Failed to fetch project tasks" });
    }
  });

  // Customers - all routes protected by authorization
  // Helper to resolve the acting user for activity logging
  const getActor = async (req: any) => {
    const claims = (req.user as any)?.claims;
    const dbUser = claims?.sub ? await storage.getUser(claims.sub) : undefined;
    return actorFromUser(dbUser);
  };

  app.get(api.customers.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const status = typeof req.query.status === "string" ? req.query.status : "active";
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const list = await storage.listCustomers({ status, search });
    res.json(list);
  });

  // Duplicate company-name check (must be registered before /api/customers/:id)
  app.get("/api/customers/duplicate-check", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name : "";
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : undefined;
    if (!name.trim()) return res.json([]);
    const matches = await storage.findSimilarCustomers(name, excludeId);
    res.json(matches.map((c) => ({ id: c.id, name: c.name, customerType: c.customerType, status: c.status })));
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
      const actor = await getActor(req);
      await logActivity({
        entityType: "customer", entityId: customer.id, action: "customer_created",
        actor, description: `Customer "${customer.name}" created`,
        metadata: { customerId: customer.id },
      });
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
      const id = Number(req.params.id);
      const existing = await storage.getCustomer(id);
      if (!existing) return res.status(404).json({ message: "Customer not found" });
      const input = api.customers.update.input.parse(req.body);
      const customer = await storage.updateCustomer(id, input);
      const actor = await getActor(req);
      const action = input.status === "archived" && existing.status !== "archived" ? "customer_archived" : "customer_edited";
      await logActivity({
        entityType: "customer", entityId: customer.id, action,
        actor,
        description: action === "customer_archived"
          ? `Customer "${customer.name}" archived`
          : `Customer "${customer.name}" edited`,
        metadata: { customerId: customer.id },
      });
      res.json(customer);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Archive customer (safe alternative to deletion)
  app.post("/api/customers/:id/archive", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getCustomer(id);
    if (!existing) return res.status(404).json({ message: "Customer not found" });
    const customer = await storage.updateCustomer(id, { status: "archived" });
    const actor = await getActor(req);
    await logActivity({
      entityType: "customer", entityId: id, action: "customer_archived",
      actor, description: `Customer "${customer.name}" archived`,
      metadata: { customerId: id },
    });
    res.json(customer);
  });

  // Hard delete is admin-only and blocked when historical records exist
  app.delete(api.customers.delete.path, isAuthenticated, isAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getCustomer(id);
    if (!existing) return res.status(404).json({ message: "Customer not found" });
    const counts = await storage.getCustomerDependencyCounts(id);
    if (counts.projects > 0 || counts.communications > 0) {
      const parts: string[] = [];
      if (counts.projects > 0) parts.push(`${counts.projects} Project${counts.projects === 1 ? "" : "s"}`);
      if (counts.communications > 0) parts.push(`${counts.communications} Communication${counts.communications === 1 ? "" : "s"}`);
      return res.status(409).json({
        message: `This customer cannot be deleted because it has ${parts.join(" and ")}. Archive the customer instead.`,
        counts,
      });
    }
    await storage.deleteCustomer(id);
    res.status(204).send();
  });

  // Customer activity log
  app.get("/api/customers/:id/activity", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const activity = await storage.getCustomerActivity(Number(req.params.id));
    res.json(activity);
  });

  // Projects belonging to a customer (drives the Projects tab and communication project select)
  app.get("/api/customers/:customerId/projects", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const customerId = Number(req.params.customerId);
    if (isNaN(customerId)) return res.status(400).json({ message: "Invalid customer id" });
    const customer = await storage.getCustomer(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    const list = await storage.getProjectsByCustomer(customerId);
    res.json(list);
  });

  // Contacts
  app.get("/api/customers/:customerId/contacts", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const customerId = Number(req.params.customerId);
    if (isNaN(customerId)) return res.status(400).json({ message: "Invalid customer id" });
    const customer = await storage.getCustomer(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    const list = await storage.getContacts(customerId);
    res.json(list);
  });

  app.post("/api/customers/:customerId/contacts", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const customerId = Number(req.params.customerId);
      const customer = await storage.getCustomer(customerId);
      if (!customer) return res.status(404).json({ message: "Customer not found" });
      const { insertContactSchema } = await import("@shared/schema");
      const input = insertContactSchema.parse({ ...req.body, customerId });
      const contact = await storage.createContact(input);
      const actor = await getActor(req);
      const fullName = `${contact.firstName} ${contact.lastName || ""}`.trim();
      await logActivity({
        entityType: "contact", entityId: contact.id, action: "contact_added",
        actor, description: `Contact "${fullName}" added to ${customer.name}${contact.isPrimary ? " (Primary)" : ""}`,
        metadata: { customerId },
      });
      res.status(201).json(contact);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put("/api/contacts/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getContact(id);
      if (!existing) return res.status(404).json({ message: "Contact not found" });
      const { insertContactSchema } = await import("@shared/schema");
      const input = insertContactSchema.partial().omit({ customerId: true }).parse(req.body);
      const contact = await storage.updateContact(id, input);
      const actor = await getActor(req);
      const fullName = `${contact.firstName} ${contact.lastName || ""}`.trim();

      let action = "contact_edited";
      let description = `Contact "${fullName}" edited`;
      if (input.isActive === false && existing.isActive) {
        action = "contact_deactivated";
        description = `Contact "${fullName}" deactivated`;
      } else if (input.isActive === true && !existing.isActive) {
        action = "contact_reactivated";
        description = `Contact "${fullName}" reactivated`;
      } else if (input.isPrimary === true && !existing.isPrimary) {
        action = "primary_contact_changed";
        description = `"${fullName}" set as Primary Contact`;
      }
      await logActivity({
        entityType: "contact", entityId: id, action,
        actor, description,
        metadata: { customerId: existing.customerId },
      });
      res.json(contact);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // Hard delete a contact - only allowed when it has no historical relationships
  app.delete("/api/contacts/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getContact(id);
    if (!existing) return res.status(404).json({ message: "Contact not found" });
    const commCount = await storage.contactCommunicationCount(id);
    if (commCount > 0) {
      return res.status(409).json({
        message: `This contact is linked to ${commCount} communication${commCount === 1 ? "" : "s"}. Deactivate the contact instead to keep history intact.`,
      });
    }
    const projectLinkCount = await storage.contactProjectLinkCount(id);
    if (projectLinkCount > 0) {
      return res.status(409).json({
        message: `This contact is linked to ${projectLinkCount} project${projectLinkCount === 1 ? "" : "s"}. Remove it from those projects first, or deactivate the contact instead.`,
      });
    }
    await storage.deleteContact(id);
    const actor = await getActor(req);
    const fullName = `${existing.firstName} ${existing.lastName || ""}`.trim();
    await logActivity({
      entityType: "contact", entityId: id, action: "contact_deleted",
      actor, description: `Contact "${fullName}" deleted`,
      metadata: { customerId: existing.customerId },
    });
    res.status(204).send();
  });

  // Duplicate contact-email check within a customer
  app.get("/api/customers/:customerId/contacts/duplicate-check", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const customerId = Number(req.params.customerId);
    if (isNaN(customerId)) return res.status(400).json({ message: "Invalid customer id" });
    const customer = await storage.getCustomer(customerId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    const email = typeof req.query.email === "string" ? req.query.email : "";
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : undefined;
    if (!email.trim()) return res.json([]);
    const matches = await storage.findContactsByEmail(customerId, email, excludeId);
    res.json(matches);
  });

  // Project Contacts - link a project to contacts belonging to its customer
  app.get("/api/projects/:projectId/contacts", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const projectId = Number(req.params.projectId);
    if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project id" });
    const project = await storage.getProject(projectId);
    if (!project) return res.status(404).json({ message: "Project not found" });
    const list = await storage.getProjectContacts(projectId);
    res.json(list);
  });

  app.post("/api/projects/:projectId/contacts", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const projectId = Number(req.params.projectId);
      if (isNaN(projectId)) return res.status(400).json({ message: "Invalid project id" });
      const project = await storage.getProject(projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });
      if (!project.customerId) {
        return res.status(400).json({ message: "Project has no customer; assign a customer before linking contacts" });
      }
      const { insertProjectContactSchema } = await import("@shared/schema");
      const input = insertProjectContactSchema.parse({ ...req.body, projectId });
      const contact = await storage.getContact(input.contactId);
      if (!contact) return res.status(404).json({ message: "Contact not found" });
      if (contact.customerId !== project.customerId) {
        return res.status(400).json({ message: "Contact does not belong to this project's customer" });
      }
      const existing = await storage.findProjectContact(projectId, input.contactId);
      if (existing) {
        return res.status(409).json({ message: "Contact is already linked to this project" });
      }
      const link = await storage.createProjectContact(input);
      const actor = await getActor(req);
      const fullName = `${contact.firstName} ${contact.lastName || ""}`.trim();
      await logActivity({
        entityType: "project", entityId: projectId, action: "project_contact_linked",
        actor, description: `Contact "${fullName}" linked to project "${project.name}"${input.roleLabel ? ` as ${input.roleLabel}` : ""}`,
        metadata: { contactId: contact.id, customerId: contact.customerId },
      });
      res.status(201).json({ ...link, contact });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.patch("/api/project-contacts/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getProjectContact(id);
      if (!existing) return res.status(404).json({ message: "Project contact link not found" });
      const updateSchema = z.object({ roleLabel: z.string().max(100).nullable().optional() });
      const input = updateSchema.parse(req.body);
      // Omitted roleLabel is a no-op; explicit null clears it.
      if (!("roleLabel" in req.body)) {
        return res.json(existing);
      }
      const updated = await storage.updateProjectContact(id, { roleLabel: input.roleLabel ?? null });
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/project-contacts/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getProjectContact(id);
    if (!existing) return res.status(404).json({ message: "Project contact link not found" });
    await storage.deleteProjectContact(id);
    const contact = await storage.getContact(existing.contactId);
    const project = await storage.getProject(existing.projectId);
    const actor = await getActor(req);
    const fullName = contact ? `${contact.firstName} ${contact.lastName || ""}`.trim() : `#${existing.contactId}`;
    await logActivity({
      entityType: "project", entityId: existing.projectId, action: "project_contact_unlinked",
      actor, description: `Contact "${fullName}" unlinked from project "${project?.name ?? existing.projectId}"`,
      metadata: { contactId: existing.contactId },
    });
    res.status(204).send();
  });

  // Task Titles (a.k.a. task types) - persistent list users can add to when creating tasks
  app.get("/api/task-titles", isAuthenticated, isAuthorizedUser, async (_req, res) => {
    const titles = await storage.getTaskTitles();
    res.json(titles);
  });

  app.post("/api/task-titles", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = insertTaskTitleSchema.parse(req.body);
      const title = await storage.createTaskTitle(input);
      res.status(201).json(title);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete("/api/task-titles/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteTaskTitle(Number(req.params.id));
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
    let project;
    let previousStatus: string | null = null;
    let input;
    try {
      input = api.projects.update.input.parse(req.body);
      // Captures the prior status atomically (row lock) so concurrent duplicate
      // requests cannot both observe the same status transition.
      const result = await storage.updateProjectWithStatusTracking(Number(req.params.id), input);
      project = result.project;
      previousStatus = result.previousStatus;
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(404).json({ message: "Project not found" });
    }

    // Project status workflow automation — fires only on a true status transition.
    // Re-saving the same status never triggers.
    if (input.status !== undefined && previousStatus !== null && input.status !== previousStatus) {
      try {
        const dbUser = await storage.getUser((req.user as any).claims.sub);
        await handleProjectStatusChange({
          project,
          previousStatus,
          newStatus: project.status,
          actor: actorFromUser(dbUser),
          today: typeof req.query.clientDate === "string" ? req.query.clientDate : undefined,
        });
      } catch (err) {
        // The project update itself succeeded; workflow failures must not fail the request
        console.error("[Workflow] Failed to process status change:", err);
      }
    }

    res.json(project);
  });

  app.delete(api.projects.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteProject(Number(req.params.id));
    res.status(204).send();
  });

  // ============================================================
  // Opportunities (Phase 4 — RFP / bidding foundation)
  // ============================================================

  const opportunityDisplay = (o: { opportunityNumber: string; name: string }) => `${o.opportunityNumber} (${o.name})`;

  app.get(api.opportunities.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const q = req.query;
    const status = typeof q.status === "string" && q.status ? q.status : undefined;
    if (status && !OPPORTUNITY_STATUS_VALUES.includes(status)) {
      return res.status(400).json({ message: `Invalid status filter: ${status}` });
    }
    const list = await storage.getOpportunities({
      status,
      customerId: typeof q.customerId === "string" && q.customerId ? Number(q.customerId) : undefined,
      responsibleUserId: typeof q.responsibleUserId === "string" && q.responsibleUserId ? q.responsibleUserId : undefined,
      includeArchived: q.includeArchived === "true",
      search: typeof q.search === "string" && q.search ? q.search : undefined,
    });
    res.json(list);
  });

  app.get(api.opportunities.get.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const opp = await storage.getOpportunityWithDetails(Number(req.params.id));
    if (!opp) return res.status(404).json({ message: "Opportunity not found" });
    res.json(opp);
  });

  app.get(api.opportunities.listForCustomer.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const customer = await storage.getCustomer(Number(req.params.customerId));
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    const list = await storage.getOpportunitiesByCustomer(customer.id, req.query.includeArchived === "true");
    res.json(list);
  });

  app.post(api.opportunities.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.opportunities.create.input.parse(req.body);
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });

      const customer = await storage.getCustomer(input.customerId);
      if (!customer) return res.status(400).json({ message: "Customer not found" });

      if (input.responsibleUserId) {
        const responsible = await storage.getUser(input.responsibleUserId);
        if (!responsible || responsible.isAuthorized !== "approved") {
          return res.status(400).json({ message: "Responsible user must be an approved, active user" });
        }
      }

      const opportunity = await storage.createOpportunity({ ...input, createdByUserId: user.id });

      const actor = actorFromUser(user);
      await logActivity({
        entityType: "opportunity", entityId: opportunity.id, action: "opportunity_created",
        actor,
        description: `${actor.name} created opportunity ${opportunityDisplay(opportunity)} for ${customer.name}.`,
        metadata: { opportunityId: opportunity.id, customerId: customer.id, status: opportunity.status },
      });

      res.status(201).json(opportunity);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.opportunities.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { confirmRemoveContacts, ...input } = api.opportunities.update.input.parse(req.body);
      const existing = await storage.getOpportunity(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Opportunity not found" });
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });
      const actor = actorFromUser(user);

      if (input.responsibleUserId !== undefined && input.responsibleUserId !== null) {
        const responsible = await storage.getUser(input.responsibleUserId);
        if (!responsible || responsible.isAuthorized !== "approved") {
          return res.status(400).json({ message: "Responsible user must be an approved, active user" });
        }
      }

      // Customer change safety: contacts from the previous customer must never
      // be silently retained. Require explicit confirmation, then remove them.
      let removedContacts = 0;
      const customerChanging = input.customerId !== undefined && input.customerId !== existing.customerId;
      if (customerChanging) {
        const newCustomer = await storage.getCustomer(input.customerId!);
        if (!newCustomer) return res.status(400).json({ message: "Customer not found" });
        const linkedContacts = await storage.getOpportunityContacts(existing.id);
        if (linkedContacts.length > 0 && !confirmRemoveContacts) {
          return res.status(409).json({
            message: `This opportunity has ${linkedContacts.length} linked contact${linkedContacts.length === 1 ? "" : "s"} from the current customer. Changing the customer will remove ${linkedContacts.length === 1 ? "it" : "them"}. Confirm to proceed.`,
          });
        }
        if (linkedContacts.length > 0) {
          removedContacts = await storage.deleteOpportunityContactsForOpportunity(existing.id);
        }
      }

      const opportunity = await storage.updateOpportunity(existing.id, input);

      if (customerChanging) {
        const newCustomer = await storage.getCustomer(opportunity.customerId);
        await logActivity({
          entityType: "opportunity", entityId: opportunity.id, action: "opportunity_customer_changed",
          actor,
          description: `${actor.name} changed the customer of ${opportunityDisplay(opportunity)} to ${newCustomer?.name ?? "Unknown"}${removedContacts ? ` and removed ${removedContacts} contact${removedContacts === 1 ? "" : "s"} from the previous customer` : ""}.`,
          metadata: { opportunityId: opportunity.id, customerId: opportunity.customerId, previousCustomerId: existing.customerId, removedContacts },
        });
      }
      if (input.responsibleUserId !== undefined && input.responsibleUserId !== existing.responsibleUserId) {
        const responsible = input.responsibleUserId ? await storage.getUser(input.responsibleUserId) : null;
        const responsibleName = responsible
          ? ([responsible.firstName, responsible.lastName].filter(Boolean).join(" ").trim() || responsible.email || "Unknown user")
          : null;
        await logActivity({
          entityType: "opportunity", entityId: opportunity.id, action: "opportunity_responsible_user_changed",
          actor,
          description: responsibleName
            ? `${actor.name} assigned ${responsibleName} as responsible for ${opportunityDisplay(opportunity)}.`
            : `${actor.name} removed the responsible user from ${opportunityDisplay(opportunity)}.`,
          metadata: { opportunityId: opportunity.id, customerId: opportunity.customerId, responsibleUserId: input.responsibleUserId },
        });
      }
      // General edit activity (skip when the only changes were logged above)
      const editedFields = Object.keys(input).filter(k =>
        (input as any)[k] !== undefined && k !== "customerId" && k !== "responsibleUserId");
      if (editedFields.length > 0) {
        await logActivity({
          entityType: "opportunity", entityId: opportunity.id, action: "opportunity_updated",
          actor,
          description: `${actor.name} updated ${opportunityDisplay(opportunity)} (${editedFields.join(", ")}).`,
          metadata: { opportunityId: opportunity.id, customerId: opportunity.customerId, fields: editedFields },
        });
      }

      res.json(opportunity);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  // ALL status transitions go through the centralized service — no other path
  // may change an opportunity's status.
  app.post(api.opportunities.changeStatus.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.opportunities.changeStatus.input.parse(req.body);
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });
      const { opportunity } = await changeOpportunityStatus({
        opportunityId: Number(req.params.id),
        input,
        actor: actorFromUser(user),
        today: typeof req.query.clientDate === "string" ? req.query.clientDate : undefined,
      });
      res.json(opportunity);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      if (err instanceof OpportunityStatusError) {
        return res.status(err.status).json({ message: err.message });
      }
      throw err;
    }
  });

  app.post(api.opportunities.archive.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { archived } = api.opportunities.archive.input.parse(req.body);
      const existing = await storage.getOpportunity(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Opportunity not found" });
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });

      if (existing.isArchived === archived) return res.json(existing); // idempotent

      const opportunity = await storage.updateOpportunity(existing.id, { isArchived: archived });
      const actor = actorFromUser(user);
      await logActivity({
        entityType: "opportunity", entityId: opportunity.id,
        action: archived ? "opportunity_archived" : "opportunity_unarchived",
        actor,
        description: `${actor.name} ${archived ? "archived" : "unarchived"} ${opportunityDisplay(opportunity)}.`,
        metadata: { opportunityId: opportunity.id, customerId: opportunity.customerId },
      });
      res.json(opportunity);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.get(api.opportunities.statusHistory.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const opp = await storage.getOpportunity(Number(req.params.id));
    if (!opp) return res.status(404).json({ message: "Opportunity not found" });
    res.json(await storage.getOpportunityStatusHistory(opp.id));
  });

  app.get(api.opportunities.activity.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const opp = await storage.getOpportunity(Number(req.params.id));
    if (!opp) return res.status(404).json({ message: "Opportunity not found" });
    res.json(await storage.getOpportunityActivity(opp.id));
  });

  // ---------- Opportunity Contacts ----------

  app.get(api.opportunityContacts.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const opp = await storage.getOpportunity(Number(req.params.id));
    if (!opp) return res.status(404).json({ message: "Opportunity not found" });
    res.json(await storage.getOpportunityContacts(opp.id));
  });

  app.post(api.opportunityContacts.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.opportunityContacts.create.input.parse(req.body);
      const opp = await storage.getOpportunity(Number(req.params.id));
      if (!opp) return res.status(404).json({ message: "Opportunity not found" });
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });

      // Contact must belong to the opportunity's customer — enforced server-side
      const contact = await storage.getContact(input.contactId);
      if (!contact || contact.customerId !== opp.customerId) {
        return res.status(400).json({ message: "Contact does not belong to this opportunity's customer" });
      }
      const existingLink = await storage.findOpportunityContact(opp.id, input.contactId);
      if (existingLink) {
        return res.status(400).json({ message: "This contact is already linked to the opportunity" });
      }

      const link = await storage.createOpportunityContact({ ...input, opportunityId: opp.id });
      const actor = actorFromUser(user);
      const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
      await logActivity({
        entityType: "opportunity", entityId: opp.id, action: "opportunity_contact_added",
        actor,
        description: `${actor.name} added ${contactName}${link.role ? ` as ${labelFor(OPPORTUNITY_CONTACT_ROLES, link.role)}` : ""}${link.isPrimary ? " (primary contact)" : ""} to ${opportunityDisplay(opp)}.`,
        metadata: { opportunityId: opp.id, customerId: opp.customerId, contactId: contact.id, role: link.role, isPrimary: link.isPrimary },
      });

      res.status(201).json({
        ...link,
        firstName: contact.firstName, lastName: contact.lastName, jobTitle: contact.jobTitle,
        email: contact.email, officePhone: contact.officePhone, mobilePhone: contact.mobilePhone,
        customerId: contact.customerId,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.opportunityContacts.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.opportunityContacts.update.input.parse(req.body);
      const existing = await storage.getOpportunityContact(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Opportunity contact not found" });
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });

      const link = await storage.updateOpportunityContact(existing.id, input);
      const opp = await storage.getOpportunity(link.opportunityId);
      const contact = await storage.getContact(link.contactId);
      if (opp && contact) {
        const actor = actorFromUser(user);
        const contactName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
        await logActivity({
          entityType: "opportunity", entityId: opp.id, action: "opportunity_contact_updated",
          actor,
          description: `${actor.name} updated ${contactName} on ${opportunityDisplay(opp)}${link.role ? ` (role: ${labelFor(OPPORTUNITY_CONTACT_ROLES, link.role)})` : ""}${link.isPrimary ? " (primary contact)" : ""}.`,
          metadata: { opportunityId: opp.id, customerId: opp.customerId, contactId: contact.id, role: link.role, isPrimary: link.isPrimary },
        });
      }
      res.json({
        ...link,
        firstName: contact?.firstName ?? "", lastName: contact?.lastName ?? null, jobTitle: contact?.jobTitle ?? null,
        email: contact?.email ?? null, officePhone: contact?.officePhone ?? null, mobilePhone: contact?.mobilePhone ?? null,
        customerId: contact?.customerId ?? 0,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.opportunityContacts.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const existing = await storage.getOpportunityContact(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Opportunity contact not found" });
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "User not found" });

    await storage.deleteOpportunityContact(existing.id);
    const opp = await storage.getOpportunity(existing.opportunityId);
    const contact = await storage.getContact(existing.contactId);
    if (opp) {
      const actor = actorFromUser(user);
      const contactName = contact ? [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim() : "a contact";
      await logActivity({
        entityType: "opportunity", entityId: opp.id, action: "opportunity_contact_removed",
        actor,
        description: `${actor.name} removed ${contactName} from ${opportunityDisplay(opp)}.`,
        metadata: { opportunityId: opp.id, customerId: opp.customerId, contactId: existing.contactId },
      });
    }
    res.status(204).send();
  });

  // ============================================================
  // Todos (centralized action items)
  // ============================================================

  const getCurrentUser = async (req: any) => storage.getUser(req.user.claims.sub);
  const canManageTodo = (user: { id: string; role: string | null }, todo: { createdByUserId: string | null }) =>
    user.role === "admin" || user.role === "manager" || todo.createdByUserId === user.id;
  // Project todos are visible to anyone who can view the project (same as the
  // project Todos tab); personal todos only to creator/assignee/managers.
  const canViewTodo = (user: { id: string; role: string | null }, todo: { assignedToUserId: string; createdByUserId: string | null; projectId: number | null }) =>
    user.role === "admin" || user.role === "manager" ||
    todo.assignedToUserId === user.id || todo.createdByUserId === user.id ||
    todo.projectId !== null;

  app.get(api.todos.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "User not found" });
    const isPrivileged = user.role === "admin" || user.role === "manager";

    const q = req.query;
    const requestedAssignee = q.assignedToUserId === "me" ? user.id : (typeof q.assignedToUserId === "string" && q.assignedToUserId ? q.assignedToUserId : undefined);
    const projectId = typeof q.projectId === "string" && q.projectId ? Number(q.projectId) : undefined;

    // Read scope: regular users may list their own todos, or todos within a
    // project (project data is visible to all approved users, matching every
    // other per-project endpoint). Cross-user and unscoped "all todos"
    // queries require admin/manager.
    let assignedToUserId = requestedAssignee;
    if (!isPrivileged && projectId === undefined) {
      if (requestedAssignee !== undefined && requestedAssignee !== user.id) {
        return res.status(403).json({ message: "You can only view your own todos" });
      }
      assignedToUserId = user.id;
    }

    const filters: import("./storage").TodoFilters = {
      assignedToUserId,
      projectId,
      status: typeof q.status === "string" && q.status ? q.status : undefined,
      priority: typeof q.priority === "string" && q.priority ? q.priority : undefined,
      due: typeof q.due === "string" && q.due ? (q.due as any) : undefined,
      today: typeof q.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(q.today) ? q.today : undefined,
    };
    const todos = await storage.getTodos(filters);
    res.json(todos);
  });

  app.get(api.todos.myWorkSummary.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const today = typeof req.query.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.today)
      ? req.query.today
      : new Date().toISOString().slice(0, 10);
    const summary = await storage.getMyWorkSummary((req.user as any).claims.sub, today);
    res.json(summary);
  });

  app.get(api.todos.get.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "User not found" });
    const todo = await storage.getTodo(Number(req.params.id));
    if (!todo) return res.status(404).json({ message: "Todo not found" });
    if (!canViewTodo(user, todo)) return res.status(403).json({ message: "You don't have permission to view this todo" });
    res.json(todo);
  });

  app.post(api.todos.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.todos.create.input.parse(req.body);
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });

      // Assignee must be a real, approved user
      const assigneeUser = input.assignedToUserId === user.id ? user : await storage.getUser(input.assignedToUserId);
      if (!assigneeUser || assigneeUser.isAuthorized !== "approved") {
        return res.status(400).json({ message: "Assignee must be an approved, active user" });
      }

      // Optional opportunity link (no project required). Validated server-side.
      let opportunityLink: { id: number } | null = null;
      if (input.relatedEntityType === "opportunity") {
        if (!input.relatedEntityId) {
          return res.status(400).json({ message: "relatedEntityId is required when linking a todo to an opportunity" });
        }
        if (input.projectId) {
          return res.status(400).json({ message: "A todo cannot link to both a project and an opportunity" });
        }
        const opp = await storage.getOpportunity(input.relatedEntityId);
        if (!opp) return res.status(400).json({ message: "Opportunity not found" });
        opportunityLink = { id: opp.id };
      }

      const todo = await storage.createTodo({
        ...input,
        description: input.description || null,
        dueDate: input.dueDate || null,
        projectId: input.projectId ?? null,
        relatedEntityType: opportunityLink ? "opportunity" : (input.projectId ? "project" : null),
        relatedEntityId: opportunityLink ? opportunityLink.id : (input.projectId ?? null),
        createdByUserId: user.id,
        source: "manual",
      });

      const actor = actorFromUser(user);
      const assignee = assigneeUser;
      const assigneeName = [assignee.firstName, assignee.lastName].filter(Boolean).join(" ").trim() || assignee.email || "Unknown user";

      await logActivity({
        projectId: todo.projectId,
        entityType: "todo",
        entityId: todo.id,
        action: "todo_created",
        actor,
        description: todo.assignedToUserId === user.id
          ? `${actor.name} created a todo: ${todo.title}.`
          : `${actor.name} assigned ${assigneeName} a todo: ${todo.title}.`,
        metadata: opportunityLink ? { opportunityId: opportunityLink.id } : undefined,
      });

      // In-app notification for assignment to someone else (never for self-assignment)
      if (todo.assignedToUserId !== user.id) {
        await storage.createNotification({
          userId: todo.assignedToUserId,
          type: "todo_assigned",
          title: `You were assigned: ${todo.title}`,
          message: `${actor.name} assigned you a todo${todo.dueDate ? `, due ${todo.dueDate}` : ""}.`,
          projectId: todo.projectId,
          todoId: todo.id,
          relatedEntityType: todo.relatedEntityType,
          relatedEntityId: todo.relatedEntityId,
          isRead: false,
        });
      }

      res.status(201).json(todo);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.todos.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.todos.update.input.parse(req.body);
      const todoId = Number(req.params.id);
      const existing = await storage.getTodo(todoId);
      if (!existing) return res.status(404).json({ message: "Todo not found" });

      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });

      const isAssignee = existing.assignedToUserId === user.id;
      const fullEdit = canManageTodo(user, existing);

      if (!fullEdit) {
        if (!isAssignee) return res.status(403).json({ message: "You don't have permission to edit this todo" });
        // Assignees can only update status (start / complete / reopen)
        const attemptedFields = Object.keys(input).filter(k => (input as any)[k] !== undefined);
        const disallowed = attemptedFields.filter(f => f !== "status");
        if (disallowed.length > 0) {
          return res.status(403).json({ message: "As the assignee you can only update the status of this todo" });
        }
      }

      // Reassignment target must be a real, approved user
      if (input.assignedToUserId && input.assignedToUserId !== existing.assignedToUserId) {
        const newAssignee = input.assignedToUserId === user.id ? user : await storage.getUser(input.assignedToUserId);
        if (!newAssignee || newAssignee.isAuthorized !== "approved") {
          return res.status(400).json({ message: "Assignee must be an approved, active user" });
        }
      }

      const updates: Record<string, any> = { ...input };
      if ("description" in updates) updates.description = updates.description || null;
      if ("dueDate" in updates) updates.dueDate = updates.dueDate || null;

      let todo = await storage.updateTodo(todoId, updates);
      const becameCompleted = input.status === "completed" && existing.status !== "completed";
      if (becameCompleted) {
        todo = await storage.completeTodo(todoId, user.id);
      }

      const actor = actorFromUser(user);

      // Meaningful activity entries (not noise)
      if (becameCompleted) {
        await logActivity({
          projectId: todo.projectId, entityType: "todo", entityId: todo.id,
          action: "todo_completed", actor,
          description: `${actor.name} completed todo: ${todo.title}.`,
        });
      } else if (input.status === "cancelled" && existing.status !== "cancelled") {
        await logActivity({
          projectId: todo.projectId, entityType: "todo", entityId: todo.id,
          action: "todo_cancelled", actor,
          description: `${actor.name} cancelled todo: ${todo.title}.`,
        });
      } else if (input.status && input.status !== existing.status) {
        await logActivity({
          projectId: todo.projectId, entityType: "todo", entityId: todo.id,
          action: "todo_status_changed", actor,
          description: `${actor.name} moved todo "${todo.title}" to ${input.status === "in_progress" ? "In Progress" : input.status === "open" ? "Open" : input.status}.`,
        });
      }

      if (input.assignedToUserId && input.assignedToUserId !== existing.assignedToUserId) {
        const newAssignee = await storage.getUser(input.assignedToUserId);
        const newAssigneeName = newAssignee ? ([newAssignee.firstName, newAssignee.lastName].filter(Boolean).join(" ").trim() || newAssignee.email || "Unknown user") : "Unknown user";
        await logActivity({
          projectId: todo.projectId, entityType: "todo", entityId: todo.id,
          action: "todo_reassigned", actor,
          description: `${actor.name} reassigned todo "${todo.title}" to ${newAssigneeName}.`,
        });
        // Notify the new assignee (never for self-assignment)
        if (input.assignedToUserId !== user.id) {
          await storage.createNotification({
            userId: input.assignedToUserId,
            type: "todo_assigned",
            title: `You were assigned: ${todo.title}`,
            message: `${actor.name} assigned you a todo${todo.dueDate ? `, due ${todo.dueDate}` : ""}.`,
            projectId: todo.projectId,
            todoId: todo.id,
            relatedEntityType: todo.projectId ? "project" : null,
            relatedEntityId: todo.projectId,
            isRead: false,
          });
        }
      }

      if ("dueDate" in input && (input.dueDate || null) !== existing.dueDate && !becameCompleted) {
        await logActivity({
          projectId: todo.projectId, entityType: "todo", entityId: todo.id,
          action: "todo_due_date_changed", actor,
          description: input.dueDate
            ? `${actor.name} set the due date of "${todo.title}" to ${input.dueDate}.`
            : `${actor.name} removed the due date from "${todo.title}".`,
        });
      }

      res.json(todo);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.post(api.todos.complete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const todoId = Number(req.params.id);
    const existing = await storage.getTodo(todoId);
    if (!existing) return res.status(404).json({ message: "Todo not found" });

    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "User not found" });

    const allowed = existing.assignedToUserId === user.id || canManageTodo(user, existing);
    if (!allowed) return res.status(403).json({ message: "You don't have permission to complete this todo" });

    if (existing.status === "completed") return res.json(existing); // idempotent

    const todo = await storage.completeTodo(todoId, user.id);
    const actor = actorFromUser(user);
    await logActivity({
      projectId: todo.projectId, entityType: "todo", entityId: todo.id,
      action: "todo_completed", actor,
      description: `${actor.name} completed todo: ${todo.title}.`,
    });
    res.json(todo);
  });

  app.delete(api.todos.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const todoId = Number(req.params.id);
    const existing = await storage.getTodo(todoId);
    if (!existing) return res.status(404).json({ message: "Todo not found" });

    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "User not found" });

    if (user.role !== "admin" && existing.createdByUserId !== user.id) {
      return res.status(403).json({ message: "Only the creator or an admin can delete a todo" });
    }
    // Completed todos are historical records and are never deleted
    if (existing.status === "completed") {
      return res.status(400).json({ message: "Completed todos cannot be deleted" });
    }

    await storage.deleteTodo(todoId);
    const actor = actorFromUser(user);
    await logActivity({
      projectId: existing.projectId, entityType: "todo", entityId: existing.id,
      action: "todo_deleted", actor,
      description: `${actor.name} deleted todo: ${existing.title}.`,
    });
    res.status(204).send();
  });

  // ============================================================
  // Notifications (header bell)
  // ============================================================

  app.get(api.notifications.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const limit = typeof req.query.limit === "string" ? Math.min(Number(req.query.limit) || 20, 50) : 20;
    const items = await storage.getNotifications((req.user as any).claims.sub, limit);
    res.json(items);
  });

  app.get(api.notifications.unreadCount.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const count = await storage.getUnreadNotificationCount((req.user as any).claims.sub);
    res.json({ count });
  });

  app.post(api.notifications.markRead.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const notification = await storage.markNotificationRead(Number(req.params.id), (req.user as any).claims.sub);
    if (!notification) return res.status(404).json({ message: "Notification not found" });
    res.json(notification);
  });

  app.post(api.notifications.markAllRead.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const updated = await storage.markAllNotificationsRead((req.user as any).claims.sub);
    res.json({ updated });
  });

  // ============================================================
  // Workflow Rules (admin only)
  // ============================================================

  // ============================================================
  // Todo Updates (notes / progress timeline on a todo)
  // ============================================================

  app.get(api.todoUpdates.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "User not found" });
    const todo = await storage.getTodo(Number(req.params.id));
    if (!todo) return res.status(404).json({ message: "Todo not found" });
    if (!canViewTodo(user, todo)) return res.status(403).json({ message: "You don't have permission to view this todo" });

    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 200) : 25;
    const offsetRaw = Number(req.query.offset);
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;

    const [items, total] = await Promise.all([
      storage.getTodoUpdates(todo.id, { limit, offset }),
      storage.countTodoUpdates(todo.id),
    ]);
    res.json({ items, total });
  });

  app.post(api.todoUpdates.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });
      const todo = await storage.getTodo(Number(req.params.id));
      if (!todo) return res.status(404).json({ message: "Todo not found" });
      // Reuse todo access rules — anyone who can view the todo may record an
      // update (spec: no separate permission system). Completed todos still
      // accept updates so work can be documented after the fact.
      if (!canViewTodo(user, todo)) return res.status(403).json({ message: "You don't have permission to add updates to this todo" });

      const { body } = api.todoUpdates.create.input.parse(req.body);
      const update = await storage.createTodoUpdate({ todoId: todo.id, body, createdByUserId: user.id });

      const actor = actorFromUser(user);
      await logActivity({
        projectId: todo.projectId, entityType: "todo", entityId: todo.id,
        action: "todo_update_added", actor,
        description: `${actor.name} added an update to "${todo.title}".`,
        metadata: { todoUpdateId: update.id },
      });

      // In-app notification for the assignee when someone else adds an update
      // (no email — spec §13; never notify yourself)
      if (todo.assignedToUserId !== user.id) {
        await storage.createNotification({
          userId: todo.assignedToUserId,
          type: "todo_update",
          title: `${actor.name} added an update to: ${todo.title}`,
          message: body.length > 140 ? `${body.slice(0, 140)}…` : body,
          projectId: todo.projectId,
          todoId: todo.id,
          relatedEntityType: todo.projectId ? "project" : null,
          relatedEntityId: todo.projectId,
          isRead: false,
        });
      }

      const authorName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || null;
      res.status(201).json({ ...update, authorName });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.todoUpdates.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ message: "User not found" });
      const existing = await storage.getTodoUpdate(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Update not found" });
      // History integrity: only the author (or an admin) may edit; edited
      // updates are permanently marked "Edited" via editedAt.
      if (existing.createdByUserId !== user.id && user.role !== "admin") {
        return res.status(403).json({ message: "You can only edit your own updates" });
      }
      const { body } = api.todoUpdates.update.input.parse(req.body);
      const updated = await storage.updateTodoUpdateBody(existing.id, body);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.todoUpdates.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return res.status(401).json({ message: "User not found" });
    const existing = await storage.getTodoUpdate(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Update not found" });
    if (existing.createdByUserId !== user.id && user.role !== "admin") {
      return res.status(403).json({ message: "You can only remove your own updates" });
    }
    await storage.softDeleteTodoUpdate(existing.id); // soft delete — history preserved
    res.status(204).send();
  });

  app.get(api.workflowRules.list.path, isAuthenticated, isAdmin, async (_req, res) => {
    const rules = await storage.getWorkflowRules();
    res.json(rules);
  });

  app.post(api.workflowRules.create.path, isAuthenticated, isAdmin, async (req, res) => {
    try {
      const input = api.workflowRules.create.input.parse(req.body);
      const assignee = await storage.getUser(input.assignedToUserId);
      if (!assignee || assignee.isAuthorized !== "approved") {
        return res.status(400).json({ message: "Rule assignee must be an approved, active user" });
      }
      const rule = await storage.createWorkflowRule({ ...input, createdByUserId: (req.user as any).claims.sub });
      res.status(201).json(rule);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.workflowRules.update.path, isAuthenticated, isAdmin, async (req, res) => {
    try {
      const input = insertWorkflowRuleSchema.innerType().partial().parse(req.body);
      const existing = await storage.getWorkflowRule(Number(req.params.id));
      if (!existing) return res.status(404).json({ message: "Workflow rule not found" });

      // Full schema validation (incl. trigger-type/status compatibility and
      // todo/due refinements) applied to the MERGED rule, so a partial update
      // can never produce a rule whose status doesn't match its trigger type.
      const merged = { ...existing, ...input };
      const validation = insertWorkflowRuleSchema.safeParse({
        name: merged.name,
        isActive: merged.isActive,
        triggerType: merged.triggerType,
        triggerStatus: merged.triggerStatus,
        assignedToUserId: merged.assignedToUserId,
        createTodo: merged.createTodo,
        todoTitle: merged.todoTitle,
        todoDescription: merged.todoDescription,
        todoPriority: merged.todoPriority,
        dueOffsetType: merged.dueOffsetType,
        dueOffsetDays: merged.dueOffsetDays,
        dueOffsetUnit: merged.dueOffsetUnit,
        sendInAppNotification: merged.sendInAppNotification,
        sendEmailNotification: merged.sendEmailNotification,
      });
      if (!validation.success) {
        return res.status(400).json({ message: validation.error.errors[0].message });
      }
      if (input.assignedToUserId && input.assignedToUserId !== existing.assignedToUserId) {
        const assignee = await storage.getUser(input.assignedToUserId);
        if (!assignee || assignee.isAuthorized !== "approved") {
          return res.status(400).json({ message: "Rule assignee must be an approved, active user" });
        }
      }

      const rule = await storage.updateWorkflowRule(Number(req.params.id), input);
      res.json(rule);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.delete(api.workflowRules.delete.path, isAuthenticated, isAdmin, async (req, res) => {
    const existing = await storage.getWorkflowRule(Number(req.params.id));
    if (!existing) return res.status(404).json({ message: "Workflow rule not found" });
    await storage.deleteWorkflowRule(Number(req.params.id));
    res.status(204).send();
  });

  // ============================================================
  // Project Activity & Status History
  // ============================================================

  app.get(api.activity.listForProject.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const project = await storage.getProject(Number(req.params.projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });
    const activity = await storage.getProjectActivity(project.id);
    res.json(activity);
  });

  app.get(api.projectStatusHistory.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const project = await storage.getProject(Number(req.params.projectId));
    if (!project) return res.status(404).json({ message: "Project not found" });
    const history = await storage.getProjectStatusHistory(project.id);
    res.json(history);
  });

  // Users (for assignee dropdowns) — approved users only, safe fields only
  app.get(api.users.list.path, isAuthenticated, isAuthorizedUser, async (_req, res) => {
    const allUsers = await storage.getAllUsers();
    const approved = allUsers
      .filter(u => u.isAuthorized === "approved")
      .map(u => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        profileImageUrl: u.profileImageUrl,
        role: u.role ?? "user",
        isAuthorized: u.isAuthorized ?? "pending",
      }))
      .sort((a, b) => `${a.firstName || ""} ${a.lastName || ""}`.localeCompare(`${b.firstName || ""} ${b.lastName || ""}`));
    res.json(approved);
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
      
      // Auto-set completedAt when task reaches 100% complete
      const updateData: any = { ...input };
      if (input.percentComplete === 100 && currentTask.percentComplete !== 100) {
        updateData.completedAt = new Date();
      } else if (input.percentComplete !== undefined && input.percentComplete < 100 && currentTask.percentComplete === 100) {
        updateData.completedAt = null;
      }

      // Update the task
      const task = await storage.updateTask(taskId, updateData);
      
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
    const inspectionEntries = await storage.getDailyReportInspectionEntries(report.id);
    
    // For each task entry, get labor lines, equipment lines, photos, and snapshot bounds
    const taskEntriesWithDetails = await Promise.all(taskEntries.map(async (entry) => {
      const laborLines = await storage.getDailyReportLaborLines(entry.id);
      const equipmentLines = await storage.getDailyReportEquipmentLines(entry.id);
      const photos = await storage.getDailyReportPhotos(undefined, entry.id, undefined, undefined);
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
      const photos = await storage.getDailyReportPhotos(undefined, undefined, entry.id, undefined);
      return { ...entry, photos };
    }));
    
    // For each inspection entry, get photos
    const inspectionEntriesWithPhotos = await Promise.all(inspectionEntries.map(async (entry) => {
      const photos = await storage.getDailyReportPhotos(undefined, undefined, undefined, entry.id);
      return { ...entry, photos };
    }));
    
    const reportPhotos = await storage.getReportLevelPhotos(report.id);
    
    res.json({
      ...report,
      isLatestReport,
      taskEntries: taskEntriesWithDetails,
      deliveryEntries: deliveryEntriesWithPhotos,
      inspectionEntries: inspectionEntriesWithPhotos,
      reportPhotos,
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
      
      // Reject edits if report is completed (read-only). State transitions
      // (complete / reopen) must go through their dedicated endpoints.
      if (existingReport.status === 'completed') {
        return res.status(403).json({ message: "Cannot edit a completed report" });
      }
      
      const body = { ...req.body };
      // Prevent status transitions through the generic update route.
      delete body.status;
      
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

      // Auto-email daily report PDF to configured recipients (async, non-blocking)
      // Use loopback address for self-fetch since server calls its own PDF endpoint.
      // This avoids cross-domain auth issues that occur with external URLs.
      const cookieHeader = req.headers.cookie || '';
      const selfBaseUrl = `http://127.0.0.1:${process.env.PORT || 5000}`;
      setImmediate(async () => {
        try {
          const existingReport = await storage.getDailyReport(reportId);
          if (!existingReport) return;
          const recipients = await storage.getProjectDailyReportRecipients(existingReport.projectId);
          if (recipients.length === 0) {
            console.log(`[AutoEmail] No recipients configured for project ${existingReport.projectId}`);
            return;
          }

          const project = await storage.getProject(existingReport.projectId);
          if (!project) return;

          console.log(`[AutoEmail] Generating PDF for report ${reportId}, sending to ${recipients.length} recipient(s)...`);
          const pdfUrl = `${selfBaseUrl}/api/reports/${reportId}/pdf?includePhotos=true`;
          console.log(`[AutoEmail] Fetching PDF from: ${pdfUrl}`);
          const pdfRes = await fetch(pdfUrl, {
            headers: { cookie: cookieHeader },
          });
          if (!pdfRes.ok) {
            const errorBody = await pdfRes.text().catch(() => '');
            console.error(`[AutoEmail] Failed to generate PDF: ${pdfRes.status} - ${errorBody}`);
            return;
          }
          const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
          console.log(`[AutoEmail] PDF generated successfully (${pdfBuffer.length} bytes)`);

          const { sendDailyReportEmail } = await import("./services/dailyReportMailer");
          await sendDailyReportEmail(
            recipients.map(r => ({ email: r.email, name: r.name })),
            project.name,
            existingReport.reportDate,
            pdfBuffer
          );
        } catch (emailErr) {
          console.error("[AutoEmail] Error sending daily report email:", emailErr);
        }
      });
    } catch (err) {
      console.error("Complete report error:", err);
      return res.status(500).json({ message: "Failed to complete report" });
    }
  });

  // Reopen a completed report (admin only) - reverts to draft and clears signature
  app.post("/api/reports/:id/incomplete", isAuthenticated, isAdmin, async (req, res) => {
    try {
      const reportId = Number(req.params.id);

      const existingReport = await storage.getDailyReport(reportId);
      if (!existingReport) {
        return res.status(404).json({ message: "Report not found" });
      }

      if (existingReport.status !== 'completed') {
        return res.status(400).json({ message: "Report is not completed" });
      }

      const report = await storage.updateDailyReport(reportId, {
        status: 'draft',
        signatureType: null,
        signatureValue: null,
        completedAt: null,
        completedBy: null,
        completedByName: null,
      });

      res.json(report);
    } catch (err) {
      console.error("Incomplete report error:", err);
      return res.status(500).json({ message: "Failed to reopen report" });
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

      const autoOrientImage = async (imageBytes: Uint8Array): Promise<Uint8Array> => {
        try {
          // Photos display at max ~235x160 PDF points. Downscale to a cap that keeps
          // print clarity (~2x display size) while drastically reducing embedded bytes,
          // which is what makes photo-heavy reports slow/large to download.
          const oriented = await sharp(Buffer.from(imageBytes))
            .rotate()
            .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 72, mozjpeg: true })
            .toBuffer();
          return new Uint8Array(oriented);
        } catch (err) {
          console.log(`[PDF Photo] sharp auto-orient failed, using original bytes`, err);
          return imageBytes;
        }
      };

      const getPhotoBytes = async (url: string): Promise<Uint8Array | null> => {
        try {
          let rawBytes: Uint8Array | null = null;

          if (url.startsWith('http://') || url.startsWith('https://')) {
            const objectPath = getObjectPath(url);
            if (objectPath.startsWith('/objects/')) {
              try {
                const file = await objectStorageService.getObjectEntityFile(objectPath);
                const [buffer] = await file.download();
                rawBytes = new Uint8Array(buffer);
              } catch {
                console.log(`[PDF Photo] Object storage failed, trying HTTP fetch: ${url}`);
              }
            }
            if (!rawBytes) {
              rawBytes = await fetchPhotoFromUrl(url);
            }
          } else {
            const objectPath = getObjectPath(url);
            if (!objectPath.startsWith('/objects/')) {
              console.log(`[PDF Photo] Skipping unrecognized URL: ${url}`);
              return null;
            }
            const file = await objectStorageService.getObjectEntityFile(objectPath);
            const [buffer] = await file.download();
            rawBytes = new Uint8Array(buffer);
          }

          if (!rawBytes) return null;
          return await autoOrientImage(rawBytes);
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
      const inspectionEntries = await storage.getDailyReportInspectionEntries(reportId);
      
      // Load labor, equipment lines, and photos for each task entry
      const taskEntriesWithLines = await Promise.all(
        taskEntries.map(async (entry) => ({
          ...entry,
          laborLines: await storage.getDailyReportLaborLines(entry.id),
          equipmentLines: await storage.getDailyReportEquipmentLines(entry.id),
          photos: includePhotos ? await storage.getDailyReportPhotos(undefined, entry.id, undefined, undefined) : [],
        }))
      );
      
      // Load photos for delivery entries if including photos
      const deliveryEntriesWithPhotos = await Promise.all(
        deliveryEntries.map(async (entry) => ({
          ...entry,
          photos: includePhotos ? await storage.getDailyReportPhotos(undefined, undefined, entry.id, undefined) : [],
        }))
      );
      
      // Load photos for inspection entries if including photos
      const inspectionEntriesWithPhotos = await Promise.all(
        inspectionEntries.map(async (entry) => ({
          ...entry,
          photos: includePhotos ? await storage.getDailyReportPhotos(undefined, undefined, undefined, entry.id) : [],
        }))
      );
      
      // Create PDF
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

      // Fetch + downscale + embed photos concurrently (bounded) so photo-heavy
      // reports don't process images one-at-a-time. Returns embedded images in
      // the same order as the input photos (null entries for any that failed).
      const embedPhotosInOrder = async (photos: { url: string }[]): Promise<(any | null)[]> => {
        const results: (any | null)[] = new Array(photos.length).fill(null);
        const concurrency = Math.min(6, photos.length);
        let next = 0;
        const worker = async () => {
          while (next < photos.length) {
            const current = next++;
            try {
              const imageBytes = await getPhotoBytes(photos[current].url);
              if (!imageBytes) continue;
              let embeddedImage;
              try { embeddedImage = await pdfDoc.embedJpg(imageBytes); }
              catch { try { embeddedImage = await pdfDoc.embedPng(imageBytes); } catch { continue; } }
              results[current] = embeddedImage;
            } catch (err) { console.error("Failed to embed photo:", err); }
          }
        };
        await Promise.all(Array.from({ length: concurrency }, worker));
        return results;
      };
      
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
            
            const embeddedTaskPhotos = await embedPhotosInOrder(entry.photos);
            for (let i = 0; i < entry.photos.length; i += 2) {
              const photosInRow: { image: any; width: number; height: number }[] = [];
              for (let j = 0; j < 2 && i + j < entry.photos.length; j++) {
                const embeddedImage = embeddedTaskPhotos[i + j];
                if (!embeddedImage) continue;
                const scale = Math.min(photoMaxWidth / embeddedImage.width, photoMaxHeight / embeddedImage.height);
                photosInRow.push({ image: embeddedImage, width: embeddedImage.width * scale, height: embeddedImage.height * scale });
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
            const embeddedDeliveryPhotos = await embedPhotosInOrder(delivery.photos);
            for (let i = 0; i < delivery.photos.length; i += 2) {
              const photosInRow: { image: any; width: number; height: number }[] = [];
              for (let j = 0; j < 2 && i + j < delivery.photos.length; j++) {
                const embeddedImage = embeddedDeliveryPhotos[i + j];
                if (!embeddedImage) continue;
                const scale = Math.min(photoMaxWidth / embeddedImage.width, photoMaxHeight / embeddedImage.height);
                photosInRow.push({ image: embeddedImage, width: embeddedImage.width * scale, height: embeddedImage.height * scale });
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
      
      // === INSPECTIONS ===
      drawSectionHeader("INSPECTIONS");
      
      if (inspectionEntriesWithPhotos.length === 0) {
        drawItalicText("No inspections recorded", margin + 12, y, 9);
        y -= lineHeight;
      } else {
        for (const inspection of inspectionEntriesWithPhotos) {
          addNewPageIfNeeded(50);
          drawText(inspection.inspectionType || 'Unknown type', margin + 12, y, 10, true, darkText);
          const passedText = inspection.passed === true ? "PASSED" : inspection.passed === false ? "FAILED" : "PENDING";
          const passedClr = inspection.passed === true ? successGreen : inspection.passed === false ? warningRed : mediumText;
          drawText(passedText, rightEdge - 10 - font.widthOfTextAtSize(passedText, 9), y, 9, true, passedClr);
          y -= lineHeight + 2;
          
          drawText("Authority: ", margin + 15, y, 9, true, mediumText);
          drawText(inspection.inspectionAuthority || '', margin + 75, y, 9, false, darkText);
          y -= lineHeight;
          
          if (inspection.inspectorName) {
            drawText("Inspector: ", margin + 15, y, 9, true, mediumText);
            drawText(inspection.inspectorName, margin + 75, y, 9, false, darkText);
            y -= lineHeight;
          }

          if (inspection.notes) {
            drawText("Notes: ", margin + 15, y, 9, true, mediumText);
            drawText(inspection.notes, margin + 75, y, 9, false, darkText);
            y -= lineHeight;
          }
          
          if (inspection.photos && inspection.photos.length > 0) {
            drawText("Photos:", margin + 15, y, 9, true, mediumText);
            y -= lineHeight + 5;
            const photoMaxWidth = 235;
            const photoMaxHeight = 160;
            const photoGap = 20;
            const embeddedInspectionPhotos = await embedPhotosInOrder(inspection.photos);
            for (let i = 0; i < inspection.photos.length; i += 2) {
              const photosInRow: { image: any; width: number; height: number }[] = [];
              for (let j = 0; j < 2 && i + j < inspection.photos.length; j++) {
                const embeddedImage = embeddedInspectionPhotos[i + j];
                if (!embeddedImage) continue;
                const scale = Math.min(photoMaxWidth / embeddedImage.width, photoMaxHeight / embeddedImage.height);
                photosInRow.push({ image: embeddedImage, width: embeddedImage.width * scale, height: embeddedImage.height * scale });
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

      const projectEmployeeIds = new Set(
        allPunches
          .filter(p => p.jobCode && jobCodes.includes(p.jobCode) && p.punchType === 0)
          .map(p => p.employeeId)
      );

      if (projectEmployeeIds.size === 0) {
        return res.json([]);
      }

      const employeePunches = allPunches.filter(p => projectEmployeeIds.has(p.employeeId));

      const { buildDailyTimeSummaries } = await import("./services/fingercheck");
      const summaries = buildDailyTimeSummaries(employeePunches);

      const result = summaries.map(s => {
        const projectShifts = s.shifts.filter(shift =>
          shift.jobCode && jobCodes.includes(shift.jobCode)
        );

        if (projectShifts.length === 0) return null;

        let availableHours = projectShifts.reduce((sum, shift) => sum + (shift.hours || 0), 0);
        const hasOpenShift = projectShifts.some(shift => shift.punchOut === null);
        if (hasOpenShift) {
          const openShift = projectShifts.find(shift => shift.punchOut === null);
          if (openShift) {
            const punchInTime = new Date(openShift.punchIn);
            const now = new Date();
            const openHours = (now.getTime() - punchInTime.getTime()) / (1000 * 60 * 60);
            availableHours = projectShifts
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
          shifts: projectShifts,
          jobCode: s.jobCode,
          jobDescription: s.jobDescription,
        };
      }).filter(Boolean);

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

  // Daily Report Inspection Entries
  app.post("/api/reports/:reportId/inspection-entries", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const reportId = Number(req.params.reportId);
      const report = await storage.getDailyReport(reportId);
      if (!report) return res.status(404).json({ message: "Report not found" });
      if (report.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
      
      const entry = await storage.createDailyReportInspectionEntry({
        reportId,
        ...req.body,
      });
      res.status(201).json(entry);
    } catch (err) {
      console.error("Create inspection entry error:", err);
      return res.status(500).json({ message: "Failed to create inspection entry" });
    }
  });

  app.put("/api/daily-report-inspection-entries/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const entry = await storage.getDailyReportInspectionEntry(Number(req.params.id));
      if (!entry) return res.status(404).json({ message: "Inspection entry not found" });
      
      const report = await storage.getDailyReport(entry.reportId);
      if (report?.status === 'completed') return res.status(403).json({ message: "Cannot edit a completed report" });
      
      const updated = await storage.updateDailyReportInspectionEntry(Number(req.params.id), req.body);
      res.json(updated);
    } catch (err) {
      return res.status(500).json({ message: "Failed to update inspection entry" });
    }
  });

  app.delete("/api/daily-report-inspection-entries/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    const entry = await storage.getDailyReportInspectionEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ message: "Inspection entry not found" });
    
    const report = await storage.getDailyReport(entry.reportId);
    if (report?.status === 'completed') return res.status(403).json({ message: "Cannot delete from a completed report" });
    
    await storage.deleteDailyReportInspectionEntry(Number(req.params.id));
    res.status(204).send();
  });

  // Daily Report Photos
  app.post("/api/daily-report-photos", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { reportId, taskEntryId, deliveryEntryId, inspectionEntryId, url, caption, createdBy, createdByName, cloudinaryPublicId, cloudinaryUrl, fileName, takenAt } = req.body;
      
      // Validate that at least one reference is provided
      if (!reportId && !taskEntryId && !deliveryEntryId && !inspectionEntryId) {
        return res.status(400).json({ message: "Must provide reportId, taskEntryId, deliveryEntryId, or inspectionEntryId" });
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
      if (inspectionEntryId) {
        const entry = await storage.getDailyReportInspectionEntry(inspectionEntryId);
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
        inspectionEntryId,
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
      const customerId = Number(req.params.customerId);
      const input = api.communications.create.input.parse(req.body);

      // Optional contact link must belong to this customer
      if (input.contactId) {
        const contact = await storage.getContact(input.contactId);
        if (!contact || contact.customerId !== customerId) {
          return res.status(400).json({ message: "Contact does not belong to this customer" });
        }
      }
      // Optional project link must belong to this customer
      if (input.projectId) {
        const project = await storage.getProject(input.projectId);
        if (!project || project.customerId !== customerId) {
          return res.status(400).json({ message: "Project does not belong to this customer" });
        }
      }
      // Optional opportunity link must belong to this customer
      if (input.opportunityId) {
        const opportunity = await storage.getOpportunity(input.opportunityId);
        if (!opportunity || opportunity.customerId !== customerId) {
          return res.status(400).json({ message: "Opportunity does not belong to this customer" });
        }
      }

      const comm = await storage.createCommunication({
        ...input,
        customerId,
      });
      const actor = await getActor(req);
      await logActivity({
        entityType: "communication", entityId: comm.id, action: "communication_logged",
        actor, description: `Communication logged${comm.subject ? `: "${comm.subject}"` : ` (${comm.type})`}`,
        metadata: { customerId, ...(comm.opportunityId ? { opportunityId: comm.opportunityId } : {}) },
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

  // Schedule Entries
  app.get(api.scheduleEntries.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const list = await storage.getScheduleEntries();
    res.json(list);
  });

  app.get(api.scheduleEntries.get.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const entry = await storage.getScheduleEntry(Number(req.params.id));
    if (!entry) return res.status(404).json({ message: "Schedule entry not found" });
    res.json(entry);
  });

  app.post(api.scheduleEntries.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.scheduleEntries.create.input.parse(req.body);
      const entry = await storage.createScheduleEntry(input);
      res.status(201).json(entry);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      throw err;
    }
  });

  app.put(api.scheduleEntries.update.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.scheduleEntries.update.input.parse(req.body);
      const updated = await storage.updateScheduleEntry(Number(req.params.id), input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      return res.status(404).json({ message: "Schedule entry not found" });
    }
  });

  app.delete(api.scheduleEntries.delete.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteScheduleEntry(Number(req.params.id));
    res.status(204).send();
  });

  app.get(api.scheduleEntries.allocations.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const list = await storage.getAllocationsByScheduleEntry(Number(req.params.id));
    res.json(list);
  });

  // Allocations
  app.get(api.allocations.list.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    const list = await storage.getAllocations();
    res.json(list);
  });

  app.post(api.allocations.create.path, isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const input = api.allocations.create.input.parse(req.body);

      const allAllocations = await storage.getAllocations();
      const newStart = input.startDate;
      const newEnd = input.endDate;

      for (const existing of allAllocations) {
        if (existing.deletedAt) continue;
        const existsStart = existing.startDate;
        const existsEnd = existing.endDate;
        const datesOverlap = existsStart <= newEnd && existsEnd >= newStart;
        if (!datesOverlap) continue;

        if (input.allocationType === "crew" && existing.allocationType === "crew" && input.employeeId && existing.employeeId === input.employeeId) {
          const entryForExisting = existing.scheduleEntryId ? await storage.getScheduleEntry(existing.scheduleEntryId) : null;
          const projectForExisting = entryForExisting?.projectId ? (await storage.getProject(entryForExisting.projectId)) : null;
          const projectName = projectForExisting?.name || "another project";
          return res.status(409).json({
            message: `${existing.crewMember || "This employee"} is already allocated from ${existsStart} to ${existsEnd} on ${projectName}`
          });
        }

        if (input.allocationType === "equipment" && existing.allocationType === "equipment" && input.equipmentId && existing.equipmentId === input.equipmentId) {
          const entryForExisting = existing.scheduleEntryId ? await storage.getScheduleEntry(existing.scheduleEntryId) : null;
          const projectForExisting = entryForExisting?.projectId ? (await storage.getProject(entryForExisting.projectId)) : null;
          const projectName = projectForExisting?.name || "another project";
          return res.status(409).json({
            message: `${existing.crewMember || "This equipment"} is already allocated from ${existsStart} to ${existsEnd} on ${projectName}`
          });
        }
      }

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
      const { folder, resourceType } = req.body;
      const signature = generateUploadSignature({ folder: folder || 'sitetech/photos' });
      const validResourceTypes = ['image', 'video', 'raw'];
      const resolvedResourceType = validResourceTypes.includes(resourceType) ? resourceType : 'image';
      res.json({ ...signature, resourceType: resolvedResourceType });
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
      const mediaType = req.body.mediaType === 'video' ? 'video' : 'image';
      const photo = await storage.createPhoto({
        ...req.body,
        projectId,
        albumId: req.body.albumId || generalAlbum.id,
        takenAt,
        displayDate: takenAt || new Date(),
        mediaType,
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
        const resourceType = photo.mediaType === 'video' ? 'video' : 'image';
        await deleteFromCloudinary(photo.cloudinaryPublicId, resourceType).catch(console.error);
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

  // ===== Company Documents =====

  // Company Folders
  app.get('/api/company-documents/folders', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const list = await storage.getCompanyFolders();
    res.json(list);
  });

  app.post('/api/company-documents/folders', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { name, parentId } = req.body;
      if (!name) return res.status(400).json({ message: "name is required" });
      const folder = await storage.createCompanyFolder({ name, parentId: parentId ?? null });
      res.status(201).json(folder);
    } catch (err) {
      throw err;
    }
  });

  app.put('/api/company-documents/folders/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const folder = await storage.updateCompanyFolder(Number(req.params.id), req.body);
      res.json(folder);
    } catch (err) {
      throw err;
    }
  });

  app.delete('/api/company-documents/folders/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteCompanyFolder(Number(req.params.id));
    res.status(204).send();
  });

  app.get('/api/company-documents/folders/children', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const parentId = req.query.parentId === 'null' || req.query.parentId === undefined 
      ? null 
      : Number(req.query.parentId);
    
    const childFolders = await storage.getCompanyChildFolders(parentId);
    
    const foldersWithChildren = await Promise.all(
      childFolders.map(async (folder) => {
        const children = await storage.getCompanyChildFolders(folder.id);
        return {
          ...folder,
          hasChildren: children.length > 0
        };
      })
    );
    
    foldersWithChildren.sort((a, b) => a.name.localeCompare(b.name));
    res.json(foldersWithChildren);
  });

  app.get('/api/company-documents/folders/:id/path', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const folderId = Number(req.params.id);
    const path = await storage.getCompanyFolderPath(folderId);
    res.json(path);
  });

  app.get('/api/company-documents/folders/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const folder = await storage.getCompanyFolder(Number(req.params.id));
    if (!folder) {
      return res.status(404).json({ message: "Folder not found" });
    }
    res.json(folder);
  });

  // Company Files
  app.get('/api/company-documents/files', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const list = await storage.getCompanyFiles();
    res.json(list);
  });

  app.post('/api/company-documents/files', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { name, objectPath, folderId, contentType, size } = req.body;
      if (!name || !objectPath) {
        return res.status(400).json({ message: "name and objectPath are required" });
      }
      const file = await storage.createCompanyFile({
        name,
        objectPath,
        folderId: folderId ?? null,
        contentType: contentType || null,
        size: size || null,
      });
      res.status(201).json(file);
    } catch (err) {
      throw err;
    }
  });

  app.put('/api/company-documents/files/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const file = await storage.updateCompanyFile(Number(req.params.id), req.body);
      res.json(file);
    } catch (err) {
      throw err;
    }
  });

  app.delete('/api/company-documents/files/:id', isAuthenticated, isAuthorizedUser, async (req, res) => {
    await storage.deleteCompanyFile(Number(req.params.id));
    res.status(204).send();
  });

  app.post('/api/company-documents/files/batch-delete', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ message: "ids array is required" });
    }
    await storage.batchDeleteCompanyFiles(ids.map(Number));
    res.status(204).send();
  });

  app.post('/api/company-documents/files/batch-move', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const { ids, folderId } = req.body;
    if (!ids || !Array.isArray(ids)) {
      return res.status(400).json({ message: "ids array is required" });
    }
    await storage.batchMoveCompanyFiles(ids.map(Number), folderId === null ? null : Number(folderId));
    res.json({ success: true });
  });

  // Check if report exists for a specific date
  app.get('/api/projects/:projectId/reports/by-date/:date', isAuthenticated, isAuthorizedUser, async (req, res) => {
    const report = await storage.getDailyReportByDate(Number(req.params.projectId), String(req.params.date));
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
        res.send(Buffer.from(value[0]));
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
  // Project Daily Report Recipients Routes
  // ============================================================

  app.get("/api/projects/:projectId/daily-report-recipients", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const recipients = await storage.getProjectDailyReportRecipients(Number(req.params.projectId));
      res.json(recipients);
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch recipients" });
    }
  });

  app.post("/api/projects/:projectId/daily-report-recipients", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const { email, name } = req.body;
      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email is required" });
      }
      const recipient = await storage.createProjectDailyReportRecipient({
        projectId: Number(req.params.projectId),
        email: email.trim(),
        name: name?.trim() || null,
      });
      res.json(recipient);
    } catch (err) {
      res.status(500).json({ message: "Failed to add recipient" });
    }
  });

  app.delete("/api/daily-report-recipients/:id", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      await storage.deleteProjectDailyReportRecipient(Number(req.params.id));
      res.json({ message: "Recipient removed" });
    } catch (err) {
      res.status(500).json({ message: "Failed to remove recipient" });
    }
  });

  // ============================================================
  // RFI Routes
  // ============================================================

  // Serve RFI files from object storage (PDFs and attachments)
  const serveRfiObject = async (req: any, res: any) => {
    try {
      const { ObjectStorageService } = await import("./replit_integrations/object_storage/objectStorage");
      const objectStorageService = new ObjectStorageService();
      const subPath = req.url.replace(/^\/objects\/rfis\//, "");
      const fullPath = `/objects/rfis/${subPath}`;
      const objectFile = await objectStorageService.getObjectEntityFile(fullPath);
      await objectStorageService.downloadObject(objectFile, res);
    } catch (err: any) {
      if (err?.name === "ObjectNotFoundError") {
        res.status(404).json({ message: "File not found" });
      } else {
        console.error("Error serving RFI file:", err);
        res.status(500).json({ message: "Failed to serve file" });
      }
    }
  };
  app.get("/objects/rfis/:a/:b", isAuthenticated, isAuthorizedUser, serveRfiObject);
  app.get("/objects/rfis/:a/:b/:c", isAuthenticated, isAuthorizedUser, serveRfiObject);
  app.get("/objects/rfis/:a/:b/:c/:d", isAuthenticated, isAuthorizedUser, serveRfiObject);

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

      const { objectStorageClient } = await import("./replit_integrations/object_storage/objectStorage");
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
  app.post("/api/rfis/:id/preview-email", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });
      const project = await storage.getProject(rfi.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const userId = (req.user as any).claims.sub;
      const { getConnectedEmail } = await import("./services/outlookConnector");
      const connectedEmail = await getConnectedEmail(userId);

      const rfiLabel = `RFI-${String(rfi.rfiNumber).padStart(3, "0")}`;
      const subject = `${rfiLabel}: ${rfi.subject} - ${project.name}`;
      const defaultBody = `Request for Information - ${rfiLabel}\n\nProject: ${project.name}${project.projectNumber ? ` (#${project.projectNumber})` : ""}\nSubject: ${rfi.subject}\nPriority: ${(rfi.priority || "normal").toUpperCase()}${rfi.dueDate ? `\nResponse Due: ${new Date(rfi.dueDate).toLocaleDateString()}` : ""}\n\nQuestion:\n${rfi.question}${rfi.additionalBody ? `\n\n${rfi.additionalBody}` : ""}\n\nPlease reply to this email with your response. The full RFI document is attached as a PDF.\nSent via SiteTech Construction Management`;

      res.json({
        from: connectedEmail || "Not connected",
        to: rfi.directedToEmail,
        cc: rfi.ccEmails?.filter(Boolean) || [],
        subject,
        body: defaultBody,
        rfiLabel,
      });
    } catch (err: any) {
      res.status(500).json({ message: "Failed to generate preview" });
    }
  });

  app.post("/api/rfis/:id/send", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });

      const project = await storage.getProject(rfi.projectId);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const userId = (req.user as any).claims.sub;
      const dbUser = await storage.getUser(userId);
      if (!dbUser) return res.status(401).json({ message: "User not found" });

      const customBody = req.body?.customBody;

      const attachmentFiles = (rfi.attachments || []).map((att: string) => {
        try {
          return JSON.parse(att);
        } catch {
          return null;
        }
      }).filter(Boolean);

      const { generateRfiPdf, uploadPdfToStorage } = await import("./services/rfiPdfGenerator");
      const pdfBuffer = await generateRfiPdf({
        rfi,
        projectName: project.name,
        projectNumber: project.projectNumber || undefined,
        attachmentFiles,
      });

      const pdfPath = await uploadPdfToStorage(pdfBuffer, rfi.projectId, rfi.rfiNumber);

      const { sendEmail, getConnectedEmail } = await import("./services/outlookConnector");
      const connectedEmail = await getConnectedEmail(userId);

      const emailAttachments: Array<{ name: string; contentType: string; contentBytes: string }> = [
        {
          name: `RFI-${String(rfi.rfiNumber).padStart(3, "0")}_${project.name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`,
          contentType: "application/pdf",
          contentBytes: pdfBuffer.toString("base64"),
        },
      ];

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
      let emailBody: string;
      if (customBody) {
        emailBody = `
          <div style="font-family: Arial, sans-serif; max-width: 700px;">
            <p>${customBody.replace(/\n/g, "<br/>")}</p>
          </div>
        `;
      } else {
        emailBody = `
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
      }

      const result = await sendEmail({
        to: [rfi.directedToEmail],
        cc: rfi.ccEmails?.filter(Boolean) || [],
        subject: `${rfiLabel}: ${rfi.subject} - ${project.name}`,
        bodyHtml: emailBody,
        attachments: emailAttachments,
      }, userId);

      await storage.updateRfi(rfi.id, {
        status: "open",
        pdfUrl: pdfPath,
        outlookMessageId: result.messageId,
        outlookConversationId: result.conversationId,
        sentAt: new Date(),
        sentBy: userId,
        sentByName: `${dbUser.firstName || ""} ${dbUser.lastName || ""}`.trim() || dbUser.email || "Unknown",
        sentByEmail: connectedEmail || dbUser.email || "",
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

      const userId = (req.user as any).claims.sub;
      const { getEmailReplies } = await import("./services/outlookConnector");
      const replies = await getEmailReplies(rfi.outlookConversationId, userId);

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

  // RFI: Get full conversation (all emails including sent by user)
  app.get("/api/rfis/:id/conversation", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });
      if (!rfi.outlookConversationId) return res.json([]);

      const userId = (req.user as any).claims.sub;
      const { getEmailReplies } = await import("./services/outlookConnector");
      const allMessages = await getEmailReplies(rfi.outlookConversationId, userId);
      res.json(allMessages);
    } catch (err: any) {
      console.error("Failed to get conversation:", err);
      res.status(500).json({ message: "Failed to get conversation" });
    }
  });

  // RFI: Get attachments for a specific email message
  app.get("/api/rfis/:id/message-attachments/:messageId", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });

      const userId = (req.user as any).claims.sub;
      const { getOutlookClient } = await import("./services/outlookConnector");
      const client = await getOutlookClient(userId);
      const result = await client
        .api(`/me/messages/${req.params.messageId}/attachments`)
        .get();

      const attachments = (result.value || [])
        .filter((att: any) => !att.isInline && att.contentBytes)
        .map((att: any) => ({
          id: att.id,
          name: att.name,
          contentType: att.contentType,
          size: att.size,
        }));

      res.json(attachments);
    } catch (err: any) {
      console.error("Failed to get message attachments:", err);
      res.status(500).json({ message: "Failed to get attachments" });
    }
  });

  // RFI: Download a specific email attachment
  app.get("/api/rfis/:id/message-attachments/:messageId/:attachmentId", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const rfi = await storage.getRfi(Number(req.params.id));
      if (!rfi) return res.status(404).json({ message: "RFI not found" });

      const userId = (req.user as any).claims.sub;
      const { getOutlookClient } = await import("./services/outlookConnector");
      const client = await getOutlookClient(userId);
      const attachment = await client
        .api(`/me/messages/${req.params.messageId}/attachments/${req.params.attachmentId}`)
        .get();

      if (attachment.contentBytes) {
        const buffer = Buffer.from(attachment.contentBytes, "base64");
        res.setHeader("Content-Type", attachment.contentType || "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${attachment.name}"`);
        res.send(buffer);
      } else {
        res.status(404).json({ message: "Attachment content not found" });
      }
    } catch (err: any) {
      console.error("Failed to download attachment:", err);
      res.status(500).json({ message: "Failed to download attachment" });
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
      const userId = (req.user as any).claims.sub;
      const { isOutlookConnectorConfigured, getConnectedEmail, isUserOutlookConfigured } = await import("./services/outlookConnector");
      const connected = await isOutlookConnectorConfigured(userId);
      let email = null;
      if (connected) {
        email = await getConnectedEmail(userId);
      }
      const userConn = await storage.getUserOutlookConnection(userId);
      res.json({
        connected,
        email,
        source: userConn ? "user" : connected ? "replit" : null,
        canConnect: isUserOutlookConfigured(),
      });
    } catch (err) {
      res.json({ connected: false, email: null, source: null, canConnect: false });
    }
  });

  // User-level Outlook OAuth connect
  app.get("/api/outlook/user-connect", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      const { getUserConnectUrl } = await import("./services/outlookConnector");
      const proto = req.get("x-forwarded-proto") || req.protocol;
      const origin = `${proto}://${req.get("host")}`;
      const url = getUserConnectUrl(userId, origin);
      res.json({ url });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to generate connect URL" });
    }
  });

  // User-level Outlook OAuth callback
  app.get("/api/outlook/user-callback", async (req, res) => {
    const sendPage = (success: boolean, message: string) => {
      res.send(`<!DOCTYPE html><html><head><title>Outlook Connection</title>
        <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#e2e8f0;}
        .card{text-align:center;padding:2rem;border-radius:0.75rem;background:#1e293b;max-width:400px;}
        .icon{font-size:2rem;margin-bottom:1rem;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;}
        .icon.ok{background:#065f46;color:#34d399;}
        .icon.fail{background:#7f1d1d;color:#f87171;}
        .icon svg{width:28px;height:28px;}
        h2{margin:0 0 0.5rem;}
        p{color:#94a3b8;margin:0 0 1rem;}
        .btn{display:inline-block;padding:0.5rem 1.5rem;border-radius:0.375rem;background:${success ? '#f97316' : '#ef4444'};color:white;text-decoration:none;cursor:pointer;border:none;font-size:1rem;}
        </style></head><body><div class="card">
        <div class="icon ${success ? 'ok' : 'fail'}"><svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">${success ? '<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>' : '<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>'}</svg></div>
        <h2>${success ? 'Connected!' : 'Connection Failed'}</h2>
        <p>${message}</p>
        <button class="btn" onclick="window.close()">Close Window</button>
        </div>
        <script>if(window.opener){window.opener.postMessage({type:'outlook_user_callback',success:${success}},'*');}</script>
        </body></html>`);
    };

    try {
      const { code, state, error } = req.query;
      if (error) return sendPage(false, String(error));
      if (!code || !state) return sendPage(false, "Missing parameters from Microsoft.");

      const { validateUserOAuthState, exchangeUserCode } = await import("./services/outlookConnector");
      const stateResult = validateUserOAuthState(String(state));
      if (!stateResult) return sendPage(false, "Connection request expired. Please try again.");
      const { userId, redirectUri } = stateResult;

      const tokens = await exchangeUserCode(String(code), redirectUri);
      const expiresAt = new Date(Date.now() + (tokens.expiresIn - 60) * 1000);

      await storage.upsertUserOutlookConnection({
        userId,
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt,
      });

      sendPage(true, `Your Outlook account (${tokens.email}) is now connected. You can close this window.`);
    } catch (err: any) {
      console.error("User Outlook callback error:", err);
      sendPage(false, "Something went wrong. Please try again.");
    }
  });

  // User-level Outlook disconnect
  app.post("/api/outlook/disconnect", isAuthenticated, isAuthorizedUser, async (req, res) => {
    try {
      const userId = (req.user as any).claims.sub;
      await storage.deleteUserOutlookConnection(userId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ message: "Failed to disconnect" });
    }
  });

  return httpServer;
}
