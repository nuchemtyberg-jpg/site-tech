# SiteTech - Sitework Management Platform

## Overview


SiteTech is a comprehensive web-based sitework management platform designed for construction companies. It facilitates the management of construction projects through their entire lifecycle, from bidding to completion, and includes robust tools for customer relationship management, equipment inventory tracking, and scheduling. The platform aims to streamline operations, enhance project oversight, and improve efficiency in the construction industry.

Key capabilities include:
- **Project Lifecycle Management**: End-to-end management of projects, integrated with customer data.
- **Customer Relationship Management**: Centralized database for customer information and communication history.
- **Operational Dashboard**: Provides key metrics and analytical insights into ongoing operations.
- **Resource Scheduling**: Calendar-based scheduling for tasks, equipment, and manpower allocation.
- **Equipment Management**: Inventory tracking, location monitoring, and maintenance scheduling for equipment.
- **Daily Reporting**: Field reporting features with weather integration, task tracking, labor/equipment resource logging, and delivery management.
- **Document Management**: Organized storage and retrieval of project-related documents with distinct view modes.
- **Photo Management**: Dedicated tab for organizing project photos into albums, with various viewing options and multi-select functionality.
- **PDF Viewer with Annotation**: Professional-grade PDF viewing with markup tools for annotations, persistence, and export.

## User Preferences

Preferred communication style: Simple, everyday language.

### UI/UX Requirements
- **Delete Confirmations**: Always show a confirmation dialog before deleting anything in the system (projects, tasks, customers, equipment, files, folders, etc.)
- **Mandatory Field Indicators**: Add a red asterisk (*) before the label of all mandatory/required fields in forms throughout the system

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter for client-side navigation.
- **State Management**: TanStack React Query for server state, complemented by custom hooks for specific domains.
- **Styling**: Tailwind CSS for utility-first styling, custom CSS variables for theming, and shadcn/ui component library built on Radix UI primitives.
- **Build Tool**: Vite, providing fast development with Hot Module Replacement.
- **Design Theme**: Dark slate blue with safety orange accents, suitable for industrial applications.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful API with typed routes defined using Zod schemas for robust validation.
- **Database**: PostgreSQL, accessed via Drizzle ORM for type-safe interactions.
- **Session Management**: Express sessions with a PostgreSQL-backed store (`connect-pg-simple`).
- **Storage Layer**: An abstraction layer (`server/storage.ts`) implementing an `IStorage` interface to ensure modularity and testability.

### Authentication
- **Provider**: Replit Auth (OpenID Connect).
- **Implementation**: Passport.js with OpenID Connect strategy, secured with `isAuthenticated` middleware for protected routes.
- **User Management**: Automatic user upsertion upon successful authentication.

### Data Models
Key entities are defined in `shared/schema.ts`:
- **Projects**: Manages project details, status (e.g., bidding, active, completed), and customer association.
- **Tasks**: Project-specific tasks with status (pending, in_progress, completed) and percent complete tracking, updated in 5% increments.
- **TaskStatusHistory**: Audits changes to task status and progress, including user attribution.
- **Equipment**: Inventory details including type, status, and notes.
- **Allocations**: Links equipment to specific projects for scheduling.
- **Customers**: Stores customer contact and company information.
- **DailyReports**: Comprehensive daily field reports including weather data, task entries, labor and equipment logs, and delivery information. Reports transition from `draft` to `completed` with signature capture.
- **DailyReportTaskEntries**: Records tasks associated with daily reports, including a snapshot of the task title and progress.
- **DailyReportLaborLines / DailyReportEquipmentLines**: Detailed logs of labor and equipment usage per task entry within daily reports.
- **DailyReportDeliveryEntries**: Tracks deliveries, including vendor, time, description, and status (all delivered/missing items).

### Specific Features
- **Address Autocomplete**: Utilizes OpenStreetMap's Nominatim API for address lookup in project creation, featuring debounced search and race condition handling.
- **PDF Viewer**: Renders PDFs using an iframe and canvas overlay, offering annotation tools (pen, highlighter, shapes, text) with configurable properties. Annotations are stored in `localStorage` and can be exported to PDF.
- **Document Management**: Supports grid and list views for documents, with automatic folder generation for new projects (e.g., Office/, Field/).
- **Photo Management**: Organizes photos into albums, offers variable tile sizes, multi-select for bulk actions (download, share, delete), and date-based grouping. Photos are sorted by their taken date (from EXIF metadata) when available, falling back to upload date otherwise.
- **Daily Report Weather Integration**: Integrates with Open-Meteo geocoding API to fetch and display local weather conditions for daily reports.
- **Signature Capture**: Enables freehand (canvas-based) or typed signatures for completing daily reports, rendering them read-only.

### Build System
- **Development**: Vite dev server with HMR, proxied via Express.
- **Production**: esbuild for server bundling, Vite for client-side build.
- **Database Migrations**: Drizzle Kit for schema management.

## External Dependencies

### Database
- **PostgreSQL**: The primary relational database.
- **Drizzle ORM**: Used for interacting with the PostgreSQL database.

### Authentication Services
- **Replit Auth**: OpenID Connect provider for user authentication.

