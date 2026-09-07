import {
  projects, tasks, equipment, allocations, folders, files, photos, users, customers, contacts, projectContacts, dailyReports, maintenanceLogs, communications, taskStatusHistory, photoAlbums,
  reportTasks, laborEntries, equipmentEntries, reportTaskPhotos, deliveries, deliveryPhotos,
  dailyReportTaskEntries, dailyReportLaborLines, dailyReportEquipmentLines, dailyReportDeliveryEntries, dailyReportInspectionEntries, dailyReportPhotos,
  authorizedUsers, scheduleEntries, taskTitles,
  projectEmailConnections, projectEmails, projectEmailAttachments,
  fingercheckEmployees, fingercheckTimePunches, fingercheckProjectMappings,
  rfis, rfiResponses, userOutlookConnections, projectDailyReportRecipients, companyFolders, companyFiles,
  payApplications, payApplicationItems,
  todos, todoUpdates, workflowRules, workflowExecutions, notifications, activityLogs, projectStatusHistory,
  opportunities, opportunityContacts, opportunityStatusHistory,
  type Opportunity, type InsertOpportunity, type OpportunityWithDetails, type OpportunityDashboardResult,
  type OpportunityContact, type InsertOpportunityContact, type OpportunityContactWithDetails,
  type OpportunityStatusHistory, type InsertOpportunityStatusHistory,
  type InsertProject, type InsertTask, type InsertEquipment, type InsertAllocation, type InsertFolder, type InsertFileMetadata, type InsertPhoto,
  type InsertCustomer, type Contact, type InsertContact, type ProjectContact, type InsertProjectContact, type InsertDailyReport, type InsertMaintenanceLog, type InsertCommunication, type InsertTaskStatusHistory, type InsertPhotoAlbum,
  type InsertReportTask, type InsertLaborEntry, type InsertEquipmentEntry, type InsertReportTaskPhoto, type InsertDelivery, type InsertDeliveryPhoto,
  type InsertDailyReportTaskEntry, type InsertDailyReportLaborLine, type InsertDailyReportEquipmentLine, type InsertDailyReportDeliveryEntry, type InsertDailyReportInspectionEntry, type InsertDailyReportPhoto,
  type InsertAuthorizedUser, type InsertScheduleEntry,
  type InsertProjectEmailConnection, type InsertProjectEmail, type InsertProjectEmailAttachment,
  type InsertFingercheckEmployee, type InsertFingercheckTimePunch, type InsertFingercheckProjectMapping,
  type InsertRfi, type InsertRfiResponse, type InsertProjectDailyReportRecipient, type InsertCompanyFolder, type InsertCompanyFile,
  type InsertPayApplication, type InsertPayApplicationItem, type InsertTaskTitle,
  type InsertTodo, type InsertTodoUpdate, type InsertWorkflowRule, type InsertWorkflowExecution, type InsertNotification, type InsertActivityLog, type InsertProjectStatusHistory,
  type Todo, type TodoWithDetails, type TodoUpdate, type TodoUpdateWithAuthor, type MyWorkSummary, type WorkflowRule, type WorkflowRuleWithDetails, type WorkflowExecution,
  type Notification, type ActivityLog, type ProjectStatusHistory,
  type Project, type Task, type Equipment, type Allocation, type Folder, type FileMetadata, type Photo,
  type Customer, type DailyReport, type MaintenanceLog, type Communication, type TaskStatusHistory, type PhotoAlbum,
  type ReportTask, type LaborEntry, type EquipmentEntry, type ReportTaskPhoto, type Delivery, type DeliveryPhoto,
  type DailyReportTaskEntry, type DailyReportLaborLine, type DailyReportEquipmentLine, type DailyReportDeliveryEntry, type DailyReportInspectionEntry, type DailyReportPhoto,
  type ProjectEmailConnection, type ProjectEmail, type ProjectEmailAttachment,
  type FingercheckEmployee, type FingercheckTimePunch, type FingercheckProjectMapping,
  type Rfi, type RfiResponse, type UserOutlookConnection, type ProjectDailyReportRecipient, type CompanyFolder, type CompanyFile,
  type PayApplication, type PayApplicationItem, type TaskTitle,
  type ScheduleEntry,
  type User, type UpsertUser, type AuthorizedUser
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, asc, and, or, isNull, isNotNull, sql, lt, gt, gte, lte, ne, ilike, inArray, notInArray, aliasedTable } from "drizzle-orm";
import {
  OPPORTUNITY_DEADLINE_ELIGIBLE_STATUSES,
  OPPORTUNITY_OUTCOME_STATUSES,
} from "@shared/opportunityStatus";

const PROJECT_EMAIL_DOMAIN = "updates.sitetechnj.com";

function generateProjectEmailSlug(name: string, id: number): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 30);
  return `${slug}-${id}@${PROJECT_EMAIL_DOMAIN}`;
}

export interface IStorage {
  // Auth
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  
  // Authorized Users
  getAuthorizedUsers(): Promise<AuthorizedUser[]>;
  getAuthorizedUserByEmail(email: string): Promise<AuthorizedUser | undefined>;
  createAuthorizedUser(user: InsertAuthorizedUser): Promise<AuthorizedUser>;
  updateAuthorizedUser(id: string, updates: Partial<InsertAuthorizedUser>): Promise<AuthorizedUser | undefined>;
  deleteAuthorizedUser(id: string): Promise<void>;

  // Customers
  getCustomers(): Promise<Customer[]>;
  listCustomers(options?: { status?: string; search?: string }): Promise<CustomerListItem[]>;
  getCustomer(id: number): Promise<Customer | undefined>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(id: number, customer: Partial<InsertCustomer>): Promise<Customer>;
  deleteCustomer(id: number): Promise<void>;
  getCustomerDependencyCounts(id: number): Promise<{ projects: number; communications: number }>;
  findSimilarCustomers(name: string, excludeId?: number): Promise<Customer[]>;

  // Contacts
  getContacts(customerId: number): Promise<Contact[]>;
  getContact(id: number): Promise<Contact | undefined>;
  createContact(contact: InsertContact): Promise<Contact>;
  updateContact(id: number, contact: Partial<InsertContact>): Promise<Contact>;
  deleteContact(id: number): Promise<void>;
  contactCommunicationCount(contactId: number): Promise<number>;
  contactProjectLinkCount(contactId: number): Promise<number>;
  findContactsByEmail(customerId: number, email: string, excludeId?: number): Promise<Contact[]>;

  // Project Contacts
  getProjectContacts(projectId: number): Promise<ProjectContactWithContact[]>;
  getProjectContact(id: number): Promise<ProjectContact | undefined>;
  findProjectContact(projectId: number, contactId: number): Promise<ProjectContact | undefined>;
  createProjectContact(link: InsertProjectContact): Promise<ProjectContact>;
  updateProjectContact(id: number, updates: { roleLabel?: string | null }): Promise<ProjectContact>;
  deleteProjectContact(id: number): Promise<void>;

  // Task Titles
  getTaskTitles(): Promise<TaskTitle[]>;
  createTaskTitle(title: InsertTaskTitle): Promise<TaskTitle>;
  deleteTaskTitle(id: number): Promise<void>;

