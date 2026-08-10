import { z } from 'zod';
import { 
  insertProjectSchema, insertTaskSchema, insertEquipmentSchema, insertAllocationSchema,
  insertCustomerSchema, insertDailyReportSchema, insertMaintenanceLogSchema, insertCommunicationSchema,
  insertPhotoAlbumSchema, insertReportTaskSchema, insertLaborEntrySchema, insertEquipmentEntrySchema, insertDeliverySchema,
  insertScheduleEntrySchema, insertTodoSchema, insertTodoUpdateSchema, insertWorkflowRuleSchema,
  insertOpportunitySchema, insertOpportunityContactSchema, opportunityStatusChangeSchema,
  projects, tasks, equipment, allocations, customers, dailyReports, maintenanceLogs, communications, photoAlbums,
  reportTasks, laborEntries, equipmentEntries, deliveries, scheduleEntries, todos, workflowRules, notifications, activityLogs, projectStatusHistory,
  opportunities, opportunityStatusHistory,
  type TodoWithDetails, type MyWorkSummary, type WorkflowRuleWithDetails,
  type TodoUpdate, type TodoUpdateWithAuthor, type TodoUpdatesPage,
  type OpportunityWithDetails, type OpportunityContactWithDetails
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  // Customers
  customers: {
    list: {
      method: 'GET' as const,
      path: '/api/customers',
      responses: {
        200: z.array(z.custom<typeof customers.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/customers/:id',
      responses: {
        200: z.custom<typeof customers.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/customers',
      input: insertCustomerSchema,
      responses: {
        201: z.custom<typeof customers.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/customers/:id',
      input: insertCustomerSchema.partial(),
      responses: {
        200: z.custom<typeof customers.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/customers/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Projects
  projects: {
    list: {
      method: 'GET' as const,
      path: '/api/projects',
      responses: {
        200: z.array(z.custom<typeof projects.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/projects/:id',
      responses: {
        200: z.custom<typeof projects.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects',
      input: insertProjectSchema,
      responses: {
        201: z.custom<typeof projects.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/projects/:id',
      input: insertProjectSchema.partial(),
      responses: {
        200: z.custom<typeof projects.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/projects/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Tasks
  tasks: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/tasks',
      responses: {
        200: z.array(z.custom<typeof tasks.$inferSelect>()),
      },
    },
    getAll: {
      method: 'GET' as const,
      path: '/api/tasks',
      responses: {
        200: z.array(z.custom<typeof tasks.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/tasks',
      input: insertTaskSchema,
      responses: {
        201: z.custom<typeof tasks.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/tasks/:id',
      input: insertTaskSchema.partial(),
      responses: {
        200: z.custom<typeof tasks.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/tasks/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Equipment
  equipment: {
    list: {
      method: 'GET' as const,
      path: '/api/equipment',
      responses: {
        200: z.array(z.custom<typeof equipment.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/equipment/:id',
      responses: {
        200: z.custom<typeof equipment.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/equipment',
      input: insertEquipmentSchema,
      responses: {
        201: z.custom<typeof equipment.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/equipment/:id',
      input: insertEquipmentSchema.partial(),
      responses: {
        200: z.custom<typeof equipment.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/equipment/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Maintenance Logs
  maintenanceLogs: {
    list: {
      method: 'GET' as const,
      path: '/api/equipment/:equipmentId/maintenance',
      responses: {
        200: z.array(z.custom<typeof maintenanceLogs.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/equipment/:equipmentId/maintenance',
      input: insertMaintenanceLogSchema,
      responses: {
        201: z.custom<typeof maintenanceLogs.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/maintenance/:id',
      responses: {
        204: z.void(),
      },
    },
  },

  // Daily Reports
  dailyReports: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/reports',
      responses: {
        200: z.array(z.custom<typeof dailyReports.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/reports/:id',
      responses: {
        200: z.custom<typeof dailyReports.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/reports',
      input: insertDailyReportSchema,
      responses: {
        201: z.custom<typeof dailyReports.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/reports/:id',
      input: insertDailyReportSchema.partial(),
      responses: {
        200: z.custom<typeof dailyReports.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/reports/:id',
      responses: {
        204: z.void(),
      },
    },
  },

  // Communications
  communications: {
    list: {
      method: 'GET' as const,
      path: '/api/customers/:customerId/communications',
      responses: {
        200: z.array(z.custom<typeof communications.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/customers/:customerId/communications',
      input: insertCommunicationSchema.omit({ customerId: true }),
      responses: {
        201: z.custom<typeof communications.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/communications/:id',
      responses: {
        204: z.void(),
      },
    },
  },

  // Schedule Entries
  scheduleEntries: {
    list: {
      method: 'GET' as const,
      path: '/api/schedule-entries',
      responses: {
        200: z.array(z.custom<typeof scheduleEntries.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/schedule-entries/:id',
      responses: {
        200: z.custom<typeof scheduleEntries.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/schedule-entries',
      input: insertScheduleEntrySchema,
      responses: {
        201: z.custom<typeof scheduleEntries.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/schedule-entries/:id',
      input: insertScheduleEntrySchema.partial(),
      responses: {
        200: z.custom<typeof scheduleEntries.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/schedule-entries/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    allocations: {
      method: 'GET' as const,
      path: '/api/schedule-entries/:id/allocations',
      responses: {
        200: z.array(z.custom<typeof allocations.$inferSelect>()),
      },
    },
  },

  // Allocations
  allocations: {
    list: {
      method: 'GET' as const,
      path: '/api/allocations',
      responses: {
        200: z.array(z.custom<typeof allocations.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/allocations',
      input: insertAllocationSchema,
      responses: {
        201: z.custom<typeof allocations.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/allocations/:id',
      input: insertAllocationSchema.partial(),
      responses: {
        200: z.custom<typeof allocations.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/allocations/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Files
  files: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/files',
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/files',
      input: z.object({
        name: z.string(),
        folderId: z.number().nullable().optional(),
        objectPath: z.string(),
        contentType: z.string().optional(),
        size: z.number().optional(),
      }),
      responses: {
        201: z.custom<any>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/files/:id',
      responses: {
        204: z.void(),
      },
    },
  },

  // Folders
  folders: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/folders',
      responses: {
        200: z.array(z.custom<any>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/folders',
      input: z.object({
        name: z.string(),
        parentId: z.number().nullable().optional(),
      }),
      responses: {
        201: z.custom<any>(),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/folders/:id',
      responses: {
        204: z.void(),
      },
    },
  },

  // Photo Albums
  photoAlbums: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/albums',
      responses: {
        200: z.array(z.custom<typeof photoAlbums.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/projects/:projectId/albums',
      input: insertPhotoAlbumSchema.omit({ projectId: true }),
      responses: {
        201: z.custom<typeof photoAlbums.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/albums/:id',
      input: insertPhotoAlbumSchema.partial(),
      responses: {
        200: z.custom<typeof photoAlbums.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/albums/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Report Tasks
  reportTasks: {
    list: {
      method: 'GET' as const,
      path: '/api/reports/:reportId/tasks',
      responses: {
        200: z.array(z.custom<typeof reportTasks.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/reports/:reportId/tasks',
      input: insertReportTaskSchema.omit({ reportId: true }),
      responses: {
        201: z.custom<typeof reportTasks.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/report-tasks/:id',
      input: insertReportTaskSchema.partial(),
      responses: {
        200: z.custom<typeof reportTasks.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/report-tasks/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Labor Entries
  laborEntries: {
    list: {
      method: 'GET' as const,
      path: '/api/report-tasks/:reportTaskId/labor',
      responses: {
        200: z.array(z.custom<typeof laborEntries.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/report-tasks/:reportTaskId/labor',
      input: insertLaborEntrySchema.omit({ reportTaskId: true }),
      responses: {
        201: z.custom<typeof laborEntries.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/labor/:id',
      input: insertLaborEntrySchema.partial(),
      responses: {
        200: z.custom<typeof laborEntries.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/labor/:id',
      responses: {
        204: z.void(),
      },
    },
  },

  // Equipment Entries
  equipmentEntriesApi: {
    list: {
      method: 'GET' as const,
      path: '/api/report-tasks/:reportTaskId/equipment-entries',
      responses: {
        200: z.array(z.custom<typeof equipmentEntries.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/report-tasks/:reportTaskId/equipment-entries',
      input: insertEquipmentEntrySchema.omit({ reportTaskId: true }),
      responses: {
        201: z.custom<typeof equipmentEntries.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/equipment-entries/:id',
      input: insertEquipmentEntrySchema.partial(),
      responses: {
        200: z.custom<typeof equipmentEntries.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/equipment-entries/:id',
      responses: {
        204: z.void(),
      },
    },
  },

  // Todos (centralized action items)
  todos: {
    list: {
      method: 'GET' as const,
      path: '/api/todos',
      // Query params: assignedToUserId, projectId, status ('active' | todo status | 'all'), priority, due, today
      responses: {
        200: z.array(z.custom<TodoWithDetails>()),
      },
    },
    myWorkSummary: {
      method: 'GET' as const,
      path: '/api/todos/my-work-summary',
      // Query params: today (YYYY-MM-DD, client-local date)
      responses: {
        200: z.custom<MyWorkSummary>(),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/todos/:id',
      responses: {
        200: z.custom<TodoWithDetails>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/todos',
      input: insertTodoSchema.omit({ createdByUserId: true, source: true, workflowRuleId: true }),
      responses: {
        201: z.custom<typeof todos.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/todos/:id',
      input: insertTodoSchema.omit({ createdByUserId: true, source: true, workflowRuleId: true }).partial(),
      responses: {
        200: z.custom<typeof todos.$inferSelect>(),
        400: errorSchemas.validation,
        403: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    complete: {
      method: 'POST' as const,
      path: '/api/todos/:id/complete',
      responses: {
        200: z.custom<typeof todos.$inferSelect>(),
        403: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/todos/:id',
      responses: {
        204: z.void(),
        400: errorSchemas.validation,
        403: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },

  // Todo Updates — chronological notes / progress timeline on a todo
  todoUpdates: {
    list: {
      method: 'GET' as const,
      path: '/api/todos/:id/updates',
      // Query params: limit (default 25, max 200), offset
      responses: {
        200: z.custom<TodoUpdatesPage>(),
        403: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/todos/:id/updates',
      input: insertTodoUpdateSchema.pick({ body: true }),
      responses: {
        201: z.custom<TodoUpdateWithAuthor>(),
        400: errorSchemas.validation,
        403: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/todo-updates/:id',
      input: insertTodoUpdateSchema.pick({ body: true }),
      responses: {
        200: z.custom<TodoUpdate>(),
        400: errorSchemas.validation,
        403: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/todo-updates/:id',
      responses: {
        204: z.void(),
        403: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
  },

  // Notifications
  notifications: {
    list: {
      method: 'GET' as const,
      path: '/api/notifications',
      responses: {
        200: z.array(z.custom<typeof notifications.$inferSelect>()),
      },
    },
    unreadCount: {
      method: 'GET' as const,
      path: '/api/notifications/unread-count',
      responses: {
        200: z.object({ count: z.number() }),
      },
    },
    markRead: {
      method: 'POST' as const,
      path: '/api/notifications/:id/read',
      responses: {
        200: z.custom<typeof notifications.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    markAllRead: {
      method: 'POST' as const,
      path: '/api/notifications/read-all',
      responses: {
        200: z.object({ updated: z.number() }),
      },
    },
  },

  // Workflow Rules (admin)
  workflowRules: {
    list: {
      method: 'GET' as const,
      path: '/api/workflow-rules',
      responses: {
        200: z.array(z.custom<WorkflowRuleWithDetails>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/workflow-rules',
      input: insertWorkflowRuleSchema,
      responses: {
        201: z.custom<typeof workflowRules.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/workflow-rules/:id',
      input: z.custom<Partial<z.infer<typeof insertWorkflowRuleSchema>>>(),
      responses: {
        200: z.custom<typeof workflowRules.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/workflow-rules/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Project Activity (reusable activity log)
  activity: {
    listForProject: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/activity',
      responses: {
        200: z.array(z.custom<typeof activityLogs.$inferSelect>()),
      },
    },
  },

  // Project Status History
  projectStatusHistory: {
    list: {
      method: 'GET' as const,
      path: '/api/projects/:projectId/status-history',
      responses: {
        200: z.array(z.custom<typeof projectStatusHistory.$inferSelect>()),
      },
    },
  },

  // Users (approved users for assignee dropdowns)
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/users',
      responses: {
        200: z.array(z.object({
          id: z.string(),
          email: z.string().nullable(),
          firstName: z.string().nullable(),
          lastName: z.string().nullable(),
          profileImageUrl: z.string().nullable(),
          role: z.string(),
          isAuthorized: z.string(),
        })),
      },
    },
  },

  // Opportunities (Phase 4 — RFP / bidding foundation)
  opportunities: {
    list: {
      method: 'GET' as const,
      path: '/api/opportunities',
      // Query params: status, customerId, responsibleUserId, includeArchived ('true'), search
      responses: {
        200: z.array(z.custom<OpportunityWithDetails>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/opportunities/:id',
      responses: {
        200: z.custom<OpportunityWithDetails>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/opportunities',
      input: insertOpportunitySchema,
      responses: {
        201: z.custom<typeof opportunities.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      // Status is NOT accepted here — all status transitions go through changeStatus.
      // Changing customerId requires confirmRemoveContacts=true when contacts exist.
      path: '/api/opportunities/:id',
      input: insertOpportunitySchema.omit({ status: true }).partial().extend({
        confirmRemoveContacts: z.boolean().optional(),
      }),
      responses: {
        200: z.custom<typeof opportunities.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        409: errorSchemas.validation, // customer change needs confirmation
      },
    },
    changeStatus: {
      method: 'POST' as const,
      path: '/api/opportunities/:id/status',
      input: opportunityStatusChangeSchema,
      responses: {
        200: z.custom<typeof opportunities.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    archive: {
      method: 'POST' as const,
      path: '/api/opportunities/:id/archive',
      input: z.object({ archived: z.boolean() }),
      responses: {
        200: z.custom<typeof opportunities.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    statusHistory: {
      method: 'GET' as const,
      path: '/api/opportunities/:id/status-history',
      responses: {
        200: z.array(z.custom<typeof opportunityStatusHistory.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    activity: {
      method: 'GET' as const,
      path: '/api/opportunities/:id/activity',
      responses: {
        200: z.array(z.custom<typeof activityLogs.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    listForCustomer: {
      method: 'GET' as const,
      path: '/api/customers/:customerId/opportunities',
      responses: {
        200: z.array(z.custom<OpportunityWithDetails>()),
        404: errorSchemas.notFound,
      },
    },
  },

  // Opportunity Contacts (opportunity-specific role + primary flag)
  opportunityContacts: {
    list: {
      method: 'GET' as const,
      path: '/api/opportunities/:id/contacts',
      responses: {
        200: z.array(z.custom<OpportunityContactWithDetails>()),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/opportunities/:id/contacts',
      input: insertOpportunityContactSchema.omit({ opportunityId: true }),
      responses: {
        201: z.custom<OpportunityContactWithDetails>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/opportunity-contacts/:id',
      input: insertOpportunityContactSchema.pick({ role: true, isPrimary: true }).partial(),
      responses: {
        200: z.custom<OpportunityContactWithDetails>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/opportunity-contacts/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },

  // Deliveries
  deliveriesApi: {
    list: {
      method: 'GET' as const,
      path: '/api/reports/:reportId/deliveries',
      responses: {
        200: z.array(z.custom<typeof deliveries.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/reports/:reportId/deliveries',
      input: insertDeliverySchema.omit({ reportId: true }),
      responses: {
        201: z.custom<typeof deliveries.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/deliveries/:id',
      input: insertDeliverySchema.partial(),
      responses: {
        200: z.custom<typeof deliveries.$inferSelect>(),
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/deliveries/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