### Key Libraries & APIs
- **@tanstack/react-query**: For server state management and data caching.
- **recharts**: For rendering analytical charts on the dashboard.
- **date-fns**: Comprehensive utility library for date manipulation.
- **react-day-picker**: A flexible calendar component.
- **zod**: Schema declaration and validation library.
- **drizzle-zod**: Integration between Drizzle ORM and Zod for type validation.
- **pdf-lib**: For programmatic PDF creation and modification (used for embedding annotations).
- **Open-Meteo Geocoding API**: For converting addresses to geographical coordinates (used in daily reports).
- **Open-Meteo Weather API**: For fetching weather information (used in daily reports).

## Recent Architectural Changes

### Soft Deletes (January 2026)
All primary entities now use soft deletes instead of hard deletes:
- **Implementation**: Added `deletedAt` timestamp column to all tables that support deletion (customers, projects, tasks, equipment, maintenance_logs, daily_reports, folders, files, photo_albums, communications, allocations, daily_report_task_entries, daily_report_labor_lines, daily_report_equipment_lines, daily_report_delivery_entries, daily_report_photos)
- **Storage Layer**: All `delete*` methods now perform `UPDATE SET deletedAt = NOW()` instead of `DELETE`
- **Queries**: All `get*` methods filter records with `WHERE deletedAt IS NULL` to exclude soft-deleted items
- **Benefits**: Data can be recovered if needed, maintains referential integrity, provides audit trail
- **Note**: Legacy deprecated tables (report_tasks, labor_entries, equipment_entries, deliveries, delivery_photos, report_task_photos) still use hard deletes for backwards compatibility

### Native File Uploader (January 2026)
Replaced the Uppy-based file upload system with a native file picker:
- **Component**: `client/src/components/NativeFileUploader.tsx`
- **Features**: Uses native HTML file input with custom Dialog UI, progress tracking, multi-file support
- **API**: Simpler callback interface - `onUploadComplete` receives array of `{name, objectPath, size, type}`
- **Usage**: Used in ProjectDetails.tsx for document uploads and photo uploads, and in DailyReportPage.tsx for photo uploads

### Document Tags (January 2026)
Added tagging functionality to all uploaded documents:
- **Schema**: `files.tags` column as PostgreSQL text array
- **API**: PUT `/api/files/:id` endpoint accepts `tags` field for updates
- **UI Components**:
  - `TagInput` component (`client/src/components/TagInput.tsx`) - reusable tag input with keyboard support
  - Tags displayed on file cards in both grid and list views
  - Edit tags dialog accessible via Tags button on each file
- **Features**: Press Enter or comma to add tags, click X to remove, tags stored as lowercase strings

### Separate Photos and Documents Storage (January 2026)
Photos and documents are now stored in completely separate database tables:
- **Photos Table**: New `photos` table stores all project photos with fields: `id`, `projectId`, `albumId`, `name`, `objectPath`, `contentType`, `size`, `takenAt`, `createdAt`, `deletedAt`
- **Files Table**: The `files` table now exclusively stores documents with fields: `id`, `projectId`, `folderId`, `name`, `objectPath`, `contentType`, `size`, `tags`, `createdAt`, `deletedAt`
- **API Endpoints**:
  - Photos: `GET /api/projects/:projectId/photos`, `POST /api/projects/:projectId/photos`, `DELETE /api/photos/:id`
  - Files: `GET /api/projects/:projectId/files`, `POST /api/projects/:projectId/files`, `DELETE /api/files/:id`
- **Hooks**: `client/src/hooks/use-photos.ts` provides `useProjectPhotos`, `useCreatePhoto`, `useDeletePhoto`
- **Benefits**: Complete separation ensures photos and documents don't interfere with each other

### Default Photo Albums (January 2026)
All projects automatically receive two default photo albums:
- **General**: For photos uploaded directly through the Photos tab
- **Daily Report Photos**: For photos uploaded through the Daily Reports tool (one per project)
- **Auto-Creation**: When a new project is created, both albums are automatically created via `ensureDefaultAlbums()`
- **Routing**:
  - Photos uploaded via Photos tab → assigned to "General" album (via `getOrCreateGeneralAlbum`)
  - Photos uploaded via Daily Reports → assigned to "Daily Report Photos" album (via `getOrCreateDailyReportAlbum`)
- **Storage Methods**: `getOrCreateGeneralAlbum()`, `getOrCreateDailyReportAlbum()`, `ensureDefaultAlbums()`

### Photo Gallery Enhancements (January 2026)
Enhanced photo viewing experience with EXIF extraction, lazy loading, and professional lightbox:
- **EXIF Extraction**: Client-side extraction of photo taken date using `exifreader` library during upload
  - Extracts `DateTimeOriginal` or `CreateDate` from EXIF metadata
  - Stored in `photos.takenAt` field; falls back to upload date (`createdAt`) if unavailable
  - Implementation in `NativeFileUploader.tsx` via `extractExifDate()` function
- **Lazy Loading**: Photo gallery images use `loading="lazy"` attribute for improved page load performance
- **Lightbox Gallery**: Uses `yet-another-react-lightbox` for professional fullscreen photo viewing
  - Respects album filtering (only shows photos from current album)
  - Keyboard navigation and swipe gestures supported
  - State managed via `lightboxPhotos`, `lightboxIndex`, and `lightboxOpen`
- **Photo Sorting**: Photos sorted by `takenAt` date (when available) with fallback to `createdAt`