  // Projects
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  getProjectsByCustomer(customerId: number): Promise<Project[]>;
  getNextProjectNumber(): Promise<string>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, project: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: number): Promise<void>;
  getProjectByEmail(email: string): Promise<Project | undefined>;
  backfillProjectEmails(): Promise<{ id: number; name: string; projectEmail: string }[]>;

  // Tasks
  getTasks(projectId?: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task>;
  deleteTask(id: number): Promise<void>;

  // Billing
  getCompletedTasksForBilling(): Promise<(Task & { projectName: string })[]>;
  markTaskBilled(taskId: number, billedBy: string): Promise<Task>;
  markTaskUnbilled(taskId: number): Promise<Task>;
  bulkMarkTasksBilled(taskIds: number[], billedBy: string): Promise<void>;

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
  getOpportunityCommunications(opportunityId: number): Promise<Communication[]>;
  createCommunication(comm: InsertCommunication): Promise<Communication>;
  deleteCommunication(id: number): Promise<void>;

  // Schedule Entries
  getScheduleEntries(): Promise<ScheduleEntry[]>;
  getScheduleEntry(id: number): Promise<ScheduleEntry | undefined>;
  createScheduleEntry(entry: InsertScheduleEntry): Promise<ScheduleEntry>;
  updateScheduleEntry(id: number, entry: Partial<InsertScheduleEntry>): Promise<ScheduleEntry>;
  deleteScheduleEntry(id: number): Promise<void>;

  // Allocations
  getAllocations(): Promise<Allocation[]>;
  getAllocationsByScheduleEntry(scheduleEntryId: number): Promise<Allocation[]>;
  createAllocation(allocation: InsertAllocation): Promise<Allocation>;
  updateAllocation(id: number, allocation: Partial<InsertAllocation>): Promise<Allocation>;
  deleteAllocation(id: number): Promise<void>;

  // Folders & Files
  getFolders(projectId: number): Promise<Folder[]>;
  getFolder(id: number): Promise<Folder | undefined>;
  getChildFolders(projectId: number, parentId: number | null): Promise<Folder[]>;
  getFolderPath(folderId: number): Promise<Array<{ id: number; name: string }>>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  updateFolder(id: number, folder: Partial<InsertFolder>): Promise<Folder>;
  deleteFolder(id: number): Promise<void>;

  getFiles(projectId: number): Promise<FileMetadata[]>;
  getFile(id: number): Promise<FileMetadata | undefined>;
  createFile(file: InsertFileMetadata): Promise<FileMetadata>;
  updateFile(id: number, file: Partial<InsertFileMetadata>): Promise<FileMetadata>;
  deleteFile(id: number): Promise<void>;
  batchDeleteFiles(ids: number[]): Promise<void>;
  batchMoveFiles(ids: number[], folderId: number | null): Promise<void>;

  // Photo Albums
  getPhotoAlbums(projectId: number): Promise<PhotoAlbum[]>;
  getPhotoAlbum(id: number): Promise<PhotoAlbum | undefined>;
  getPhotoAlbumByName(projectId: number, name: string): Promise<PhotoAlbum | undefined>;
  getOrCreateGeneralAlbum(projectId: number): Promise<PhotoAlbum>;
  getOrCreateDailyReportAlbum(projectId: number): Promise<PhotoAlbum>;
  ensureDefaultAlbums(projectId: number): Promise<{ general: PhotoAlbum; dailyReport: PhotoAlbum }>;
  createPhotoAlbum(album: InsertPhotoAlbum): Promise<PhotoAlbum>;
  updatePhotoAlbum(id: number, album: Partial<InsertPhotoAlbum>): Promise<PhotoAlbum>;
  deletePhotoAlbum(id: number): Promise<void>;

  // Photos (separate from files/documents)
  getPhotos(projectId: number): Promise<Photo[]>;
  getPhotosPaginated(projectId: number, options: { cursor?: string; limit?: number; albumId?: number | null }): Promise<{ photos: Photo[]; nextCursor: string | null; totalCount: number; hasMore: boolean }>;
  getPhoto(id: number): Promise<Photo | undefined>;
  createPhoto(photo: InsertPhoto): Promise<Photo>;
  updatePhoto(id: number, photo: Partial<InsertPhoto>): Promise<Photo>;
  deletePhoto(id: number): Promise<void>;
  getPhotosCount(projectId: number, albumId?: number | null): Promise<number>;

  // New Daily Report Task Entries
  getDailyReportTaskEntries(reportId: number): Promise<DailyReportTaskEntry[]>;
  getDailyReportTaskEntry(id: number): Promise<DailyReportTaskEntry | undefined>;
  createDailyReportTaskEntry(entry: InsertDailyReportTaskEntry): Promise<DailyReportTaskEntry>;
  updateDailyReportTaskEntry(id: number, entry: Partial<InsertDailyReportTaskEntry>): Promise<DailyReportTaskEntry>;
  deleteDailyReportTaskEntry(id: number): Promise<void>;
  
  // Snapshot validation helpers
  getLatestDailyReportForProject(projectId: number): Promise<DailyReport | undefined>;
  getTaskSnapshotBounds(projectId: number, taskId: number, currentReportId: number, currentReportDate: Date): Promise<{ prevSnapshot: number; nextSnapshot: number }>;

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

  // New Daily Report Inspection Entries
  getDailyReportInspectionEntries(reportId: number): Promise<DailyReportInspectionEntry[]>;
  getDailyReportInspectionEntry(id: number): Promise<DailyReportInspectionEntry | undefined>;
  createDailyReportInspectionEntry(entry: InsertDailyReportInspectionEntry): Promise<DailyReportInspectionEntry>;
  updateDailyReportInspectionEntry(id: number, entry: Partial<InsertDailyReportInspectionEntry>): Promise<DailyReportInspectionEntry>;
  deleteDailyReportInspectionEntry(id: number): Promise<void>;

  // New Daily Report Photos
  getDailyReportPhotos(reportId?: number, taskEntryId?: number, deliveryEntryId?: number, inspectionEntryId?: number): Promise<DailyReportPhoto[]>;
  getReportLevelPhotos(reportId: number): Promise<DailyReportPhoto[]>;
  createDailyReportPhoto(photo: InsertDailyReportPhoto): Promise<DailyReportPhoto>;
  deleteDailyReportPhoto(id: number): Promise<void>;

  // Project Email Connections
  getProjectEmailConnection(projectId: number): Promise<ProjectEmailConnection | undefined>;
  createProjectEmailConnection(conn: InsertProjectEmailConnection): Promise<ProjectEmailConnection>;
  updateProjectEmailConnection(id: number, updates: Partial<InsertProjectEmailConnection>): Promise<ProjectEmailConnection>;
  deleteProjectEmailConnection(projectId: number): Promise<void>;

  // Project Emails
  getProjectEmails(projectId: number, options?: { isInternal?: boolean; search?: string; limit?: number; offset?: number }): Promise<ProjectEmail[]>;
  getProjectEmail(id: number): Promise<ProjectEmail | undefined>;
  getProjectEmailByOutlookId(projectId: number, outlookMessageId: string): Promise<ProjectEmail | undefined>;
  createProjectEmail(email: InsertProjectEmail): Promise<ProjectEmail>;
  getProjectEmailsCount(projectId: number, isInternal?: boolean, search?: string): Promise<number>;

  // Project Email Attachments
  getProjectEmailAttachments(emailId: number): Promise<ProjectEmailAttachment[]>;
  createProjectEmailAttachment(att: InsertProjectEmailAttachment): Promise<ProjectEmailAttachment>;

  // Fingercheck Employees
  getFingercheckEmployees(): Promise<FingercheckEmployee[]>;
  getFingercheckEmployee(id: number): Promise<FingercheckEmployee | undefined>;
  getFingercheckEmployeeByEmployeeId(employeeId: number): Promise<FingercheckEmployee | undefined>;
  upsertFingercheckEmployee(employee: InsertFingercheckEmployee): Promise<FingercheckEmployee>;
  deleteFingercheckEmployee(id: number): Promise<void>;

  // Fingercheck Time Punches
  getTimePunches(filters?: { employeeId?: number; startDate?: string; endDate?: string; jobCode?: string }): Promise<FingercheckTimePunch[]>;
  upsertTimePunch(punch: InsertFingercheckTimePunch): Promise<FingercheckTimePunch>;
  deleteTimePunchesByDateRange(startDate: string, endDate: string): Promise<void>;

  // Fingercheck Project Mappings
  getProjectMappings(): Promise<FingercheckProjectMapping[]>;
  getProjectMappingsByProjectId(projectId: number): Promise<FingercheckProjectMapping[]>;
  getProjectMappingByJobCode(jobCode: string): Promise<FingercheckProjectMapping | undefined>;
  createProjectMapping(mapping: InsertFingercheckProjectMapping): Promise<FingercheckProjectMapping>;
  deleteProjectMapping(id: number): Promise<void>;

  // RFIs
  getRfis(projectId: number): Promise<Rfi[]>;
  getRfi(id: number): Promise<Rfi | undefined>;
  getNextRfiNumber(projectId: number): Promise<number>;
  createRfi(rfi: InsertRfi): Promise<Rfi>;
  updateRfi(id: number, rfi: Partial<InsertRfi>): Promise<Rfi>;
  deleteRfi(id: number): Promise<void>;

  // RFI Responses
  getRfiResponses(rfiId: number): Promise<RfiResponse[]>;
  getRfiResponseByOutlookId(outlookMessageId: string): Promise<RfiResponse | undefined>;
  createRfiResponse(response: InsertRfiResponse): Promise<RfiResponse>;

  // User Outlook Connections
  getUserOutlookConnection(userId: string): Promise<UserOutlookConnection | undefined>;
  upsertUserOutlookConnection(data: { userId: string; email: string; accessToken: string; refreshToken: string; expiresAt: Date }): Promise<UserOutlookConnection>;
  deleteUserOutlookConnection(userId: string): Promise<void>;

  // Project Daily Report Recipients
  getProjectDailyReportRecipients(projectId: number): Promise<ProjectDailyReportRecipient[]>;
  createProjectDailyReportRecipient(recipient: InsertProjectDailyReportRecipient): Promise<ProjectDailyReportRecipient>;
  deleteProjectDailyReportRecipient(id: number): Promise<void>;

  // Company Folders & Files
  getCompanyFolders(): Promise<CompanyFolder[]>;
  getCompanyFolder(id: number): Promise<CompanyFolder | undefined>;
  getCompanyChildFolders(parentId: number | null): Promise<CompanyFolder[]>;
  getCompanyFolderPath(folderId: number): Promise<Array<{ id: number; name: string }>>;
  createCompanyFolder(folder: InsertCompanyFolder): Promise<CompanyFolder>;
  updateCompanyFolder(id: number, folder: Partial<InsertCompanyFolder>): Promise<CompanyFolder>;
  deleteCompanyFolder(id: number): Promise<void>;

  getCompanyFiles(): Promise<CompanyFile[]>;
  getCompanyFile(id: number): Promise<CompanyFile | undefined>;
  createCompanyFile(file: InsertCompanyFile): Promise<CompanyFile>;
  updateCompanyFile(id: number, file: Partial<InsertCompanyFile>): Promise<CompanyFile>;
  deleteCompanyFile(id: number): Promise<void>;
  batchDeleteCompanyFiles(ids: number[]): Promise<void>;
  batchMoveCompanyFiles(ids: number[], folderId: number | null): Promise<void>;

  // Pay Applications (G702 Progress Billing)
  getPayApplications(projectId: number): Promise<PayApplication[]>;
  getPayApplication(id: number): Promise<PayApplication | undefined>;
  getNextPayApplicationNumber(projectId: number): Promise<number>;
  createPayApplication(app: InsertPayApplication): Promise<PayApplication>;
  updatePayApplication(id: number, app: Partial<InsertPayApplication>): Promise<PayApplication>;
  deletePayApplication(id: number): Promise<void>;

  // Pay Application Items (G703 line items)
  getPayApplicationItems(payApplicationId: number): Promise<PayApplicationItem[]>;
  createPayApplicationItem(item: InsertPayApplicationItem): Promise<PayApplicationItem>;
  updatePayApplicationItem(id: number, item: Partial<InsertPayApplicationItem>): Promise<PayApplicationItem>;
  deletePayApplicationItem(id: number): Promise<void>;
  bulkUpsertPayApplicationItems(payApplicationId: number, items: InsertPayApplicationItem[]): Promise<PayApplicationItem[]>;

  // Projects (status transition detection)
  updateProjectWithStatusTracking(id: number, updates: Partial<InsertProject>): Promise<{ project: Project; previousStatus: string | null }>;

  // Todos
  getTodos(filters: TodoFilters): Promise<TodoWithDetails[]>;
  getTodo(id: number): Promise<TodoWithDetails | undefined>;
  createTodo(todo: InsertTodo): Promise<Todo>;
  updateTodo(id: number, updates: Partial<InsertTodo>): Promise<Todo>;
  completeTodo(id: number, userId: string): Promise<Todo>;
  deleteTodo(id: number): Promise<void>;
  getMyWorkSummary(userId: string, today: string): Promise<MyWorkSummary>;
  getTodosNeedingDueReminder(today: string): Promise<(Todo & { reminderType: "due_today" | "overdue" })[]>;
  createReminderNotificationIfAbsent(notification: InsertNotification): Promise<Notification | undefined>;

  // Todo Updates (notes / progress timeline)
  getTodoUpdates(todoId: number, opts?: { limit?: number; offset?: number }): Promise<TodoUpdateWithAuthor[]>;
  countTodoUpdates(todoId: number): Promise<number>;
  getTodoUpdate(id: number): Promise<TodoUpdate | undefined>;
  createTodoUpdate(update: InsertTodoUpdate): Promise<TodoUpdate>;
  updateTodoUpdateBody(id: number, body: string): Promise<TodoUpdate>;
  softDeleteTodoUpdate(id: number): Promise<void>;

  // Workflow Rules
  getWorkflowRules(): Promise<WorkflowRuleWithDetails[]>;
  getWorkflowRule(id: number): Promise<WorkflowRule | undefined>;
  getActiveWorkflowRulesForStatus(triggerStatus: string, triggerType?: string): Promise<WorkflowRule[]>;
  createWorkflowRule(rule: InsertWorkflowRule & { createdByUserId?: string | null }): Promise<WorkflowRule>;
  updateWorkflowRule(id: number, updates: Partial<InsertWorkflowRule>): Promise<WorkflowRule>;
  deleteWorkflowRule(id: number): Promise<void>;

  // Workflow Executions (idempotency + audit)
  claimWorkflowExecution(execution: InsertWorkflowExecution): Promise<WorkflowExecution | undefined>;
  updateWorkflowExecution(id: number, updates: Partial<InsertWorkflowExecution>): Promise<WorkflowExecution>;

  // Project Status History
  createProjectStatusHistory(history: InsertProjectStatusHistory): Promise<ProjectStatusHistory>;
  getProjectStatusHistory(projectId: number): Promise<ProjectStatusHistory[]>;

  // Notifications
  getNotifications(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationRead(id: number, userId: string): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string): Promise<number>;

  // Activity Logs
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getProjectActivity(projectId: number, limit?: number): Promise<ActivityLog[]>;
  getCustomerActivity(customerId: number, limit?: number): Promise<ActivityLog[]>;
  getOpportunityActivity(opportunityId: number, limit?: number): Promise<ActivityLog[]>;

  // Opportunities (Phase 4 — RFP/bidding foundation)
  getOpportunities(filters?: OpportunityFilters): Promise<OpportunityWithDetails[]>;
  getOpportunityDashboard(filters?: OpportunityFilters): Promise<OpportunityDashboardResult>;
  getOpportunity(id: number): Promise<Opportunity | undefined>;
  getOpportunityWithDetails(id: number): Promise<OpportunityWithDetails | undefined>;
  getOpportunitiesByCustomer(customerId: number, includeArchived?: boolean): Promise<OpportunityWithDetails[]>;
  createOpportunity(opportunity: InsertOpportunity & { createdByUserId?: string | null }): Promise<Opportunity>;
  updateOpportunity(id: number, updates: Partial<InsertOpportunity>): Promise<Opportunity>;
  updateOpportunityWithStatusTracking(id: number, updates: Record<string, unknown> & { status: string }, changedBy: { userId: string | null; name: string | null }): Promise<{ opportunity: Opportunity; previousStatus: string | null; changed: boolean; history: OpportunityStatusHistory | null }>;

  // Opportunity Contacts
  getOpportunityContacts(opportunityId: number): Promise<OpportunityContactWithDetails[]>;
  getOpportunityContact(id: number): Promise<OpportunityContact | undefined>;
  findOpportunityContact(opportunityId: number, contactId: number): Promise<OpportunityContact | undefined>;
  createOpportunityContact(link: InsertOpportunityContact): Promise<OpportunityContact>;
  updateOpportunityContact(id: number, updates: { role?: string | null; isPrimary?: boolean }): Promise<OpportunityContact>;
  deleteOpportunityContact(id: number): Promise<void>;
  deleteOpportunityContactsForOpportunity(opportunityId: number): Promise<number>;

  // Opportunity Status History
  createOpportunityStatusHistory(history: InsertOpportunityStatusHistory): Promise<OpportunityStatusHistory>;
  getOpportunityStatusHistory(opportunityId: number): Promise<OpportunityStatusHistory[]>;
}

export interface OpportunityFilters {
  status?: string;
  statuses?: string[];
  customerId?: number;
  responsibleUserId?: string;
  unassigned?: boolean;
  createdByUserId?: string;
  source?: string[];
  projectType?: string[];
  bidDueFrom?: string;
  bidDueTo?: string;
  dateField?: "bidDueDate" | "rfpReceivedDate" | "estimatedStartDate" | "createdAt";
  dateFrom?: string;
  dateTo?: string;
  urgency?: string;
  outcome?: string[];
  archive?: "active" | "archived" | "all";
  today?: string;
  sortBy?: "name" | "opportunityNumber" | "customer" | "status" | "responsible" | "bidDueDate" | "expectedValue" | "createdAt" | "updatedAt" | "lastActivity";
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
  canViewValues?: boolean;
  includeArchived?: boolean; // default false — archived records are hidden from default views
  search?: string;
  limit?: number;
}

// Project contact link enriched with the full contact record
export type ProjectContactWithContact = ProjectContact & {
  contact: Contact;
};

// Customer list item enriched with primary contact and (when searching) why it matched
export type CustomerListItem = Customer & {
  primaryContact: Contact | null;
  matchReason: string | null;
};

