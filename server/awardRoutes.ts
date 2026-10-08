import type { Express } from "express";
import { and, eq, isNull, or, asc, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import {
  projects, opportunities, projectContracts, files, folders, projectContacts, contacts,
  activityLogs, projectStatusHistory, tasks, communications, photos, photoAlbums,
  dailyReports, dailyReportTaskEntries, dailyReportLaborLines, dailyReportEquipmentLines,
  dailyReportDeliveryEntries, dailyReportInspectionEntries, dailyReportPhotos,
  projectEmails, projectEmailAttachments, rfis, rfiResponses, scheduleEntries, allocations,
  fingercheckProjectMappings, projectDailyReportRecipients, notifications, customers,
  todoUpdates, taskStatusHistory,
} from "@shared/schema";
import { isAuthenticated } from "./replit_integrations/auth";
import { isAuthorizedUser, isAdmin } from "./middleware/auth";
import { awardBid, awardCatchUpPreview, OpportunityStatusError } from "./services/awardService";
import { actorFromUser } from "./services/activityLog";
import { storage } from "./storage";
import { projectViewForUser } from "./services/projectFinancialAccess";

const id = z.coerce.number().int().positive();
export function registerAwardRoutes(app: Express) {
  const auth = [isAuthenticated, isAuthorizedUser];
  const handle = (fn: (req: any, res: any) => Promise<any>) => async (req: any, res: any) => {
    try { await fn(req, res); }
    catch (error) {
      if (error instanceof OpportunityStatusError) return res.status(error.status).json({ message: error.message });
      if (error instanceof z.ZodError) return res.status(400).json({ message: error.errors[0].message });
      console.error("[Award API]", error);
      res.status(500).json({ message: "Award operation failed; retry is safe" });
    }
  };
  const projectFor = async (projectId: number) => {
    const project = await storage.getProject(projectId);
    if (!project) throw new OpportunityStatusError("Project not found", 404);
    return project;
  };
  const linkedBids = (projectId: number) => db.select().from(opportunities).where(and(
    isNull(opportunities.deletedAt),
    or(eq(opportunities.convertedProjectId, projectId), eq(opportunities.targetProjectId, projectId)),
  )).orderBy(asc(opportunities.id));

  app.get("/api/projects/:id/bids", ...auth, handle(async (req, res) => {
    const projectId = id.parse(req.params.id);
    const project = await projectFor(projectId);
    const user = await storage.getUser(req.user.claims.sub);
    const contracts = await db.select().from(projectContracts).where(eq(projectContracts.projectId, projectId));
    const bids = await linkedBids(projectId);
    res.json({
      project: await projectViewForUser(user, project),
      bids: bids.map(bid => {
        const contract = contracts.find(c => c.opportunityId === bid.id) ?? null;
        return user?.role === "admin" ? { ...bid, contract } : {
          ...bid, expectedValue: null, probability: null,
          contract: contract && { ...contract, amount: null, snapshot: { ...contract.snapshot, expectedValue: null, probability: null } },
        };
      }),
      awardedTotal: user?.role === "admin" ? contracts.reduce((sum, c) => sum + (c.amount ?? 0), 0) : null,
      pendingTotal: user?.role === "admin" ? bids.filter(b => !contracts.some(c => c.opportunityId === b.id) && !["awarded", "lost", "no_bid"].includes(b.status)).reduce((sum, b) => sum + (b.expectedValue ?? 0), 0) : null,
    });
  }));

  app.get("/api/projects/:id/document-sources", ...auth, handle(async (req, res) => {
    const projectId = id.parse(req.params.id);
    await projectFor(projectId);
    const bids = await linkedBids(projectId);
    const sources = bids.map(b => ({ entityType: "opportunity", entityId: b.id, label: `${b.opportunityNumber} · ${b.name}${b.convertedProjectId ? " (awarded)" : " (pending bid)"}` }));
    const nativeFiles = await db.select({ id: files.id }).from(files).where(and(eq(files.projectId, projectId), isNull(files.deletedAt))).limit(1);
    const nativeFolders = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.projectId, projectId), isNull(folders.deletedAt))).limit(1);
    if (!sources.length || nativeFiles.length || nativeFolders.length) sources.push({ entityType: "project", entityId: projectId, label: "Project documents" });
    res.json(sources);
  }));

  app.get("/api/opportunities/award-catch-up", ...auth, isAdmin, handle(async (_req, res) => {
    res.json(await awardCatchUpPreview());
  }));
  app.post("/api/opportunities/award-catch-up", ...auth, isAdmin, handle(async (req, res) => {
    const input = z.object({ opportunityIds: z.array(z.number().int().positive()).min(1).max(100), confirm: z.literal(true) }).strict().parse(req.body);
    const user = await storage.getUser(req.user.claims.sub);
    const results = [];
    // Per-bid transactions: one conflict never rolls back another approved bid.
    for (const opportunityId of new Set(input.opportunityIds)) {
      try {
        const { opportunity } = await awardBid({ opportunityId, actor: actorFromUser(user), catchUp: true });
        results.push({ opportunityId, projectId: opportunity.convertedProjectId, success: true });
      } catch (error) {
        results.push({ opportunityId, success: false, message: error instanceof Error ? error.message : "Catch-up failed" });
      }
    }
    res.json({ results });
  }));

  // Retired source Project history is read-only and reachable from the bid.
  // Nothing is restored, overwritten, merged or attached to the new Project.
  app.get("/api/opportunities/:id/migration-history", ...auth, handle(async (req, res) => {
    const bid = await storage.getOpportunity(id.parse(req.params.id));
    if (!bid) throw new OpportunityStatusError("Opportunity not found", 404);
    if (!bid.migratedFromProjectId) return res.json(null);
    const sourceId = bid.migratedFromProjectId;
    const [project] = await db.select().from(projects).where(eq(projects.id, sourceId));
    if (!project || !project.deletedAt) return res.json({ issue: "Historical source missing or not retired; explicit reconciliation required", sourceId });
    const user = await storage.getUser(req.user.claims.sub);
    const contactRows = await db.select({ link: projectContacts, contact: contacts }).from(projectContacts).leftJoin(contacts, eq(projectContacts.contactId, contacts.id)).where(eq(projectContacts.projectId, sourceId));
    const reports = await db.select().from(dailyReports).where(eq(dailyReports.projectId, sourceId));
    const reportIds = reports.map(r => r.id);
    const reportEntries = reportIds.length ? await db.select().from(dailyReportTaskEntries).where(inArray(dailyReportTaskEntries.reportId, reportIds)) : [];
    const entryIds = reportEntries.map(r => r.id);
    const emails = await db.select().from(projectEmails).where(eq(projectEmails.projectId, sourceId));
    const rfisRows = await db.select().from(rfis).where(eq(rfis.projectId, sourceId));
    const [sourceCustomer] = project.customerId ? await db.select().from(customers).where(eq(customers.id, project.customerId)) : [];
    const sourceTodos = await storage.getTodos({ projectId: sourceId, status: "all" });
    const sourceTasks = await db.select().from(tasks).where(eq(tasks.projectId, sourceId));
    const sourceFiles = await db.select().from(files).where(eq(files.projectId, sourceId));
    const sourceFolders = await db.select().from(folders).where(eq(folders.projectId, sourceId));
    const sourceProject = { ...(user?.role === "admin" ? project : { ...project, estimatedValue: null }), customerName: sourceCustomer?.name };
    const retainedWork = {
      originalProject: [sourceProject],
      documentFiles: sourceFiles,
      documentFolders: sourceFolders,
      todoUpdates: sourceTodos.length ? await db.select().from(todoUpdates).where(inArray(todoUpdates.todoId, sourceTodos.map(t => t.id))) : [],
      todoAttachments: sourceTodos.length ? await db.select().from(files).where(and(eq(files.relatedEntityType, "todo"), inArray(files.relatedEntityId, sourceTodos.map(t => t.id)))) : [],
      taskHistory: sourceTasks.length ? await db.select().from(taskStatusHistory).where(inArray(taskStatusHistory.taskId, sourceTasks.map(t => t.id))) : [],
      photos: await db.select().from(photos).where(eq(photos.projectId, sourceId)),
      photoAlbums: await db.select().from(photoAlbums).where(eq(photoAlbums.projectId, sourceId)),
      dailyReports: reports,
      reportTaskEntries: reportEntries,
      reportLabor: entryIds.length ? await db.select().from(dailyReportLaborLines).where(inArray(dailyReportLaborLines.taskEntryId, entryIds)) : [],
      reportEquipment: entryIds.length ? await db.select().from(dailyReportEquipmentLines).where(inArray(dailyReportEquipmentLines.taskEntryId, entryIds)) : [],
      reportDeliveries: reportIds.length ? await db.select().from(dailyReportDeliveryEntries).where(inArray(dailyReportDeliveryEntries.reportId, reportIds)) : [],
      reportInspections: reportIds.length ? await db.select().from(dailyReportInspectionEntries).where(inArray(dailyReportInspectionEntries.reportId, reportIds)) : [],
      reportPhotos: reportIds.length ? await db.select().from(dailyReportPhotos).where(or(inArray(dailyReportPhotos.reportId, reportIds), entryIds.length ? inArray(dailyReportPhotos.taskEntryId, entryIds) : undefined)) : [],
      emails,
      emailAttachments: emails.length ? await db.select().from(projectEmailAttachments).where(inArray(projectEmailAttachments.emailId, emails.map(e => e.id))) : [],
      rfis: rfisRows,
      rfiResponses: rfisRows.length ? await db.select().from(rfiResponses).where(inArray(rfiResponses.rfiId, rfisRows.map(r => r.id))) : [],
      scheduleEntries: await db.select().from(scheduleEntries).where(eq(scheduleEntries.projectId, sourceId)),
      allocations: await db.select().from(allocations).where(eq(allocations.projectId, sourceId)),
      fingercheckMappings: await db.select().from(fingercheckProjectMappings).where(eq(fingercheckProjectMappings.projectId, sourceId)),
      reportRecipients: await db.select().from(projectDailyReportRecipients).where(eq(projectDailyReportRecipients.projectId, sourceId)),
      // Only the current user's notifications are appropriate to expose.
      notifications: await db.select().from(notifications).where(and(eq(notifications.projectId, sourceId), eq(notifications.userId, user!.id))),
    };
    res.json({
      project: sourceProject,
      retainedWork,
      contacts: contactRows,
      todos: sourceTodos,
      statusHistory: await db.select().from(projectStatusHistory).where(eq(projectStatusHistory.projectId, sourceId)),
      activity: await db.select().from(activityLogs).where(eq(activityLogs.projectId, sourceId)).orderBy(asc(activityLogs.createdAt)),
      tasks: sourceTasks,
      communications: await db.select().from(communications).where(eq(communications.projectId, sourceId)),
      // Remaining tombstones/legacy records are history only, not new live docs.
      files: sourceFiles,
      folders: sourceFolders,
    });
  }));
}
