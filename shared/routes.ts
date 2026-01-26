import { z } from 'zod';
import { 
  insertProjectSchema, insertTaskSchema, insertEquipmentSchema, insertAllocationSchema,
  insertCustomerSchema, insertDailyReportSchema, insertMaintenanceLogSchema, insertCommunicationSchema,
  projects, tasks, equipment, allocations, customers, dailyReports, maintenanceLogs, communications
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
      input: insertCommunicationSchema,
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