export type TodoFilters = {
  assignedToUserId?: string;
  projectId?: number;
  opportunityId?: number;
  status?: string; // 'active' (open + in_progress), specific status, or 'all'
  priority?: string;
  due?: "overdue" | "today" | "this_week" | "next_7_days" | "no_due_date";
  today?: string; // client-local date YYYY-MM-DD used for due bucketing
  limit?: number;
};

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

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User> {
    const [user] = await db.update(users).set({ ...updates, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return user;
  }

  // Authorized Users
  async getAuthorizedUsers(): Promise<AuthorizedUser[]> {
    return await db.select().from(authorizedUsers).orderBy(desc(authorizedUsers.createdAt));
  }

  async getAuthorizedUserByEmail(email: string): Promise<AuthorizedUser | undefined> {
    const [authorized] = await db.select().from(authorizedUsers).where(eq(authorizedUsers.email, email.toLowerCase()));
    return authorized;
  }

  async createAuthorizedUser(user: InsertAuthorizedUser): Promise<AuthorizedUser> {
    const [authorized] = await db.insert(authorizedUsers).values({
      ...user,
      email: user.email.toLowerCase(),
    }).returning();
    return authorized;
  }

  async updateAuthorizedUser(id: string, updates: Partial<InsertAuthorizedUser>): Promise<AuthorizedUser | undefined> {
    const [updated] = await db.update(authorizedUsers)
      .set(updates)
      .where(eq(authorizedUsers.id, id))
      .returning();
    return updated;
  }

  async deleteAuthorizedUser(id: string): Promise<void> {
    await db.delete(authorizedUsers).where(eq(authorizedUsers.id, id));
  }

  // Customers (with soft delete)
  async getCustomers(): Promise<Customer[]> {
    return await db.select().from(customers).where(isNull(customers.deletedAt)).orderBy(customers.name);
  }
  async getCustomer(id: number): Promise<Customer | undefined> {
    const [customer] = await db.select().from(customers).where(and(eq(customers.id, id), isNull(customers.deletedAt)));
    return customer;
  }
  async createCustomer(insertCustomer: InsertCustomer): Promise<Customer> {
    const [customer] = await db.insert(customers).values(insertCustomer).returning();
    return customer;
  }
  async updateCustomer(id: number, updates: Partial<InsertCustomer>): Promise<Customer> {
    const [customer] = await db.update(customers).set({ ...updates, updatedAt: new Date() }).where(eq(customers.id, id)).returning();
    return customer;
  }

  async listCustomers(options?: { status?: string; search?: string }): Promise<CustomerListItem[]> {
    const status = options?.status || "active";
    const search = options?.search?.trim().toLowerCase() || "";

    const conditions = [isNull(customers.deletedAt)];
    if (status !== "all") {
      conditions.push(eq(customers.status, status));
    }
    const allCustomers = await db.select().from(customers).where(and(...conditions)).orderBy(customers.name);
    if (allCustomers.length === 0) return [];

    const customerIds = allCustomers.map((c) => c.id);
    const allContacts = await db.select().from(contacts).where(inArray(contacts.customerId, customerIds));
    const contactsByCustomer = new Map<number, Contact[]>();
    for (const ct of allContacts) {
      const list = contactsByCustomer.get(ct.customerId) || [];
      list.push(ct);
      contactsByCustomer.set(ct.customerId, list);
    }

    const results: CustomerListItem[] = [];
    for (const cu of allCustomers) {
      const ctList = contactsByCustomer.get(cu.id) || [];
      const primaryContact = ctList.find((c) => c.isPrimary && c.isActive) || ctList.find((c) => c.isPrimary) || null;

      let matchReason: string | null = null;
      if (search) {
        const has = (v: string | null | undefined) => !!v && v.toLowerCase().includes(search);
        if (has(cu.name)) matchReason = null; // direct company match needs no explanation
        else if (has(cu.email)) matchReason = `Company email: ${cu.email}`;
        else if (has(cu.phone)) matchReason = `Company phone: ${cu.phone}`;
        else if (has([cu.address, cu.address2, cu.city, cu.state, cu.zip].filter(Boolean).join(" "))) {
          matchReason = `Address: ${[cu.address, cu.city, cu.state].filter(Boolean).join(", ")}`;
        } else {
          const matched = ctList.find((c) => {
            const fullName = `${c.firstName} ${c.lastName || ""}`.trim();
            return has(fullName) || has(c.email) || has(c.officePhone) || has(c.mobilePhone);
          });
          if (matched) {
            const fullName = `${matched.firstName} ${matched.lastName || ""}`.trim();
            matchReason = `Contact: ${fullName}`;
          } else {
            continue; // no match at all - exclude from results
          }
        }
      }
      results.push({ ...cu, primaryContact, matchReason });
    }
    return results;
  }

  async getCustomerDependencyCounts(id: number): Promise<{ projects: number; communications: number }> {
    const [projRow] = await db.select({ count: sql<number>`count(*)::int` }).from(projects)
      .where(and(eq(projects.customerId, id), isNull(projects.deletedAt)));
    // Soft-deleted communications are still historical records that may
    // reference this customer's contacts, so they count as dependencies for
    // hard-delete purposes.
    const [commRow] = await db.select({ count: sql<number>`count(*)::int` }).from(communications)
      .where(eq(communications.customerId, id));
    return { projects: projRow?.count ?? 0, communications: commRow?.count ?? 0 };
  }

  async findSimilarCustomers(name: string, excludeId?: number): Promise<Customer[]> {
    const normalize = (s: string) => s.toLowerCase().replace(/\b(llc|inc|corp|co|ltd|company|construction)\b/g, "").replace(/[^a-z0-9]/g, "");
    const target = normalize(name);
    if (!target) return [];
    const all = await db.select().from(customers).where(isNull(customers.deletedAt));
    return all.filter((c) => {
      if (excludeId && c.id === excludeId) return false;
      const existing = normalize(c.name);
      if (!existing) return false;
      return existing === target || existing.includes(target) || target.includes(existing);
    });
  }

  // Contacts
  async getContacts(customerId: number): Promise<Contact[]> {
    return await db.select().from(contacts).where(eq(contacts.customerId, customerId))
      .orderBy(desc(contacts.isPrimary), contacts.firstName);
  }
  async getContact(id: number): Promise<Contact | undefined> {
    const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
    return contact;
  }
  async createContact(insertContact: InsertContact): Promise<Contact> {
    return await db.transaction(async (tx) => {
      if (insertContact.isPrimary) {
        await tx.update(contacts).set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(contacts.customerId, insertContact.customerId), eq(contacts.isPrimary, true)));
      }
      const [contact] = await tx.insert(contacts).values(insertContact).returning();
      return contact;
    });
  }
  async updateContact(id: number, updates: Partial<InsertContact>): Promise<Contact> {
    return await db.transaction(async (tx) => {
      if (updates.isPrimary) {
        const [existing] = await tx.select().from(contacts).where(eq(contacts.id, id));
        if (existing) {
          await tx.update(contacts).set({ isPrimary: false, updatedAt: new Date() })
            .where(and(eq(contacts.customerId, existing.customerId), eq(contacts.isPrimary, true), ne(contacts.id, id)));
        }
      }
      // Deactivating a contact always clears primary status: an inactive
      // contact cannot be the primary.
      const effective = updates.isActive === false ? { ...updates, isPrimary: false } : updates;
      const [contact] = await tx.update(contacts).set({ ...effective, updatedAt: new Date() }).where(eq(contacts.id, id)).returning();
      return contact;
    });
  }
  async deleteContact(id: number): Promise<void> {
    await db.delete(contacts).where(eq(contacts.id, id));
  }
  async contactCommunicationCount(contactId: number): Promise<number> {
    // Includes soft-deleted communications: they remain historical references
    // to the contact, so the contact must not be hard-deleted.
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(communications)
      .where(eq(communications.contactId, contactId));
    return row?.count ?? 0;
  }
  async contactProjectLinkCount(contactId: number): Promise<number> {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(projectContacts)
      .where(eq(projectContacts.contactId, contactId));
    return row?.count ?? 0;
  }
  async findContactsByEmail(customerId: number, email: string, excludeId?: number): Promise<Contact[]> {
    const conditions = [
      eq(contacts.customerId, customerId),
      sql`lower(${contacts.email}) = lower(${email})`,
    ];
    if (excludeId) conditions.push(ne(contacts.id, excludeId));
    return await db.select().from(contacts).where(and(...conditions));
  }
  // Project Contacts
  async getProjectContacts(projectId: number): Promise<ProjectContactWithContact[]> {
    const rows = await db.select({ link: projectContacts, contact: contacts })
      .from(projectContacts)
      .innerJoin(contacts, eq(projectContacts.contactId, contacts.id))
      .where(eq(projectContacts.projectId, projectId))
      .orderBy(desc(contacts.isPrimary), contacts.firstName);
    return rows.map(r => ({ ...r.link, contact: r.contact }));
  }
  async getProjectContact(id: number): Promise<ProjectContact | undefined> {
    const [row] = await db.select().from(projectContacts).where(eq(projectContacts.id, id));
    return row;
  }
  async findProjectContact(projectId: number, contactId: number): Promise<ProjectContact | undefined> {
    const [row] = await db.select().from(projectContacts)
      .where(and(eq(projectContacts.projectId, projectId), eq(projectContacts.contactId, contactId)));
    return row;
  }
  async createProjectContact(link: InsertProjectContact): Promise<ProjectContact> {
    const [row] = await db.insert(projectContacts).values(link).returning();
    return row;
  }
  async updateProjectContact(id: number, updates: { roleLabel?: string | null }): Promise<ProjectContact> {
    const [row] = await db.update(projectContacts).set(updates).where(eq(projectContacts.id, id)).returning();
    return row;
  }
  async deleteProjectContact(id: number): Promise<void> {
    await db.delete(projectContacts).where(eq(projectContacts.id, id));
  }

  async getTaskTitles(): Promise<TaskTitle[]> {
    return await db.select().from(taskTitles).where(isNull(taskTitles.deletedAt)).orderBy(taskTitles.name);
  }

  async createTaskTitle(insertTitle: InsertTaskTitle): Promise<TaskTitle> {
    const name = insertTitle.name.trim();
    const [existing] = await db.select().from(taskTitles).where(sql`lower(${taskTitles.name}) = lower(${name})`);
    if (existing) {
      if (existing.deletedAt) {
        const [restored] = await db.update(taskTitles).set({ deletedAt: null }).where(eq(taskTitles.id, existing.id)).returning();
        return restored;
      }
      return existing;
    }
    const [title] = await db.insert(taskTitles).values({ name }).returning();
    return title;
  }

  async deleteTaskTitle(id: number): Promise<void> {
    await db.update(taskTitles).set({ deletedAt: new Date() }).where(eq(taskTitles.id, id));
  }

  async deleteCustomer(id: number): Promise<void> {
    // Deletion is only allowed when the customer has no projects or
    // communications (enforced at the route), so its contacts have no history
    // either — remove them in the same transaction to avoid orphans.
    await db.transaction(async (tx) => {
      // Defensive: remove any project-contact links for this customer's
      // contacts so hard-deleting the contacts can't orphan link rows.
      await tx.delete(projectContacts).where(
        inArray(projectContacts.contactId, tx.select({ id: contacts.id }).from(contacts).where(eq(contacts.customerId, id)))
      );
      await tx.delete(contacts).where(eq(contacts.customerId, id));
      await tx.update(customers).set({ deletedAt: new Date() }).where(eq(customers.id, id));
    });
  }

  // Projects (with soft delete)
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).where(isNull(projects.deletedAt)).orderBy(desc(projects.createdAt));
  }
  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(and(eq(projects.id, id), isNull(projects.deletedAt)));
    return project;
  }
  async getProjectsByCustomer(customerId: number): Promise<Project[]> {
    return await db.select().from(projects).where(and(eq(projects.customerId, customerId), isNull(projects.deletedAt)));
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
    const projectNumber = await this.getNextProjectNumber();
    
    const [project] = await db.insert(projects).values({
      ...insertProject,
      projectNumber
    }).returning();
    
    const projectEmail = generateProjectEmailSlug(project.name, project.id);
    const [updated] = await db.update(projects)
      .set({ projectEmail })
      .where(eq(projects.id, project.id))
      .returning();
    
    await this.createDefaultFolders(project.id);
    
    return updated;
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
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, id));
  }

  async getProjectByEmail(email: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.projectEmail, email), isNull(projects.deletedAt)));
    return project;
  }

  async backfillProjectEmails(): Promise<{ id: number; name: string; projectEmail: string }[]> {
    const allProjects = await db.select().from(projects)
      .where(and(
        isNull(projects.deletedAt),
        or(
          isNull(projects.projectEmail),
          sql`${projects.projectEmail} = ''`,
          sql`${projects.projectEmail} NOT LIKE '%@${sql.raw(PROJECT_EMAIL_DOMAIN)}'`
        )
      ));

    const updated: { id: number; name: string; projectEmail: string }[] = [];

    for (const project of allProjects) {
      const email = generateProjectEmailSlug(project.name, project.id);
      await db.update(projects)
        .set({ projectEmail: email })
        .where(eq(projects.id, project.id));
      updated.push({ id: project.id, name: project.name, projectEmail: email });
    }

    return updated;
  }

  // Tasks (with soft delete)
  async getTasks(projectId?: number): Promise<Task[]> {
    if (projectId) {
      return await db.select().from(tasks).where(and(eq(tasks.projectId, projectId), isNull(tasks.deletedAt))).orderBy(tasks.scheduledDate);
    }
    return await db.select().from(tasks).where(isNull(tasks.deletedAt)).orderBy(tasks.scheduledDate);
  }
  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(and(eq(tasks.id, id), isNull(tasks.deletedAt)));
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
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, id));
  }

  // Billing
  async getCompletedTasksForBilling(): Promise<(Task & { projectName: string })[]> {
    const result = await db
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        title: tasks.title,
        description: tasks.description,
        scheduledDate: tasks.scheduledDate,
        dueDate: tasks.dueDate,
        status: tasks.status,
        priority: tasks.priority,
        percentComplete: tasks.percentComplete,
        estimatedHours: tasks.estimatedHours,
        scheduledValue: tasks.scheduledValue,
        assignedTo: tasks.assignedTo,
        completedAt: tasks.completedAt,
        billedAt: tasks.billedAt,
        billedBy: tasks.billedBy,
        createdAt: tasks.createdAt,
        deletedAt: tasks.deletedAt,
        projectName: projects.name,
      })
      .from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(
        and(
          eq(tasks.percentComplete, 100),
          isNull(tasks.deletedAt),
          isNull(projects.deletedAt)
        )
      )
      .orderBy(desc(tasks.completedAt));
    return result;
  }

  async markTaskBilled(taskId: number, billedBy: string): Promise<Task> {
    const [task] = await db.update(tasks).set({ billedAt: new Date(), billedBy }).where(eq(tasks.id, taskId)).returning();
    return task;
  }

  async markTaskUnbilled(taskId: number): Promise<Task> {
    const [task] = await db.update(tasks).set({ billedAt: null, billedBy: null }).where(eq(tasks.id, taskId)).returning();
    return task;
  }

  async bulkMarkTasksBilled(taskIds: number[], billedBy: string): Promise<void> {
    if (taskIds.length === 0) return;
    await db.update(tasks).set({ billedAt: new Date(), billedBy }).where(
      and(
        inArray(tasks.id, taskIds),
        isNull(tasks.billedAt)
      )
    );
  }

  // Task Status History
  async getTaskStatusHistory(taskId: number): Promise<TaskStatusHistory[]> {
    return db.select().from(taskStatusHistory).where(eq(taskStatusHistory.taskId, taskId)).orderBy(desc(taskStatusHistory.changedAt));
  }
  async createTaskStatusHistory(history: InsertTaskStatusHistory): Promise<TaskStatusHistory> {
    const [record] = await db.insert(taskStatusHistory).values(history).returning();
    return record;
  }

  // Equipment (with soft delete)
  async getEquipmentList(): Promise<Equipment[]> {
    return await db.select().from(equipment).where(isNull(equipment.deletedAt)).orderBy(equipment.type, equipment.name);
  }
  async getEquipment(id: number): Promise<Equipment | undefined> {
    const [item] = await db.select().from(equipment).where(and(eq(equipment.id, id), isNull(equipment.deletedAt)));
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
    await db.update(equipment).set({ deletedAt: new Date() }).where(eq(equipment.id, id));
  }

  // Maintenance Logs (with soft delete)
  async getMaintenanceLogs(equipmentId: number): Promise<MaintenanceLog[]> {
    return await db.select().from(maintenanceLogs).where(and(eq(maintenanceLogs.equipmentId, equipmentId), isNull(maintenanceLogs.deletedAt))).orderBy(desc(maintenanceLogs.performedDate));
  }
  async createMaintenanceLog(insertLog: InsertMaintenanceLog): Promise<MaintenanceLog> {
    const [log] = await db.insert(maintenanceLogs).values(insertLog).returning();
    return log;
  }
  async deleteMaintenanceLog(id: number): Promise<void> {
    await db.update(maintenanceLogs).set({ deletedAt: new Date() }).where(eq(maintenanceLogs.id, id));
  }

  // Daily Reports (with soft delete)
  async getDailyReports(projectId: number): Promise<DailyReport[]> {
    return await db.select().from(dailyReports).where(and(eq(dailyReports.projectId, projectId), isNull(dailyReports.deletedAt))).orderBy(desc(dailyReports.reportDate), desc(dailyReports.updatedAt));
  }
  async getDailyReport(id: number): Promise<DailyReport | undefined> {
    const [report] = await db.select().from(dailyReports).where(and(eq(dailyReports.id, id), isNull(dailyReports.deletedAt)));
    return report;
  }
  async getDailyReportByDate(projectId: number, reportDate: string): Promise<DailyReport | undefined> {
    const [report] = await db.select().from(dailyReports).where(
      and(eq(dailyReports.projectId, projectId), eq(dailyReports.reportDate, reportDate), isNull(dailyReports.deletedAt))
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
    await db.update(dailyReports).set({ deletedAt: new Date() }).where(eq(dailyReports.id, id));
  }

  // Report Tasks
  async getReportTasks(reportId: number): Promise<ReportTask[]> {
    return await db.select().from(reportTasks).where(eq(reportTasks.reportId, reportId)).orderBy(asc(reportTasks.id));
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
    return await db.select().from(laborEntries).where(eq(laborEntries.reportTaskId, reportTaskId)).orderBy(asc(laborEntries.id));
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
    return await db.select().from(equipmentEntries).where(eq(equipmentEntries.reportTaskId, reportTaskId)).orderBy(asc(equipmentEntries.id));
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
    return await db.select().from(reportTaskPhotos).where(eq(reportTaskPhotos.reportTaskId, reportTaskId)).orderBy(asc(reportTaskPhotos.id));
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
    return await db.select().from(deliveries).where(eq(deliveries.reportId, reportId)).orderBy(asc(deliveries.id));
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
    return await db.select().from(deliveryPhotos).where(eq(deliveryPhotos.deliveryId, deliveryId)).orderBy(asc(deliveryPhotos.id));
  }
  async createDeliveryPhoto(photo: InsertDeliveryPhoto): Promise<DeliveryPhoto> {
    const [record] = await db.insert(deliveryPhotos).values(photo).returning();
    return record;
  }
  async deleteDeliveryPhoto(id: number): Promise<void> {
    await db.delete(deliveryPhotos).where(eq(deliveryPhotos.id, id));
  }

  // Communications (with soft delete)
  async getCommunications(customerId: number): Promise<Communication[]> {
    return await db.select().from(communications).where(and(eq(communications.customerId, customerId), isNull(communications.deletedAt))).orderBy(desc(communications.contactDate));
  }
  async getOpportunityCommunications(opportunityId: number): Promise<Communication[]> {
    return db.select().from(communications)
      .where(and(eq(communications.opportunityId, opportunityId), isNull(communications.deletedAt)))
      .orderBy(desc(communications.contactDate), desc(communications.id));
  }
  async createCommunication(insertComm: InsertCommunication): Promise<Communication> {
    const [comm] = await db.insert(communications).values(insertComm).returning();
    return comm;
  }
  async deleteCommunication(id: number): Promise<void> {
    await db.update(communications).set({ deletedAt: new Date() }).where(eq(communications.id, id));
  }

  // Schedule Entries (with soft delete)
  async getScheduleEntries(): Promise<ScheduleEntry[]> {
    return await db.select().from(scheduleEntries).where(isNull(scheduleEntries.deletedAt)).orderBy(scheduleEntries.startDate);
  }
  async getScheduleEntry(id: number): Promise<ScheduleEntry | undefined> {
    const [entry] = await db.select().from(scheduleEntries).where(and(eq(scheduleEntries.id, id), isNull(scheduleEntries.deletedAt)));
    return entry;
  }
  async createScheduleEntry(entry: InsertScheduleEntry): Promise<ScheduleEntry> {
    const [created] = await db.insert(scheduleEntries).values(entry).returning();
    return created;
  }
  async updateScheduleEntry(id: number, updates: Partial<InsertScheduleEntry>): Promise<ScheduleEntry> {
    const [updated] = await db.update(scheduleEntries).set(updates).where(eq(scheduleEntries.id, id)).returning();
    return updated;
  }
  async deleteScheduleEntry(id: number): Promise<void> {
    await db.update(scheduleEntries).set({ deletedAt: new Date() }).where(eq(scheduleEntries.id, id));
  }

  // Allocations (with soft delete)
  async getAllocations(): Promise<Allocation[]> {
    return await db.select().from(allocations).where(isNull(allocations.deletedAt)).orderBy(allocations.startDate);
  }
  async getAllocationsByScheduleEntry(scheduleEntryId: number): Promise<Allocation[]> {
    return await db.select().from(allocations).where(and(eq(allocations.scheduleEntryId, scheduleEntryId), isNull(allocations.deletedAt)));
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
    await db.update(allocations).set({ deletedAt: new Date() }).where(eq(allocations.id, id));
  }

  // Folders (with soft delete)
  async getFolders(projectId: number): Promise<Folder[]> {
    return await db.select().from(folders).where(and(eq(folders.projectId, projectId), isNull(folders.deletedAt))).orderBy(asc(folders.id));
  }
  async getFolder(id: number): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(and(eq(folders.id, id), isNull(folders.deletedAt)));
    return folder;
  }
  async getChildFolders(projectId: number, parentId: number | null): Promise<Folder[]> {
    if (parentId === null) {
      return await db.select().from(folders).where(
        and(eq(folders.projectId, projectId), isNull(folders.parentId), isNull(folders.deletedAt))
      ).orderBy(asc(folders.id));
    }
    return await db.select().from(folders).where(
      and(eq(folders.projectId, projectId), eq(folders.parentId, parentId), isNull(folders.deletedAt))
    ).orderBy(asc(folders.id));
  }
  async getFolderPath(folderId: number): Promise<Array<{ id: number; name: string }>> {
    const path: Array<{ id: number; name: string }> = [];
    let currentId: number | null = folderId;
    
    while (currentId !== null) {
      const folder = await this.getFolder(currentId);
      if (!folder) break;
      path.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parentId;
    }
    
    return path;
  }
  async createFolder(insertFolder: InsertFolder): Promise<Folder> {
    const [folder] = await db.insert(folders).values(insertFolder).returning();
    return folder;
  }
  async updateFolder(id: number, updates: Partial<InsertFolder>): Promise<Folder> {
    const [folder] = await db.update(folders).set(updates).where(eq(folders.id, id)).returning();
    return folder;
  }
  async deleteFolder(id: number): Promise<void> {
    await db.update(folders).set({ deletedAt: new Date() }).where(eq(folders.id, id));
  }
  async batchDeleteFiles(ids: number[]): Promise<void> {
    for (const id of ids) {
      await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
    }
  }
  async batchMoveFiles(ids: number[], folderId: number | null): Promise<void> {
    for (const id of ids) {
      await db.update(files).set({ folderId }).where(eq(files.id, id));
    }
  }

  // Company Folders (with soft delete)
  async getCompanyFolders(): Promise<CompanyFolder[]> {
    return await db.select().from(companyFolders).where(isNull(companyFolders.deletedAt)).orderBy(asc(companyFolders.id));
  }
  async getCompanyFolder(id: number): Promise<CompanyFolder | undefined> {
    const [folder] = await db.select().from(companyFolders).where(and(eq(companyFolders.id, id), isNull(companyFolders.deletedAt)));
    return folder;
  }
  async getCompanyChildFolders(parentId: number | null): Promise<CompanyFolder[]> {
    if (parentId === null) {
      return await db.select().from(companyFolders).where(
        and(isNull(companyFolders.parentId), isNull(companyFolders.deletedAt))
      ).orderBy(asc(companyFolders.id));
    }
    return await db.select().from(companyFolders).where(
      and(eq(companyFolders.parentId, parentId), isNull(companyFolders.deletedAt))
    ).orderBy(asc(companyFolders.id));
  }
  async getCompanyFolderPath(folderId: number): Promise<Array<{ id: number; name: string }>> {
    const path: Array<{ id: number; name: string }> = [];
    let currentId: number | null = folderId;
    while (currentId !== null) {
      const folder = await this.getCompanyFolder(currentId);
      if (!folder) break;
      path.unshift({ id: folder.id, name: folder.name });
      currentId = folder.parentId;
    }
    return path;
  }
  async createCompanyFolder(insertFolder: InsertCompanyFolder): Promise<CompanyFolder> {
    const [folder] = await db.insert(companyFolders).values(insertFolder).returning();
    return folder;
  }
  async updateCompanyFolder(id: number, updates: Partial<InsertCompanyFolder>): Promise<CompanyFolder> {
    const [folder] = await db.update(companyFolders).set(updates).where(eq(companyFolders.id, id)).returning();
    return folder;
  }
  async deleteCompanyFolder(id: number): Promise<void> {
    await db.update(companyFolders).set({ deletedAt: new Date() }).where(eq(companyFolders.id, id));
  }

  // Company Files (with soft delete)
  async getCompanyFiles(): Promise<CompanyFile[]> {
    return await db.select().from(companyFiles).where(isNull(companyFiles.deletedAt)).orderBy(asc(companyFiles.id));
  }
  async getCompanyFile(id: number): Promise<CompanyFile | undefined> {
    const [file] = await db.select().from(companyFiles).where(and(eq(companyFiles.id, id), isNull(companyFiles.deletedAt)));
    return file;
  }
  async createCompanyFile(insertFile: InsertCompanyFile): Promise<CompanyFile> {
    const [file] = await db.insert(companyFiles).values(insertFile).returning();
    return file;
  }
  async updateCompanyFile(id: number, updates: Partial<InsertCompanyFile>): Promise<CompanyFile> {
    const [file] = await db.update(companyFiles).set(updates).where(eq(companyFiles.id, id)).returning();
    return file;
  }
  async deleteCompanyFile(id: number): Promise<void> {
    await db.update(companyFiles).set({ deletedAt: new Date() }).where(eq(companyFiles.id, id));
  }
  async batchDeleteCompanyFiles(ids: number[]): Promise<void> {
    for (const id of ids) {
      await db.update(companyFiles).set({ deletedAt: new Date() }).where(eq(companyFiles.id, id));
    }
  }
  async batchMoveCompanyFiles(ids: number[], folderId: number | null): Promise<void> {
    for (const id of ids) {
      await db.update(companyFiles).set({ folderId }).where(eq(companyFiles.id, id));
    }
  }

  // Files (with soft delete)
  async getFiles(projectId: number): Promise<FileMetadata[]> {
    return await db.select().from(files).where(and(eq(files.projectId, projectId), isNull(files.deletedAt))).orderBy(asc(files.id));
  }
  async getFile(id: number): Promise<FileMetadata | undefined> {
    const [file] = await db.select().from(files).where(and(eq(files.id, id), isNull(files.deletedAt)));
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
    await db.update(files).set({ deletedAt: new Date() }).where(eq(files.id, id));
  }

  // Photo Albums (with soft delete)
  async getPhotoAlbums(projectId: number): Promise<PhotoAlbum[]> {
    return await db.select().from(photoAlbums).where(and(eq(photoAlbums.projectId, projectId), isNull(photoAlbums.deletedAt))).orderBy(desc(photoAlbums.createdAt));
  }
  async getPhotoAlbum(id: number): Promise<PhotoAlbum | undefined> {
    const [album] = await db.select().from(photoAlbums).where(and(eq(photoAlbums.id, id), isNull(photoAlbums.deletedAt)));
    return album;
  }
  async getPhotoAlbumByName(projectId: number, name: string): Promise<PhotoAlbum | undefined> {
    const [album] = await db.select().from(photoAlbums)
      .where(and(eq(photoAlbums.projectId, projectId), eq(photoAlbums.name, name), isNull(photoAlbums.deletedAt)));
    return album;
  }
  async getOrCreateGeneralAlbum(projectId: number): Promise<PhotoAlbum> {
    const albumName = "General";
    let album = await this.getPhotoAlbumByName(projectId, albumName);
    if (!album) {
      album = await this.createPhotoAlbum({ projectId, name: albumName });
    }
    return album;
  }
  async getOrCreateDailyReportAlbum(projectId: number): Promise<PhotoAlbum> {
    const albumName = "Daily Report Photos";
    let album = await this.getPhotoAlbumByName(projectId, albumName);
    if (!album) {
      album = await this.createPhotoAlbum({ projectId, name: albumName });
    }
    return album;
  }
  async ensureDefaultAlbums(projectId: number): Promise<{ general: PhotoAlbum; dailyReport: PhotoAlbum }> {
    const general = await this.getOrCreateGeneralAlbum(projectId);
    const dailyReport = await this.getOrCreateDailyReportAlbum(projectId);
    return { general, dailyReport };
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
    await db.update(photoAlbums).set({ deletedAt: new Date() }).where(eq(photoAlbums.id, id));
  }

  // Photos (separate from files/documents)
  async getPhotos(projectId: number): Promise<Photo[]> {
    return await db.select().from(photos)
      .where(and(eq(photos.projectId, projectId), isNull(photos.deletedAt)))
      .orderBy(desc(photos.displayDate));
  }

  async getPhotosPaginated(projectId: number, options: { cursor?: string; limit?: number; albumId?: number | null }): Promise<{ photos: Photo[]; nextCursor: string | null; totalCount: number; hasMore: boolean }> {
    const limit = options.limit || 50;
    const conditions = [eq(photos.projectId, projectId), isNull(photos.deletedAt)];
    
    if (options.albumId !== undefined && options.albumId !== null) {
      conditions.push(eq(photos.albumId, options.albumId));
    }

    if (options.cursor) {
      const cursorDate = new Date(options.cursor);
      conditions.push(sql`${photos.displayDate} < ${cursorDate}`);
    }

    const results = await db.select().from(photos)
      .where(and(...conditions))
      .orderBy(desc(photos.displayDate))
      .limit(limit + 1);

    const hasMore = results.length > limit;
    const photosResult = hasMore ? results.slice(0, limit) : results;
    const nextCursor = hasMore && photosResult.length > 0 
      ? photosResult[photosResult.length - 1].displayDate?.toISOString() || null
      : null;

    const countConditions = [eq(photos.projectId, projectId), isNull(photos.deletedAt)];
    if (options.albumId !== undefined && options.albumId !== null) {
      countConditions.push(eq(photos.albumId, options.albumId));
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(photos).where(and(...countConditions));

    return {
      photos: photosResult,
      nextCursor,
      totalCount: Number(count),
      hasMore,
    };
  }

  async getPhoto(id: number): Promise<Photo | undefined> {
    const [photo] = await db.select().from(photos).where(and(eq(photos.id, id), isNull(photos.deletedAt)));
    return photo;
  }

  async createPhoto(photo: InsertPhoto): Promise<Photo> {
    const displayDate = photo.takenAt || new Date();
    const [record] = await db.insert(photos).values({ ...photo, displayDate }).returning();
    return record;
  }

  async updatePhoto(id: number, updates: Partial<InsertPhoto>): Promise<Photo> {
    const [record] = await db.update(photos).set(updates).where(eq(photos.id, id)).returning();
    return record;
  }

  async deletePhoto(id: number): Promise<void> {
    await db.update(photos).set({ deletedAt: new Date() }).where(eq(photos.id, id));
  }

  async getPhotosCount(projectId: number, albumId?: number | null): Promise<number> {
    const conditions = [eq(photos.projectId, projectId), isNull(photos.deletedAt)];
    if (albumId !== undefined && albumId !== null) {
      conditions.push(eq(photos.albumId, albumId));
    }
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(photos).where(and(...conditions));
    return Number(count);
  }

  // New Daily Report Task Entries (with soft delete)
  async getDailyReportTaskEntries(reportId: number): Promise<DailyReportTaskEntry[]> {
    return await db.select().from(dailyReportTaskEntries).where(and(eq(dailyReportTaskEntries.reportId, reportId), isNull(dailyReportTaskEntries.deletedAt))).orderBy(asc(dailyReportTaskEntries.id));
  }
  async getDailyReportTaskEntry(id: number): Promise<DailyReportTaskEntry | undefined> {
    const [entry] = await db.select().from(dailyReportTaskEntries).where(and(eq(dailyReportTaskEntries.id, id), isNull(dailyReportTaskEntries.deletedAt)));
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
    // Soft delete associated labor and equipment lines first
    await db.update(dailyReportLaborLines).set({ deletedAt: new Date() }).where(eq(dailyReportLaborLines.taskEntryId, id));
    await db.update(dailyReportEquipmentLines).set({ deletedAt: new Date() }).where(eq(dailyReportEquipmentLines.taskEntryId, id));
    await db.update(dailyReportPhotos).set({ deletedAt: new Date() }).where(eq(dailyReportPhotos.taskEntryId, id));
    await db.update(dailyReportTaskEntries).set({ deletedAt: new Date() }).where(eq(dailyReportTaskEntries.id, id));
  }

  // New Daily Report Labor Lines (with soft delete)
  async getDailyReportLaborLines(taskEntryId: number): Promise<DailyReportLaborLine[]> {
    return await db.select().from(dailyReportLaborLines).where(and(eq(dailyReportLaborLines.taskEntryId, taskEntryId), isNull(dailyReportLaborLines.deletedAt))).orderBy(asc(dailyReportLaborLines.id));
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
    await db.update(dailyReportLaborLines).set({ deletedAt: new Date() }).where(eq(dailyReportLaborLines.id, id));
  }

  // New Daily Report Equipment Lines (with soft delete)
  async getDailyReportEquipmentLines(taskEntryId: number): Promise<DailyReportEquipmentLine[]> {
    return await db.select().from(dailyReportEquipmentLines).where(and(eq(dailyReportEquipmentLines.taskEntryId, taskEntryId), isNull(dailyReportEquipmentLines.deletedAt))).orderBy(asc(dailyReportEquipmentLines.id));
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
    await db.update(dailyReportEquipmentLines).set({ deletedAt: new Date() }).where(eq(dailyReportEquipmentLines.id, id));
  }

  // New Daily Report Delivery Entries (with soft delete)
  async getDailyReportDeliveryEntries(reportId: number): Promise<DailyReportDeliveryEntry[]> {
    return await db.select().from(dailyReportDeliveryEntries).where(and(eq(dailyReportDeliveryEntries.reportId, reportId), isNull(dailyReportDeliveryEntries.deletedAt))).orderBy(asc(dailyReportDeliveryEntries.id));
  }
  async getDailyReportDeliveryEntry(id: number): Promise<DailyReportDeliveryEntry | undefined> {
    const [entry] = await db.select().from(dailyReportDeliveryEntries).where(and(eq(dailyReportDeliveryEntries.id, id), isNull(dailyReportDeliveryEntries.deletedAt)));
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
    await db.update(dailyReportPhotos).set({ deletedAt: new Date() }).where(eq(dailyReportPhotos.deliveryEntryId, id));
    await db.update(dailyReportDeliveryEntries).set({ deletedAt: new Date() }).where(eq(dailyReportDeliveryEntries.id, id));
  }

  // New Daily Report Inspection Entries (with soft delete)
  async getDailyReportInspectionEntries(reportId: number): Promise<DailyReportInspectionEntry[]> {
    return await db.select().from(dailyReportInspectionEntries).where(and(eq(dailyReportInspectionEntries.reportId, reportId), isNull(dailyReportInspectionEntries.deletedAt))).orderBy(asc(dailyReportInspectionEntries.id));
  }
  async getDailyReportInspectionEntry(id: number): Promise<DailyReportInspectionEntry | undefined> {
    const [entry] = await db.select().from(dailyReportInspectionEntries).where(and(eq(dailyReportInspectionEntries.id, id), isNull(dailyReportInspectionEntries.deletedAt)));
    return entry;
  }
  async createDailyReportInspectionEntry(entry: InsertDailyReportInspectionEntry): Promise<DailyReportInspectionEntry> {
    const [record] = await db.insert(dailyReportInspectionEntries).values(entry).returning();
    return record;
  }
  async updateDailyReportInspectionEntry(id: number, updates: Partial<InsertDailyReportInspectionEntry>): Promise<DailyReportInspectionEntry> {
    const [record] = await db.update(dailyReportInspectionEntries).set(updates).where(eq(dailyReportInspectionEntries.id, id)).returning();
    return record;
  }
  async deleteDailyReportInspectionEntry(id: number): Promise<void> {
    await db.update(dailyReportPhotos).set({ deletedAt: new Date() }).where(eq(dailyReportPhotos.inspectionEntryId, id));
    await db.update(dailyReportInspectionEntries).set({ deletedAt: new Date() }).where(eq(dailyReportInspectionEntries.id, id));
  }

  // New Daily Report Photos (with soft delete)
  async getDailyReportPhotos(reportId?: number, taskEntryId?: number, deliveryEntryId?: number, inspectionEntryId?: number): Promise<DailyReportPhoto[]> {
    if (taskEntryId) {
      return await db.select().from(dailyReportPhotos).where(and(eq(dailyReportPhotos.taskEntryId, taskEntryId), isNull(dailyReportPhotos.deletedAt))).orderBy(asc(dailyReportPhotos.id));
    }
    if (deliveryEntryId) {
      return await db.select().from(dailyReportPhotos).where(and(eq(dailyReportPhotos.deliveryEntryId, deliveryEntryId), isNull(dailyReportPhotos.deletedAt))).orderBy(asc(dailyReportPhotos.id));
    }
    if (inspectionEntryId) {
      return await db.select().from(dailyReportPhotos).where(and(eq(dailyReportPhotos.inspectionEntryId, inspectionEntryId), isNull(dailyReportPhotos.deletedAt))).orderBy(asc(dailyReportPhotos.id));
    }
    if (reportId) {
      return await db.select().from(dailyReportPhotos).where(and(eq(dailyReportPhotos.reportId, reportId), isNull(dailyReportPhotos.deletedAt))).orderBy(asc(dailyReportPhotos.id));
    }
    return [];
  }
  async getReportLevelPhotos(reportId: number): Promise<DailyReportPhoto[]> {
    return await db.select().from(dailyReportPhotos).where(
      and(
        eq(dailyReportPhotos.reportId, reportId),
        isNull(dailyReportPhotos.taskEntryId),
        isNull(dailyReportPhotos.deliveryEntryId),
        isNull(dailyReportPhotos.inspectionEntryId),
        isNull(dailyReportPhotos.deletedAt)
      )
    ).orderBy(asc(dailyReportPhotos.id));
  }
  async createDailyReportPhoto(photo: InsertDailyReportPhoto): Promise<DailyReportPhoto> {
    const [record] = await db.insert(dailyReportPhotos).values(photo).returning();
    return record;
  }
  async deleteDailyReportPhoto(id: number): Promise<void> {
    await db.update(dailyReportPhotos).set({ deletedAt: new Date() }).where(eq(dailyReportPhotos.id, id));
  }

  // Snapshot validation helpers (with soft delete filtering)
  async getLatestDailyReportForProject(projectId: number): Promise<DailyReport | undefined> {
    // Get the latest report by reportDate, then by updatedAt as tie-breaker
    const [report] = await db
      .select()
      .from(dailyReports)
      .where(and(eq(dailyReports.projectId, projectId), isNull(dailyReports.deletedAt)))
      .orderBy(desc(dailyReports.reportDate), desc(dailyReports.updatedAt))
      .limit(1);
    return report;
  }

  async getTaskSnapshotBounds(
    projectId: number, 
    taskId: number, 
    currentReportId: number, 
    currentReportDate: Date
  ): Promise<{ prevSnapshot: number; nextSnapshot: number }> {
    // Get all reports for this project containing this task, ordered by date (excluding soft-deleted)
    const reportsWithTask = await db
      .select({
        reportId: dailyReports.id,
        reportDate: dailyReports.reportDate,
        updatedAt: dailyReports.updatedAt,
        percentComplete: dailyReportTaskEntries.percentComplete,
      })
      .from(dailyReports)
      .innerJoin(dailyReportTaskEntries, eq(dailyReportTaskEntries.reportId, dailyReports.id))
      .where(
        and(
          eq(dailyReports.projectId, projectId),
          eq(dailyReportTaskEntries.taskId, taskId),
          isNull(dailyReports.deletedAt),
          isNull(dailyReportTaskEntries.deletedAt)
        )
      )
      .orderBy(dailyReports.reportDate, dailyReports.updatedAt);

    // Find bounds based on time ordering
    let prevSnapshot = 0;
    let nextSnapshot = 100;

    for (let i = 0; i < reportsWithTask.length; i++) {
      const report = reportsWithTask[i];
      if (report.reportId === currentReportId) continue;

      const reportTime = new Date(report.reportDate).getTime();
      const currentTime = new Date(currentReportDate).getTime();
      
      if (reportTime < currentTime || (reportTime === currentTime && new Date(report.updatedAt!).getTime() < new Date(currentReportDate).getTime())) {
        // This is an earlier report
        prevSnapshot = Math.max(prevSnapshot, report.percentComplete);
      } else {
        // This is a later report
        nextSnapshot = Math.min(nextSnapshot, report.percentComplete);
      }
    }

    return { prevSnapshot, nextSnapshot };
  }

  // Project Email Connections
  async getProjectEmailConnection(projectId: number): Promise<ProjectEmailConnection | undefined> {
    const [conn] = await db.select().from(projectEmailConnections).where(eq(projectEmailConnections.projectId, projectId));
    return conn;
  }

  async createProjectEmailConnection(conn: InsertProjectEmailConnection): Promise<ProjectEmailConnection> {
    const [result] = await db.insert(projectEmailConnections).values(conn).returning();
    return result;
  }

  async updateProjectEmailConnection(id: number, updates: Partial<InsertProjectEmailConnection>): Promise<ProjectEmailConnection> {
    const [result] = await db.update(projectEmailConnections).set(updates).where(eq(projectEmailConnections.id, id)).returning();
    return result;
  }

  async deleteProjectEmailConnection(projectId: number): Promise<void> {
    await db.delete(projectEmailConnections).where(eq(projectEmailConnections.projectId, projectId));
  }

  // Project Emails
  async getProjectEmails(projectId: number, options?: { isInternal?: boolean; search?: string; limit?: number; offset?: number }): Promise<ProjectEmail[]> {
    const conditions = [eq(projectEmails.projectId, projectId)];

    if (options?.isInternal !== undefined) {
      conditions.push(eq(projectEmails.isInternal, options.isInternal));
    }

    if (options?.search) {
      const pattern = `%${options.search}%`;
      conditions.push(
        or(
          ilike(projectEmails.subject, pattern),
          ilike(projectEmails.fromEmail, pattern),
          ilike(projectEmails.fromName, pattern)
        )!
      );
    }

    return await db.select().from(projectEmails)
      .where(and(...conditions))
      .orderBy(desc(projectEmails.receivedAt))
      .limit(options?.limit ?? 50)
      .offset(options?.offset ?? 0);
  }

  async getProjectEmail(id: number): Promise<ProjectEmail | undefined> {
    const [email] = await db.select().from(projectEmails).where(eq(projectEmails.id, id));
    return email;
  }

  async getProjectEmailByOutlookId(projectId: number, outlookMessageId: string): Promise<ProjectEmail | undefined> {
    const [email] = await db.select().from(projectEmails).where(
      and(eq(projectEmails.projectId, projectId), eq(projectEmails.outlookMessageId, outlookMessageId))
    );
    return email;
  }

  async createProjectEmail(email: InsertProjectEmail): Promise<ProjectEmail> {
    const [result] = await db.insert(projectEmails).values(email).returning();
    return result;
  }

  async getProjectEmailsCount(projectId: number, isInternal?: boolean, search?: string): Promise<number> {
    const conditions = [eq(projectEmails.projectId, projectId)];
    if (isInternal !== undefined) {
      conditions.push(eq(projectEmails.isInternal, isInternal));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(projectEmails.subject, pattern),
          ilike(projectEmails.fromEmail, pattern),
          ilike(projectEmails.fromName, pattern)
        )!
      );
    }
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(projectEmails).where(and(...conditions));
    return Number(result.count);
  }

  // Project Email Attachments
  async getProjectEmailAttachments(emailId: number): Promise<ProjectEmailAttachment[]> {
    return await db.select().from(projectEmailAttachments).where(eq(projectEmailAttachments.emailId, emailId)).orderBy(asc(projectEmailAttachments.id));
  }

  async createProjectEmailAttachment(att: InsertProjectEmailAttachment): Promise<ProjectEmailAttachment> {
    const [result] = await db.insert(projectEmailAttachments).values(att).returning();
    return result;
  }

  // Fingercheck Employees
  async getFingercheckEmployees(): Promise<FingercheckEmployee[]> {
    return await db.select().from(fingercheckEmployees).orderBy(fingercheckEmployees.lastName, fingercheckEmployees.firstName);
  }

  async getFingercheckEmployee(id: number): Promise<FingercheckEmployee | undefined> {
    const [employee] = await db.select().from(fingercheckEmployees).where(eq(fingercheckEmployees.id, id));
    return employee;
  }

  async getFingercheckEmployeeByEmployeeId(employeeId: number): Promise<FingercheckEmployee | undefined> {
    const [employee] = await db.select().from(fingercheckEmployees).where(eq(fingercheckEmployees.employeeId, employeeId));
    return employee;
  }

  async upsertFingercheckEmployee(employee: InsertFingercheckEmployee): Promise<FingercheckEmployee> {
    const now = new Date();
    const [result] = await db
      .insert(fingercheckEmployees)
      .values({ ...employee, lastSyncedAt: now })
      .onConflictDoUpdate({
        target: fingercheckEmployees.employeeId,
        set: {
          ...employee,
          lastSyncedAt: now,
        },
      })
      .returning();
    return result;
  }

  async deleteFingercheckEmployee(id: number): Promise<void> {
    await db.delete(fingercheckEmployees).where(eq(fingercheckEmployees.id, id));
  }

  // Fingercheck Time Punches
  async getTimePunches(filters?: { employeeId?: number; startDate?: string; endDate?: string; jobCode?: string }): Promise<FingercheckTimePunch[]> {
    const conditions = [];
    if (filters?.employeeId) {
      conditions.push(eq(fingercheckTimePunches.employeeId, filters.employeeId));
    }
    if (filters?.startDate) {
      conditions.push(sql`${fingercheckTimePunches.date} >= ${filters.startDate}`);
    }
    if (filters?.endDate) {
      conditions.push(sql`${fingercheckTimePunches.date} <= ${filters.endDate + "T23:59:59"}`);
    }
    if (filters?.jobCode) {
      conditions.push(eq(fingercheckTimePunches.jobCode, filters.jobCode));
    }
    if (conditions.length > 0) {
      return db.select().from(fingercheckTimePunches).where(and(...conditions)).orderBy(fingercheckTimePunches.actualTime);
    }
    return db.select().from(fingercheckTimePunches).orderBy(fingercheckTimePunches.actualTime);
  }

  async upsertTimePunch(punch: InsertFingercheckTimePunch): Promise<FingercheckTimePunch> {
    const now = new Date();
    const [result] = await db
      .insert(fingercheckTimePunches)
      .values({ ...punch, lastSyncedAt: now })
      .onConflictDoUpdate({
        target: fingercheckTimePunches.guid,
        set: {
          ...punch,
          lastSyncedAt: now,
        },
      })
      .returning();
    return result;
  }

  async deleteTimePunchesByDateRange(startDate: string, endDate: string): Promise<void> {
    await db.delete(fingercheckTimePunches).where(
      and(
        sql`${fingercheckTimePunches.date} >= ${startDate}`,
        sql`${fingercheckTimePunches.date} <= ${endDate + "T23:59:59"}`
      )
    );
  }

  // Fingercheck Project Mappings
  async getProjectMappings(): Promise<FingercheckProjectMapping[]> {
    return db.select().from(fingercheckProjectMappings).orderBy(fingercheckProjectMappings.createdAt);
  }

  async getProjectMappingsByProjectId(projectId: number): Promise<FingercheckProjectMapping[]> {
    return db.select().from(fingercheckProjectMappings).where(eq(fingercheckProjectMappings.projectId, projectId)).orderBy(asc(fingercheckProjectMappings.id));
  }

  async getProjectMappingByJobCode(jobCode: string): Promise<FingercheckProjectMapping | undefined> {
    const [result] = await db.select().from(fingercheckProjectMappings).where(eq(fingercheckProjectMappings.fingercheckJobCode, jobCode));
    return result;
  }

  async createProjectMapping(mapping: InsertFingercheckProjectMapping): Promise<FingercheckProjectMapping> {
    const [result] = await db.insert(fingercheckProjectMappings).values(mapping).returning();
    return result;
  }

  async deleteProjectMapping(id: number): Promise<void> {
    await db.delete(fingercheckProjectMappings).where(eq(fingercheckProjectMappings.id, id));
  }

  // RFIs
  async getRfis(projectId: number): Promise<Rfi[]> {
    return db.select().from(rfis)
      .where(and(eq(rfis.projectId, projectId), isNull(rfis.deletedAt)))
      .orderBy(rfis.rfiNumber);
  }

  async getRfi(id: number): Promise<Rfi | undefined> {
    const [rfi] = await db.select().from(rfis).where(and(eq(rfis.id, id), isNull(rfis.deletedAt)));
    return rfi;
  }

  async getNextRfiNumber(projectId: number): Promise<number> {
    const allRfis = await db
      .select({ rfiNumber: rfis.rfiNumber, status: rfis.status, deletedAt: rfis.deletedAt })
      .from(rfis)
      .where(eq(rfis.projectId, projectId));
    const activeNumbers = new Set(
      allRfis.filter(r => !r.deletedAt).map(r => r.rfiNumber)
    );
    const maxNum = allRfis.length > 0 ? Math.max(...allRfis.map(r => r.rfiNumber)) : 0;
    for (let i = 1; i <= maxNum + 1; i++) {
      if (!activeNumbers.has(i)) return i;
    }
    return maxNum + 1;
  }

  async createRfi(rfi: InsertRfi): Promise<Rfi> {
    const [result] = await db.insert(rfis).values(rfi).returning();
    return result;
  }

  async updateRfi(id: number, updates: Partial<InsertRfi>): Promise<Rfi> {
    const [result] = await db.update(rfis).set({ ...updates, updatedAt: new Date() }).where(eq(rfis.id, id)).returning();
    return result;
  }

  async deleteRfi(id: number): Promise<void> {
    await db.update(rfis).set({ deletedAt: new Date() }).where(eq(rfis.id, id));
  }

  // RFI Responses
  async getRfiResponses(rfiId: number): Promise<RfiResponse[]> {
    return db.select().from(rfiResponses)
      .where(eq(rfiResponses.rfiId, rfiId))
      .orderBy(rfiResponses.receivedAt);
  }

  async getRfiResponseByOutlookId(outlookMessageId: string): Promise<RfiResponse | undefined> {
    const [result] = await db.select().from(rfiResponses).where(eq(rfiResponses.outlookMessageId, outlookMessageId));
    return result;
  }

  async createRfiResponse(response: InsertRfiResponse): Promise<RfiResponse> {
    const [result] = await db.insert(rfiResponses).values(response).returning();
    return result;
  }

  async getUserOutlookConnection(userId: string): Promise<UserOutlookConnection | undefined> {
    const [result] = await db.select().from(userOutlookConnections).where(eq(userOutlookConnections.userId, userId));
    return result;
  }

  async upsertUserOutlookConnection(data: { userId: string; email: string; accessToken: string; refreshToken: string; expiresAt: Date }): Promise<UserOutlookConnection> {
    const [result] = await db.insert(userOutlookConnections).values(data)
      .onConflictDoUpdate({
        target: userOutlookConnections.userId,
        set: {
          email: data.email,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result;
  }

  async deleteUserOutlookConnection(userId: string): Promise<void> {
    await db.delete(userOutlookConnections).where(eq(userOutlookConnections.userId, userId));
  }

  async getProjectDailyReportRecipients(projectId: number): Promise<ProjectDailyReportRecipient[]> {
    return await db.select().from(projectDailyReportRecipients).where(and(eq(projectDailyReportRecipients.projectId, projectId), isNull(projectDailyReportRecipients.deletedAt))).orderBy(asc(projectDailyReportRecipients.id));
  }
  async createProjectDailyReportRecipient(recipient: InsertProjectDailyReportRecipient): Promise<ProjectDailyReportRecipient> {
    const [record] = await db.insert(projectDailyReportRecipients).values(recipient).returning();
    return record;
  }
  async deleteProjectDailyReportRecipient(id: number): Promise<void> {
    await db.update(projectDailyReportRecipients).set({ deletedAt: new Date() }).where(eq(projectDailyReportRecipients.id, id));
  }

  // Pay Applications (G702 Progress Billing)
  async getPayApplications(projectId: number): Promise<PayApplication[]> {
    return db.select().from(payApplications).where(and(eq(payApplications.projectId, projectId), isNull(payApplications.deletedAt))).orderBy(asc(payApplications.applicationNumber));
  }

  async getPayApplication(id: number): Promise<PayApplication | undefined> {
    const [result] = await db.select().from(payApplications).where(and(eq(payApplications.id, id), isNull(payApplications.deletedAt)));
    return result;
  }

  async getNextPayApplicationNumber(projectId: number): Promise<number> {
    const [result] = await db.select({ max: sql<number>`COALESCE(MAX(${payApplications.applicationNumber}), 0)` }).from(payApplications).where(and(eq(payApplications.projectId, projectId), isNull(payApplications.deletedAt)));
    return (result?.max || 0) + 1;
  }

  async createPayApplication(app: InsertPayApplication): Promise<PayApplication> {
    const [result] = await db.insert(payApplications).values(app).returning();
    return result;
  }

  async updatePayApplication(id: number, app: Partial<InsertPayApplication>): Promise<PayApplication> {
    const [result] = await db.update(payApplications).set(app).where(eq(payApplications.id, id)).returning();
    return result;
  }

  async deletePayApplication(id: number): Promise<void> {
    await db.update(payApplications).set({ deletedAt: new Date() }).where(eq(payApplications.id, id));
  }

  // Pay Application Items (G703 line items)
  async getPayApplicationItems(payApplicationId: number): Promise<PayApplicationItem[]> {
    return db.select().from(payApplicationItems).where(eq(payApplicationItems.payApplicationId, payApplicationId)).orderBy(asc(payApplicationItems.itemNumber));
  }

  async createPayApplicationItem(item: InsertPayApplicationItem): Promise<PayApplicationItem> {
    const [result] = await db.insert(payApplicationItems).values(item).returning();
    return result;
  }

  async updatePayApplicationItem(id: number, item: Partial<InsertPayApplicationItem>): Promise<PayApplicationItem> {
    const [result] = await db.update(payApplicationItems).set(item).where(eq(payApplicationItems.id, id)).returning();
    return result;
  }

  async deletePayApplicationItem(id: number): Promise<void> {
    await db.delete(payApplicationItems).where(eq(payApplicationItems.id, id));
  }

  async bulkUpsertPayApplicationItems(payApplicationId: number, items: InsertPayApplicationItem[]): Promise<PayApplicationItem[]> {
    await db.delete(payApplicationItems).where(eq(payApplicationItems.payApplicationId, payApplicationId));
    if (items.length === 0) return [];
    const results = await db.insert(payApplicationItems).values(items.map(item => ({ ...item, payApplicationId }))).returning();
    return results;
  }

  // ============================================================
  // Todos, Workflow Automation, Notifications & Activity Log
  // ============================================================

  // Atomically updates a project while capturing the prior status under a row
  // lock, so concurrent duplicate requests cannot both observe the same
  // transition (workflow duplicate protection).
  async updateProjectWithStatusTracking(id: number, updates: Partial<InsertProject>): Promise<{ project: Project; previousStatus: string | null }> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
      if (!existing) throw new Error("Project not found");
      const [project] = await tx.update(projects).set(updates).where(eq(projects.id, id)).returning();
      return { project, previousStatus: existing.status ?? null };
    });
  }

  // Todos
  private todoDetailsSelection() {
    const assignee = aliasedTable(users, "todo_assignee");
    const creator = aliasedTable(users, "todo_creator");
    const completer = aliasedTable(users, "todo_completer");
    return { assignee, creator, completer };
  }

  private userDisplayName(u: typeof users) {
    return sql<string | null>`trim(concat(coalesce(${u.firstName}, ''), ' ', coalesce(${u.lastName}, '')))`;
  }

  async getTodos(filters: TodoFilters): Promise<TodoWithDetails[]> {
    const { assignee, creator, completer } = this.todoDetailsSelection();
    const conditions = [isNull(todos.deletedAt)];

    if (filters.assignedToUserId) conditions.push(eq(todos.assignedToUserId, filters.assignedToUserId));
    if (filters.projectId !== undefined) conditions.push(eq(todos.projectId, filters.projectId));
    if (filters.opportunityId !== undefined) {
      conditions.push(and(
        eq(todos.relatedEntityType, "opportunity"),
        eq(todos.relatedEntityId, filters.opportunityId),
      )!);
    }
    if (filters.priority) conditions.push(eq(todos.priority, filters.priority));

    if (filters.status && filters.status !== "all") {
      if (filters.status === "active") {
        conditions.push(inArray(todos.status, ["open", "in_progress"]));
      } else {
        conditions.push(eq(todos.status, filters.status));
      }
    }

    const today = filters.today || new Date().toISOString().slice(0, 10);
    if (filters.due) {
      switch (filters.due) {
        case "overdue":
          conditions.push(and(isNotNull(todos.dueDate), lt(todos.dueDate, today))!);
          break;
        case "today":
          conditions.push(eq(todos.dueDate, today));
          break;
        case "this_week": {
          // through end of current week (Sunday-based week: today..today+ (6-dow))
          conditions.push(and(isNotNull(todos.dueDate), gte(todos.dueDate, today), lte(todos.dueDate, sql`(${today}::date + (6 - extract(dow from ${today}::date))::int)::text`))!);
          break;
        }
        case "next_7_days":
          conditions.push(and(isNotNull(todos.dueDate), gte(todos.dueDate, today), lte(todos.dueDate, sql`(${today}::date + 7)::text`))!);
          break;
        case "no_due_date":
          conditions.push(isNull(todos.dueDate));
          break;
      }
    }

    const rows = await db
      .select({
        todo: todos,
        assignedToName: this.userDisplayName(assignee as any),
        createdByName: this.userDisplayName(creator as any),
        completedByName: this.userDisplayName(completer as any),
        projectName: projects.name,
        opportunityName: opportunities.name,
        opportunityNumber: opportunities.opportunityNumber,
        updateCount: sql<number>`(select count(*)::int from todo_updates tu where tu.todo_id = ${todos.id} and tu.deleted_at is null)`,
      })
      .from(todos)
      .leftJoin(assignee, eq(todos.assignedToUserId, assignee.id))
      .leftJoin(creator, eq(todos.createdByUserId, creator.id))
      .leftJoin(completer, eq(todos.completedByUserId, completer.id))
      .leftJoin(projects, eq(todos.projectId, projects.id))
      .leftJoin(opportunities, and(eq(todos.relatedEntityType, "opportunity"), eq(todos.relatedEntityId, opportunities.id)))
      .where(and(...conditions))
      .orderBy(
        // Grouped default sort: overdue -> due today -> upcoming -> no due date, completed/cancelled last
        sql`case when ${todos.status} in ('completed', 'cancelled') then 1 else 0 end`,
        sql`case when ${todos.dueDate} is null then 1 else 0 end`,
        asc(todos.dueDate),
        desc(todos.createdAt),
      )
      .limit(filters.limit ?? 500);

    return rows.map(r => ({
      ...r.todo,
      assignedToName: r.assignedToName || null,
      createdByName: r.todo.createdByUserId ? (r.createdByName || null) : "System",
      completedByName: r.completedByName || null,
      projectName: r.projectName ?? null,
      opportunityName: r.opportunityName ?? null,
      opportunityNumber: r.opportunityNumber ?? null,
      updateCount: r.updateCount ?? 0,
    }));
  }

  async getTodo(id: number): Promise<TodoWithDetails | undefined> {
    const { assignee, creator, completer } = this.todoDetailsSelection();
    const [row] = await db
      .select({
        todo: todos,
        assignedToName: this.userDisplayName(assignee as any),
        createdByName: this.userDisplayName(creator as any),
        completedByName: this.userDisplayName(completer as any),
        projectName: projects.name,
        opportunityName: opportunities.name,
        opportunityNumber: opportunities.opportunityNumber,
        updateCount: sql<number>`(select count(*)::int from todo_updates tu where tu.todo_id = ${todos.id} and tu.deleted_at is null)`,
      })
      .from(todos)
      .leftJoin(assignee, eq(todos.assignedToUserId, assignee.id))
      .leftJoin(creator, eq(todos.createdByUserId, creator.id))
      .leftJoin(completer, eq(todos.completedByUserId, completer.id))
      .leftJoin(projects, eq(todos.projectId, projects.id))
      .leftJoin(opportunities, and(eq(todos.relatedEntityType, "opportunity"), eq(todos.relatedEntityId, opportunities.id)))
      .where(and(eq(todos.id, id), isNull(todos.deletedAt)));
    if (!row) return undefined;
    return {
      ...row.todo,
      assignedToName: row.assignedToName || null,
      createdByName: row.todo.createdByUserId ? (row.createdByName || null) : "System",
      completedByName: row.completedByName || null,
      projectName: row.projectName ?? null,
      opportunityName: row.opportunityName ?? null,
      opportunityNumber: row.opportunityNumber ?? null,
      updateCount: row.updateCount ?? 0,
    };
  }

  async createTodo(todo: InsertTodo): Promise<Todo> {
    const [result] = await db.insert(todos).values(todo).returning();
    return result;
  }

  async updateTodo(id: number, updates: Partial<InsertTodo>): Promise<Todo> {
    const set: Record<string, unknown> = { ...updates, updatedAt: new Date() };
    // Transitioning into completed records completion metadata via completeTodo;
    // moving out of completed clears it.
    if (updates.status && updates.status !== "completed") {
      set.completedAt = null;
      set.completedByUserId = null;
    }
    const [result] = await db.update(todos).set(set).where(and(eq(todos.id, id), isNull(todos.deletedAt))).returning();
    return result;
  }

  async completeTodo(id: number, userId: string): Promise<Todo> {
    const [result] = await db
      .update(todos)
      .set({ status: "completed", completedAt: new Date(), completedByUserId: userId, updatedAt: new Date() })
      .where(and(eq(todos.id, id), isNull(todos.deletedAt)))
      .returning();
    return result;
  }

  async deleteTodo(id: number): Promise<void> {
    await db.update(todos).set({ deletedAt: new Date() }).where(eq(todos.id, id));
  }

  // ---------- Todo Updates ----------

  async getTodoUpdates(todoId: number, opts?: { limit?: number; offset?: number }): Promise<TodoUpdateWithAuthor[]> {
    const rows = await db
      .select({
        update: todoUpdates,
        authorName: this.userDisplayName(users),
        authorEmail: users.email,
      })
      .from(todoUpdates)
      .leftJoin(users, eq(todoUpdates.createdByUserId, users.id))
      .where(and(eq(todoUpdates.todoId, todoId), isNull(todoUpdates.deletedAt)))
      .orderBy(desc(todoUpdates.createdAt), desc(todoUpdates.id)) // newest first
      .limit(opts?.limit ?? 25)
      .offset(opts?.offset ?? 0);
    return rows.map(r => ({ ...r.update, authorName: r.authorName || r.authorEmail || null }));
  }

  async countTodoUpdates(todoId: number): Promise<number> {
    const [row] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(todoUpdates)
      .where(and(eq(todoUpdates.todoId, todoId), isNull(todoUpdates.deletedAt)));
    return row?.n ?? 0;
  }

  async getTodoUpdate(id: number): Promise<TodoUpdate | undefined> {
    const [row] = await db.select().from(todoUpdates).where(and(eq(todoUpdates.id, id), isNull(todoUpdates.deletedAt)));
    return row;
  }

  async createTodoUpdate(update: InsertTodoUpdate): Promise<TodoUpdate> {
    const [row] = await db.insert(todoUpdates).values(update).returning();
    return row;
  }

  async updateTodoUpdateBody(id: number, body: string): Promise<TodoUpdate> {
    const [row] = await db.update(todoUpdates)
      .set({ body, editedAt: new Date(), updatedAt: new Date() }) // editedAt drives the "Edited" marker
      .where(and(eq(todoUpdates.id, id), isNull(todoUpdates.deletedAt)))
      .returning();
    return row;
  }

  async softDeleteTodoUpdate(id: number): Promise<void> {
    // Soft delete only — updates are historical records
    await db.update(todoUpdates).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(todoUpdates.id, id));
  }

  async getMyWorkSummary(userId: string, today: string): Promise<MyWorkSummary> {
    const [row] = await db
      .select({
        overdue: sql<number>`count(*) filter (where ${todos.dueDate} is not null and ${todos.dueDate} < ${today})`,
        dueToday: sql<number>`count(*) filter (where ${todos.dueDate} = ${today})`,
        upcoming: sql<number>`count(*) filter (where ${todos.dueDate} is not null and ${todos.dueDate} > ${today})`,
        noDueDate: sql<number>`count(*) filter (where ${todos.dueDate} is null)`,
        open: sql<number>`count(*)`,
      })
      .from(todos)
      .where(and(
        isNull(todos.deletedAt),
        eq(todos.assignedToUserId, userId),
        inArray(todos.status, ["open", "in_progress"]),
      ));
    return {
      overdue: Number(row?.overdue ?? 0),
      dueToday: Number(row?.dueToday ?? 0),
      upcoming: Number(row?.upcoming ?? 0),
      noDueDate: Number(row?.noDueDate ?? 0),
      open: Number(row?.open ?? 0),
    };
  }

  // Due-date reminders: open todos due today (no prior 'due_today' notification)
  // or overdue (no prior 'overdue' notification). Dedupe is per todo+type via
  // NOT EXISTS against the notifications table, so repeated runs and restarts
  // never create duplicates.
  async getTodosNeedingDueReminder(today: string): Promise<(Todo & { reminderType: "due_today" | "overdue" })[]> {
    const reminderType = sql<"due_today" | "overdue">`case when ${todos.dueDate} < ${today} then 'overdue' else 'due_today' end`;
    const rows = await db
      .select({ todo: todos, reminderType })
      .from(todos)
      .where(and(
        isNull(todos.deletedAt),
        inArray(todos.status, ["open", "in_progress"]),
        isNotNull(todos.dueDate),
        lte(todos.dueDate, today),
        sql`not exists (
          select 1 from ${notifications} n
          where n.todo_id = ${todos.id}
            and n.type = (case when ${todos.dueDate} < ${today} then 'overdue' else 'due_today' end)
        )`,
      ))
      .orderBy(asc(todos.dueDate), asc(todos.id));
    return rows.map(r => ({ ...r.todo, reminderType: r.reminderType }));
  }

  // Atomic reminder insert: the partial unique index uq_notifications_todo_reminder
  // on (todo_id, type) for reminder types makes ON CONFLICT DO NOTHING the
  // authoritative dedupe — concurrent runs and multiple instances cannot
  // double-remind. Returns undefined when the reminder already existed.
  async createReminderNotificationIfAbsent(notification: InsertNotification): Promise<Notification | undefined> {
    const [result] = await db
      .insert(notifications)
      .values(notification)
      .onConflictDoNothing()
      .returning();
    return result;
  }

  // Workflow Rules
  async getWorkflowRules(): Promise<WorkflowRuleWithDetails[]> {
    const rows = await db
      .select({
        rule: workflowRules,
        assignedToName: this.userDisplayName(users),
        assignedToEmail: users.email,
        assigneeIsAuthorized: users.isAuthorized,
      })
      .from(workflowRules)
      .leftJoin(users, eq(workflowRules.assignedToUserId, users.id))
      .where(isNull(workflowRules.deletedAt))
      .orderBy(asc(workflowRules.triggerStatus), asc(workflowRules.name));
    return rows.map(r => ({
      ...r.rule,
      assignedToName: r.assignedToName || null,
      assignedToEmail: r.assignedToEmail ?? null,
      assigneeIsActive: r.assigneeIsAuthorized === "approved",
    }));
  }

  async getWorkflowRule(id: number): Promise<WorkflowRule | undefined> {
    const [rule] = await db.select().from(workflowRules).where(and(eq(workflowRules.id, id), isNull(workflowRules.deletedAt)));
    return rule;
  }

  async getActiveWorkflowRulesForStatus(triggerStatus: string, triggerType = "project_status_change"): Promise<WorkflowRule[]> {
    return db.select().from(workflowRules).where(and(
      isNull(workflowRules.deletedAt),
      eq(workflowRules.isActive, true),
      eq(workflowRules.triggerType, triggerType),
      eq(workflowRules.triggerStatus, triggerStatus),
    ));
  }

  async createWorkflowRule(rule: InsertWorkflowRule & { createdByUserId?: string | null }): Promise<WorkflowRule> {
    const [result] = await db.insert(workflowRules).values(rule).returning();
    return result;
  }

  async updateWorkflowRule(id: number, updates: Partial<InsertWorkflowRule>): Promise<WorkflowRule> {
    const [result] = await db.update(workflowRules).set({ ...updates, updatedAt: new Date() }).where(and(eq(workflowRules.id, id), isNull(workflowRules.deletedAt))).returning();
    return result;
  }

  async deleteWorkflowRule(id: number): Promise<void> {
    await db.update(workflowRules).set({ deletedAt: new Date() }).where(eq(workflowRules.id, id));
  }

  // Workflow Executions — claim is idempotent: returns undefined when this
  // rule already executed for the given status transition.
  async claimWorkflowExecution(execution: InsertWorkflowExecution): Promise<WorkflowExecution | undefined> {
    const [result] = await db.insert(workflowExecutions).values(execution).onConflictDoNothing().returning();
    return result;
  }

  async updateWorkflowExecution(id: number, updates: Partial<InsertWorkflowExecution>): Promise<WorkflowExecution> {
    const [result] = await db.update(workflowExecutions).set(updates).where(eq(workflowExecutions.id, id)).returning();
    return result;
  }

  // Project Status History
  async createProjectStatusHistory(history: InsertProjectStatusHistory): Promise<ProjectStatusHistory> {
    const [result] = await db.insert(projectStatusHistory).values(history).returning();
    return result;
  }

  async getProjectStatusHistory(projectId: number): Promise<ProjectStatusHistory[]> {
    return db.select().from(projectStatusHistory).where(eq(projectStatusHistory.projectId, projectId)).orderBy(desc(projectStatusHistory.changedAt));
  }

  // Notifications
  async getNotifications(userId: string, limit = 20): Promise<Notification[]> {
    return db.select().from(notifications).where(eq(notifications.userId, userId)).orderBy(desc(notifications.createdAt)).limit(limit);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    return Number(row?.count ?? 0);
  }

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [result] = await db.insert(notifications).values(notification).returning();
    return result;
  }

  async markNotificationRead(id: number, userId: string): Promise<Notification | undefined> {
    const [result] = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
      .returning();
    return result;
  }

  async markAllNotificationsRead(userId: string): Promise<number> {
    const result = await db
      .update(notifications)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
      .returning({ id: notifications.id });
    return result.length;
  }

  // Activity Logs
  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [result] = await db.insert(activityLogs).values(log).returning();
    return result;
  }

  async getProjectActivity(projectId: number, limit = 100): Promise<ActivityLog[]> {
    return db.select().from(activityLogs).where(eq(activityLogs.projectId, projectId)).orderBy(desc(activityLogs.createdAt)).limit(limit);
  }

  async getCustomerActivity(customerId: number, limit = 100): Promise<ActivityLog[]> {
    // Customer events are logged with entityType 'customer'; contact/communication events
    // carry metadata.customerId so all history for a customer can be read together.
    return db.select().from(activityLogs)
      .where(or(
        and(eq(activityLogs.entityType, "customer"), eq(activityLogs.entityId, customerId)),
        sql`(${activityLogs.metadata} ->> 'customerId')::int = ${customerId}`,
      ))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  async getOpportunityActivity(opportunityId: number, limit = 100): Promise<ActivityLog[]> {
    // Opportunity events are logged with entityType 'opportunity'; related events
    // (todos, contacts, communications) carry metadata.opportunityId.
    return db.select().from(activityLogs)
      .where(or(
        and(eq(activityLogs.entityType, "opportunity"), eq(activityLogs.entityId, opportunityId)),
        sql`(${activityLogs.metadata} ->> 'opportunityId')::int = ${opportunityId}`,
      ))
      .orderBy(desc(activityLogs.createdAt))
      .limit(limit);
  }

  // ============================================================
  // Opportunities
  // ============================================================

  private opportunityDetailsQuery() {
    return db
      .select({
        opportunity: opportunities,
        customerName: customers.name,
        responsibleUserName: this.userDisplayName(users),
        primaryContactId: sql<number | null>`(
          select oc.contact_id from opportunity_contacts oc
          where oc.opportunity_id = ${opportunities.id} and oc.is_primary = true limit 1
        )`,
        primaryContactName: sql<string | null>`(
          select trim(concat(c.first_name, ' ', coalesce(c.last_name, '')))
          from opportunity_contacts oc join contacts c on c.id = oc.contact_id
          where oc.opportunity_id = ${opportunities.id} and oc.is_primary = true limit 1
        )`,
      })
      .from(opportunities)
      .leftJoin(customers, eq(opportunities.customerId, customers.id))
      .leftJoin(users, eq(opportunities.responsibleUserId, users.id));
  }

  private mapOpportunityDetails(r: { opportunity: Opportunity; customerName: string | null; responsibleUserName: string | null; primaryContactId: number | null; primaryContactName: string | null }): OpportunityWithDetails {
    return {
      ...r.opportunity,
      customerName: r.customerName ?? null,
      responsibleUserName: r.responsibleUserName || null,
      primaryContactId: r.primaryContactId ?? null,
      primaryContactName: r.primaryContactName || null,
    };
  }

  async getOpportunities(filters: OpportunityFilters = {}): Promise<OpportunityWithDetails[]> {
    const conditions = [isNull(opportunities.deletedAt)];
    if (!filters.includeArchived) conditions.push(eq(opportunities.isArchived, false));
    if (filters.status) conditions.push(eq(opportunities.status, filters.status));
    if (filters.customerId !== undefined) conditions.push(eq(opportunities.customerId, filters.customerId));
    if (filters.responsibleUserId) conditions.push(eq(opportunities.responsibleUserId, filters.responsibleUserId));
    if (filters.unassigned) conditions.push(isNull(opportunities.responsibleUserId));
    if (filters.createdByUserId) conditions.push(eq(opportunities.createdByUserId, filters.createdByUserId));
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(ilike(opportunities.name, term), ilike(opportunities.opportunityNumber, term))!);
    }
    const rows = await this.opportunityDetailsQuery()
      .where(and(...conditions))
      .orderBy(desc(opportunities.createdAt))
      .limit(filters.limit ?? 500);
    return rows.map(r => this.mapOpportunityDetails(r));
  }

  /**
   * Server-side dashboard query. Every filter is added to the same WHERE clause,
   * so search/facets/date/ownership remain composable. Pagination always has an
   * id tie-breaker to prevent rows moving between pages when sort values match.
   */
  async getOpportunityDashboard(filters: OpportunityFilters = {}): Promise<OpportunityDashboardResult> {
    const conditions = [isNull(opportunities.deletedAt)];
    const archive = filters.archive ?? (filters.includeArchived ? "all" : "active");
    if (archive === "active") conditions.push(eq(opportunities.isArchived, false));
    if (archive === "archived") conditions.push(eq(opportunities.isArchived, true));
    const statuses = filters.statuses?.length ? filters.statuses : (filters.status ? [filters.status] : []);
    if (statuses.length) conditions.push(inArray(opportunities.status, statuses));
    if (filters.customerId !== undefined) conditions.push(eq(opportunities.customerId, filters.customerId));
    if (filters.responsibleUserId) conditions.push(eq(opportunities.responsibleUserId, filters.responsibleUserId));
    if (filters.source?.length) conditions.push(inArray(opportunities.source, filters.source));
    if (filters.projectType?.length) conditions.push(inArray(opportunities.projectType, filters.projectType));
    if (filters.bidDueFrom) conditions.push(gte(opportunities.bidDueDate, filters.bidDueFrom));
    if (filters.bidDueTo) conditions.push(lte(opportunities.bidDueDate, filters.bidDueTo));
    const dateColumn = {
      bidDueDate: opportunities.bidDueDate,
      rfpReceivedDate: opportunities.rfpReceivedDate,
      estimatedStartDate: opportunities.estimatedStartDate,
      createdAt: opportunities.createdAt,
    }[filters.dateField ?? "bidDueDate"];
    if (filters.dateFrom) conditions.push(gte(dateColumn as any, filters.dateFrom));
    if (filters.dateTo) {
      conditions.push(filters.dateField === "createdAt"
        ? lte(dateColumn as any, sql`${filters.dateTo}::date + interval '1 day'`)
        : lte(dateColumn as any, filters.dateTo));
    }
    if (filters.outcome?.length) {
      conditions.push(or(
        filters.outcome.includes("lost") ? eq(opportunities.status, "lost") : undefined,
        filters.outcome.includes("no_bid") ? eq(opportunities.status, "no_bid") : undefined,
        filters.outcome.includes("awarded") ? eq(opportunities.status, "awarded") : undefined,
        ...filters.outcome.filter(v => !["lost", "no_bid", "awarded"].includes(v)).map(v =>
          or(eq(opportunities.lostReason, v), eq(opportunities.noBidReason, v))),
      )!);
    }
    // The active dashboard is a work queue. Terminal outcomes are available
    // through an explicit status/outcome filter, but do not silently inflate it.
    const hasExplicitOutcomeOrStatus = statuses.length > 0 || Boolean(filters.outcome?.length);
    const today = filters.today ?? new Date().toISOString().slice(0, 10);
    const deadlineEligible = inArray(opportunities.status, [...OPPORTUNITY_DEADLINE_ELIGIBLE_STATUSES]);
    switch (filters.urgency) {
      case "overdue":
        conditions.push(and(deadlineEligible, isNotNull(opportunities.bidDueDate), lt(opportunities.bidDueDate, today))!);
        break;
      case "due_today":
      case "today":
        conditions.push(and(deadlineEligible, eq(opportunities.bidDueDate, today))!);
        break;
      case "tomorrow":
      case "due_tomorrow":
        conditions.push(and(deadlineEligible, eq(opportunities.bidDueDate, sql`${today}::date + 1`))!);
        break;
      case "this_week":
      case "due_this_week":
        conditions.push(and(
          deadlineEligible,
          gt(opportunities.bidDueDate, sql`${today}::date + 1`),
          lte(opportunities.bidDueDate, sql`${today}::date + (7 - extract(dow from ${today}::date)::int)`),
        )!);
        break;
      case "next_7_days":
      case "due_next_7_days":
        conditions.push(and(deadlineEligible, gt(opportunities.bidDueDate, today), lte(opportunities.bidDueDate, sql`${today}::date + 7`))!);
        break;
      case "later":
        conditions.push(and(deadlineEligible, gt(opportunities.bidDueDate, sql`${today}::date + 7`))!);
        break;
      case "no_due_date":
        conditions.push(and(deadlineEligible, isNull(opportunities.bidDueDate))!);
        break;
    }
    if (filters.search?.trim()) {
      const term = `%${filters.search.trim()}%`;
      conditions.push(or(
        ilike(opportunities.name, term),
        ilike(opportunities.opportunityNumber, term),
        ilike(customers.name, term),
        ilike(opportunities.streetAddress, term),
        ilike(opportunities.address2, term),
        ilike(opportunities.city, term),
        ilike(opportunities.state, term),
        ilike(opportunities.zip, term),
        sql`concat_ws(' ', ${opportunities.streetAddress}, ${opportunities.address2}, ${opportunities.city}, ${opportunities.state}, ${opportunities.zip}) ilike ${term}`,
        sql`exists (
          select 1 from opportunity_contacts oc
          join contacts c on c.id = oc.contact_id
          where oc.opportunity_id = ${opportunities.id}
          and (concat_ws(' ', c.first_name, c.last_name) ilike ${term}
            or c.first_name ilike ${term} or c.last_name ilike ${term}
            or c.email ilike ${term} or c.office_phone ilike ${term} or c.mobile_phone ilike ${term})
        )`,
      )!);
    }

    // Keep the same facets/search for the outcome counter, but omit only the
    // implicit default-outcome exclusion so the active dashboard can surface it.
    const outcomeSummaryConditions = [...conditions];
    if (archive === "active" && !hasExplicitOutcomeOrStatus) {
      conditions.push(notInArray(opportunities.status, [...OPPORTUNITY_OUTCOME_STATUSES]));
    }
    const where = and(...conditions);
    const lastActivityAt = sql<Date | null>`(
      select max(al.created_at) from activity_logs al
      where (al.entity_type = 'opportunity' and al.entity_id = ${opportunities.id})
         or (al.metadata ->> 'opportunityId')::int = ${opportunities.id}
    )`;
    const sortColumns = {
      name: opportunities.name,
      opportunityNumber: opportunities.opportunityNumber,
      customer: customers.name,
      status: opportunities.status,
      responsible: users.firstName,
      bidDueDate: opportunities.bidDueDate,
      expectedValue: opportunities.expectedValue,
      createdAt: opportunities.createdAt,
      updatedAt: opportunities.updatedAt,
      lastActivity: lastActivityAt,
    };
    const sortColumn = sortColumns[filters.sortBy ?? "updatedAt"];
    const direction = filters.sortDir === "asc" ? asc : desc;
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));

    const rows = await db.select({
      opportunity: opportunities,
      customerName: customers.name,
      responsibleUserName: this.userDisplayName(users),
      primaryContactId: sql<number | null>`(
        select oc.contact_id from opportunity_contacts oc
        where oc.opportunity_id = ${opportunities.id} and oc.is_primary = true limit 1
      )`,
      primaryContactName: sql<string | null>`(
        select trim(concat(c.first_name, ' ', coalesce(c.last_name, '')))
        from opportunity_contacts oc join contacts c on c.id = oc.contact_id
        where oc.opportunity_id = ${opportunities.id} and oc.is_primary = true limit 1
      )`,
      lastActivityAt,
    }).from(opportunities)
      .leftJoin(customers, eq(opportunities.customerId, customers.id))
      .leftJoin(users, eq(opportunities.responsibleUserId, users.id))
      .where(where)
      .orderBy(direction(sortColumn), direction(opportunities.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    const [totals, statusRows, outcomeTotals] = await Promise.all([
      db.select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${opportunities.isArchived} = false and ${opportunities.status} not in ('awarded', 'lost', 'no_bid'))::int`,
        archived: sql<number>`count(*) filter (where ${opportunities.isArchived} = true)::int`,
        unassigned: sql<number>`count(*) filter (where ${opportunities.responsibleUserId} is null)::int`,
        overdue: sql<number>`count(*) filter (where ${opportunities.status} in ('new', 'under_review', 'estimating', 'proposal_ready') and ${opportunities.bidDueDate} < ${today})::int`,
        dueToday: sql<number>`count(*) filter (where ${opportunities.status} in ('new', 'under_review', 'estimating', 'proposal_ready') and ${opportunities.bidDueDate} = ${today})::int`,
        dueTomorrow: sql<number>`count(*) filter (where ${opportunities.status} in ('new', 'under_review', 'estimating', 'proposal_ready') and ${opportunities.bidDueDate} = ${today}::date + 1)::int`,
        dueNext7Days: sql<number>`count(*) filter (where ${opportunities.status} in ('new', 'under_review', 'estimating', 'proposal_ready') and ${opportunities.bidDueDate} > ${today} and ${opportunities.bidDueDate} <= ${today}::date + 7)::int`,
        expectedValueTotal: sql<number>`coalesce(sum(${opportunities.expectedValue}), 0)`,
        weightedValueTotal: sql<number>`coalesce(sum(${opportunities.expectedValue} * coalesce(${opportunities.probability}, 0) / 100.0), 0)`,
      }).from(opportunities)
        .leftJoin(customers, eq(opportunities.customerId, customers.id))
        .leftJoin(users, eq(opportunities.responsibleUserId, users.id))
        .where(where),
      db.select({ status: opportunities.status, count: sql<number>`count(*)::int` })
        .from(opportunities)
        .leftJoin(customers, eq(opportunities.customerId, customers.id))
        .leftJoin(users, eq(opportunities.responsibleUserId, users.id))
        .where(where)
        .groupBy(opportunities.status),
      db.select({
        outcomes: sql<number>`count(*) filter (where ${opportunities.isArchived} = false and ${opportunities.status} in ('awarded', 'lost', 'no_bid'))::int`,
      }).from(opportunities)
        .leftJoin(customers, eq(opportunities.customerId, customers.id))
        .leftJoin(users, eq(opportunities.responsibleUserId, users.id))
        .where(and(...outcomeSummaryConditions)),
    ]);
    const total = Number(totals[0]?.total ?? 0);
    const canViewValues = filters.canViewValues === true;
    const items = rows.map(r => {
      const item = { ...this.mapOpportunityDetails(r), lastActivityAt: r.lastActivityAt };
      if (!canViewValues) {
        item.expectedValue = null;
        item.probability = null;
      }
      return item;
    });
    return {
      items,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
      statusCounts: Object.fromEntries(statusRows.map(r => [r.status, Number(r.count)])),
      summary: {
        total,
        active: Number(totals[0]?.active ?? 0),
        outcomes: Number(outcomeTotals[0]?.outcomes ?? 0),
        archived: Number(totals[0]?.archived ?? 0),
        unassigned: Number(totals[0]?.unassigned ?? 0),
        overdue: Number(totals[0]?.overdue ?? 0),
        dueToday: Number(totals[0]?.dueToday ?? 0),
        dueTomorrow: Number(totals[0]?.dueTomorrow ?? 0),
        dueNext7Days: Number(totals[0]?.dueNext7Days ?? 0),
        expectedValueTotal: canViewValues ? Number(totals[0]?.expectedValueTotal ?? 0) : null,
        weightedValueTotal: canViewValues ? Number(totals[0]?.weightedValueTotal ?? 0) : null,
      },
      canViewValues,
    };
  }

  async getOpportunity(id: number): Promise<Opportunity | undefined> {
    const [row] = await db.select().from(opportunities).where(and(eq(opportunities.id, id), isNull(opportunities.deletedAt)));
    return row;
  }

  async getOpportunityWithDetails(id: number): Promise<OpportunityWithDetails | undefined> {
    const [row] = await this.opportunityDetailsQuery().where(and(eq(opportunities.id, id), isNull(opportunities.deletedAt)));
    return row ? this.mapOpportunityDetails(row) : undefined;
  }

  async getOpportunitiesByCustomer(customerId: number, includeArchived = false): Promise<OpportunityWithDetails[]> {
    return this.getOpportunities({ customerId, includeArchived });
  }

  // Opportunity numbers (OPP-YYYY-NNNN) are generated under a transaction-scoped
  // advisory lock so concurrent creates can never allocate the same number. The
  // number is decoupled from the primary key so the format can change later.
  async createOpportunity(opportunity: InsertOpportunity & { createdByUserId?: string | null }): Promise<Opportunity> {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('opportunity_number'))`);
      const year = new Date().getFullYear();
      const prefix = `OPP-${year}-`;
      // Numeric max of the sequence part — robust even if padding width changes later
      const [row] = await tx
        .select({ maxSeq: sql<number | null>`max((substring(${opportunities.opportunityNumber} from ${sql.raw(String(prefix.length + 1))}))::int)` })
        .from(opportunities)
        .where(sql`${opportunities.opportunityNumber} like ${prefix + "%"}`);
      const next = (row?.maxSeq ?? 0) + 1;
      const opportunityNumber = `${prefix}${String(next).padStart(4, "0")}`;
      const [result] = await tx.insert(opportunities).values({ ...opportunity, opportunityNumber }).returning();
      return result;
    });
  }

  async updateOpportunity(id: number, updates: Record<string, unknown>): Promise<Opportunity> {
    const [result] = await db
      .update(opportunities)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(opportunities.id, id), isNull(opportunities.deletedAt)))
      .returning();
    return result;
  }

  // Atomic status transition detection under a row lock (mirrors
  // updateProjectWithStatusTracking): concurrent duplicate requests cannot both
  // observe the same transition, and re-saving the same status is a no-op.
  async updateOpportunityWithStatusTracking(
    id: number,
    updates: Record<string, unknown> & { status: string },
    changedBy: { userId: string | null; name: string | null },
  ): Promise<{ opportunity: Opportunity; previousStatus: string | null; changed: boolean; history: OpportunityStatusHistory | null }> {
    // Status update AND its history row commit in ONE transaction so a
    // transition can never be recorded without its history (the history row is
    // the workflow idempotency identity). If anything here fails, the status
    // change rolls back too and the client can safely retry.
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(opportunities)
        .where(and(eq(opportunities.id, id), isNull(opportunities.deletedAt)))
        .for("update");
      if (!existing) throw new Error("Opportunity not found");
      if (existing.status === updates.status) {
        return { opportunity: existing, previousStatus: existing.status, changed: false, history: null };
      }
      const [opportunity] = await tx.update(opportunities)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(opportunities.id, id))
        .returning();
      const [history] = await tx.insert(opportunityStatusHistory).values({
        opportunityId: id,
        previousStatus: existing.status ?? null,
        newStatus: updates.status,
        changedByUserId: changedBy.userId,
        changedByName: changedBy.name,
      }).returning();
      return { opportunity, previousStatus: existing.status ?? null, changed: true, history };
    });
  }

  // Opportunity Contacts
  async getOpportunityContacts(opportunityId: number): Promise<OpportunityContactWithDetails[]> {
    const rows = await db
      .select({ link: opportunityContacts, contact: contacts })
      .from(opportunityContacts)
      .innerJoin(contacts, eq(opportunityContacts.contactId, contacts.id))
      .where(eq(opportunityContacts.opportunityId, opportunityId))
      .orderBy(desc(opportunityContacts.isPrimary), asc(contacts.firstName));
    return rows.map(r => ({
      ...r.link,
      firstName: r.contact.firstName,
      lastName: r.contact.lastName,
      jobTitle: r.contact.jobTitle,
      email: r.contact.email,
      officePhone: r.contact.officePhone,
      mobilePhone: r.contact.mobilePhone,
      customerId: r.contact.customerId,
    }));
  }

  async getOpportunityContact(id: number): Promise<OpportunityContact | undefined> {
    const [row] = await db.select().from(opportunityContacts).where(eq(opportunityContacts.id, id));
    return row;
  }

  async findOpportunityContact(opportunityId: number, contactId: number): Promise<OpportunityContact | undefined> {
    const [row] = await db.select().from(opportunityContacts)
      .where(and(eq(opportunityContacts.opportunityId, opportunityId), eq(opportunityContacts.contactId, contactId)));
    return row;
  }

  // Single primary per opportunity is enforced transactionally: setting a new
  // primary clears any existing one first.
  async createOpportunityContact(link: InsertOpportunityContact): Promise<OpportunityContact> {
    return await db.transaction(async (tx) => {
      if (link.isPrimary) {
        await tx.update(opportunityContacts).set({ isPrimary: false })
          .where(and(eq(opportunityContacts.opportunityId, link.opportunityId), eq(opportunityContacts.isPrimary, true)));
      }
      const [result] = await tx.insert(opportunityContacts).values(link).returning();
      return result;
    });
  }

  async updateOpportunityContact(id: number, updates: { role?: string | null; isPrimary?: boolean }): Promise<OpportunityContact> {
    return await db.transaction(async (tx) => {
      const [existing] = await tx.select().from(opportunityContacts).where(eq(opportunityContacts.id, id)).for("update");
      if (!existing) throw new Error("Opportunity contact not found");
      if (updates.isPrimary === true) {
        await tx.update(opportunityContacts).set({ isPrimary: false })
          .where(and(eq(opportunityContacts.opportunityId, existing.opportunityId), eq(opportunityContacts.isPrimary, true), ne(opportunityContacts.id, id)));
      }
      const [result] = await tx.update(opportunityContacts).set(updates).where(eq(opportunityContacts.id, id)).returning();
      return result;
    });
  }

  async deleteOpportunityContact(id: number): Promise<void> {
    await db.delete(opportunityContacts).where(eq(opportunityContacts.id, id));
  }

  // Used when an opportunity's customer changes: contacts from the previous
  // customer must never be silently retained.
  async deleteOpportunityContactsForOpportunity(opportunityId: number): Promise<number> {
    const deleted = await db.delete(opportunityContacts)
      .where(eq(opportunityContacts.opportunityId, opportunityId))
      .returning({ id: opportunityContacts.id });
    return deleted.length;
  }

  // Opportunity Status History
  async createOpportunityStatusHistory(history: InsertOpportunityStatusHistory): Promise<OpportunityStatusHistory> {
    const [result] = await db.insert(opportunityStatusHistory).values(history).returning();
    return result;
  }

  async getOpportunityStatusHistory(opportunityId: number): Promise<OpportunityStatusHistory[]> {
    return db.select().from(opportunityStatusHistory)
      .where(eq(opportunityStatusHistory.opportunityId, opportunityId))
      .orderBy(desc(opportunityStatusHistory.changedAt), desc(opportunityStatusHistory.id));
  }
}

export const storage = new DatabaseStorage();
export const authStorage = storage;
