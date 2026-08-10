# SiteTech - Sitework Management Platform

## Overview

SiteTech is a comprehensive web-based sitework management platform for construction companies, designed to manage projects from bidding to completion. Its primary purpose is to streamline operations, enhance project oversight, and improve efficiency in the construction industry through integrated CRM, equipment tracking, and scheduling tools. Key capabilities include end-to-end project lifecycle management, customer relationship management, an operational dashboard, resource scheduling, equipment management, daily reporting with weather integration and signature capture, and robust document and photo management with PDF annotation. The platform aims to provide a centralized solution for managing all aspects of sitework projects.

## User Preferences

Preferred communication style: Simple, everyday language.

### UI/UX Requirements
- **Delete Confirmations**: Always show a confirmation dialog before deleting anything in the system (projects, tasks, customers, equipment, files, folders, etc.)
- **Mandatory Field Indicators**: Add a red asterisk (*) before the label of all mandatory/required fields in forms throughout the system

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack React Query for server state.
- **Styling**: Tailwind CSS, custom CSS variables, and shadcn/ui (Radix UI).
- **Build Tool**: Vite.
- **Design Theme**: Dark slate blue with golden yellow accents.
- **Logo**: SiteTech logo located at `client/src/assets/sitetech-logo.png` and `attached_assets/Logo_1770600587313.png`.

### Backend Architecture
- **Framework**: Express.js with TypeScript.
- **API Design**: RESTful API with typed routes using Zod schemas.
- **Database**: PostgreSQL with Drizzle ORM.
- **Session Management**: Express sessions with PostgreSQL store.
- **Storage Layer**: Abstracted `IStorage` interface.

### Authentication
- **Provider**: Replit Auth (OpenID Connect).
- **Implementation**: Passport.js with OpenID Connect strategy and `isAuthenticated` middleware.
- **User Management**: Automatic user upsertion upon authentication.

### Data Models
Core entities, utilizing soft deletes with a `deletedAt` timestamp, include Projects, Tasks, Equipment, Allocations, ScheduleEntries, Customers, DailyReports, Photos, and Files.

### Specific Features
- **Address Autocomplete**: Utilizes OpenStreetMap's Nominatim API.
- **PDF Viewer**: iframe and canvas overlay for viewing and annotating PDFs.
- **Document Management**: Supports grid/list views, automatic project folder generation, tagging, search, starring, multi-select batch operations, and drag-and-drop uploads. Both drag-and-drop and Upload button use Replit Object Storage via presigned URLs for all document uploads. Includes a separate **Company Documents** manager (Admin > Documents at `/admin/documents`) that operates independently of projects, using `company_folders` and `company_files` tables with API routes under `/api/company-documents/`. A server-side proxy endpoint (`/api/proxy-file`) handles legacy files stored with external Cloudinary URLs. The `NativeFileUploader` component supports `uploadTarget` prop (`"cloudinary"` for photos, `"object-storage"` for documents).
- **Photo & Video Management**: Organizes photos and videos into albums, offers variable tile sizes, multi-select for bulk actions, and date-based grouping with EXIF data (images only). Includes virtualized scrolling, cursor-based pagination, background image processing (thumbnails, WebP), BlurHash LQIP placeholders, client-side IndexedDB caching, and prefetching. Features tab-gated loading and smart thumbnail fallback for performance. Videos upload via Cloudinary's video endpoint with auto-generated thumbnails and a play icon overlay; clicking a video opens a full-screen video player with navigation controls. The `photos` table includes a `mediaType` column (`"image"` or `"video"`) to distinguish media types.
- **Daily Report Weather Integration**: Open-Meteo geocoding and weather APIs provide local weather conditions.
- **Daily Report Labor Integration**: Links to Fingercheck time tracking, allowing employees who punched into a project to be added to daily report tasks with role selection and hours input, validated against actual tracked hours.
- **Fingercheck Time Tracking Display**: The Time Tracking tab on the Employees page renders one row per shift (each in/out pair). When an employee transfers from one job to another, the prior shift is closed at the transfer time and a new row begins with the transfer time as the new punch-in (marked with a "Transfer" badge). Duplicate consecutive In punches on the same job are collapsed (not split). Day totals appear once per (employee, date) group.
- **Daily Report Inspections**: Tracks inspection entries with type (Sewer removal, Demo, Recharge + custom), authority (Lakewood Township, Lakewood MUA + custom), inspector name, pass/fail status, and photos. Stored in `daily_report_inspection_entries` table. Photos linked via `inspection_entry_id` in `daily_report_photos`.
- **Signature Capture**: Enables freehand or typed signatures for daily reports.
- **Project Communications (Email Integration)**:
    - **Primary Method**: Each project receives an auto-generated email address (`{slug}-{id}@updates.sitetechnj.com`). Emails CC'd to this address are captured via a Mailgun inbound route webhook, with attachments stored in Replit Object Storage.
    - **Secondary Method**: Optional Outlook OAuth integration for syncing additional project emails via Microsoft Graph API.
    - **Features**: Centralized view of project emails, classification (internal/external), full-text search, HTML rendering, attachment handling.
- **Project Settings Page**: Accessible via gear icon in project header or floating tools. Contains Fingercheck job mapping and daily report recipient management.
- **Daily Report Auto-Email**: When a daily report is signed/completed, PDF is automatically emailed to configured recipients via Mailgun. Recipients managed in project settings via `project_daily_report_recipients` table.
- **RFI (Request for Information) Tool**: Facilitates creation, sending, and tracking of RFIs.
    - **Email Integration**: Sends RFIs via the user's Outlook account using the Replit Outlook Connector (Microsoft Graph API).
    - **PDF Generation**: PDFKit generates professional RFI documents.
    - **Workflow**: Draft, attach files, send (generates PDF, emails), track replies.
    - **Storage**: RFI attachments and generated PDFs are stored in Replit Object Storage.

### Build System
- **Development**: Vite dev server.
- **Production**: esbuild for server, Vite for client.
- **Database Migrations**: Drizzle Kit.

## External Dependencies

### Database
- **PostgreSQL**
- **Drizzle ORM**

### Authentication Services
- **Replit Auth**

### Key Libraries & APIs
- **@tanstack/react-query**: Server state management.
- **recharts**: Chart rendering.
- **date-fns**: Date manipulation.
- **react-day-picker**: Calendar component.
- **zod**: Schema validation.
- **drizzle-zod**: Drizzle ORM and Zod integration.
- **pdf-lib**: PDF manipulation.
- **Open-Meteo Geocoding API**: Address to coordinates.
- **Open-Meteo Weather API**: Weather information.
- **exifreader**: EXIF data extraction.
- **yet-another-react-lightbox**: Photo lightbox.
- **Mailgun**: Inbound email routing and daily report auto-email sending (domain: `updates.sitetechnj.com`).
- **Microsoft Graph API**: For Outlook email integration and RFI sending.
- **Fingercheck REST API**: Employee sync and time tracking data.

- **Admin Billing Tool**: Admin page at `/admin/billing` showing all 100% completed tasks across projects with completion dates, billing status tracking (`billedAt`, `billedBy` fields on tasks table), individual/bulk mark-as-billed, project grouping, filters (search, project, billed/unbilled), summary stats, and CSV export.

- **Schedule Feature**: Full-featured project scheduling with `schedule_entries` table. Users can schedule unfinished tasks to dates with working-day duration (Mon-Fri, optionally including Sunday). Responsive calendar views: monthly on desktop, weekly on mobile. Resource allocation (Fingercheck employees and equipment) per schedule entry via updated `allocations` table with `scheduleEntryId` and `employeeId` fields. CRUD operations with delete confirmations. Multi-day task span rendering across working days (skips Saturday, optionally includes Sunday). Project color coding on entries.

- **Progress Billing (G702/G703)**: AIA G702-style progress billing workflow in the admin Billing page, accessible via a "Progress Billing (G702)" tab alongside the existing task billing. Features include:
    - **Pay Applications**: Create, edit, delete, submit, and approve pay applications per project with auto-incrementing application numbers.
    - **G703 Continuation Sheet**: Line items editor that pulls tasks as schedule of values entries, tracking scheduled value, previously completed work, this period's work, and materials stored.
    - **G702 Summary Calculations**: Auto-calculates original contract sum, change orders, contract sum to date, total completed, retainage, total earned less retainage, previous certificates, current payment due, balance to finish, and percent complete.
    - **PDF Export**: Generates G702/G703 PDF documents via PDFKit (`/api/pay-application/:id/pdf`).
    - **Schema**: `pay_applications` table (applicationNumber, periodTo, contractDate, retainagePercent, status: draft/submitted/approved, etc.), `pay_application_items` table (taskId, scheduledValue, previouslyCompleted, thisPeriodsWork, materialsStored), `scheduledValue` field on tasks, `retainagePercent` field on projects.

- **Todos, My Work & Workflow Automation (Phase 1 platform)**: Reusable action-item infrastructure, separate from construction Tasks.
    - **Todos**: New `todos` entity (assignee, project link, generic `relatedEntityType`/`relatedEntityId` for future modules, due date, priority, status open/in_progress/completed/cancelled, source manual/workflow). Created from My Work (global) or a project's Todos tab via one reusable `TodoForm`. Quick-complete in one tap; completed todos are never deleted (server rejects) and stay visible via the Completed filter. Permissions: creators/admins/managers edit everything; pure assignees may only change status. Read scope: regular users see their own todos plus project-scoped lists; cross-user and unscoped "all todos" queries require admin/manager; personal (no-project) todos are visible only to creator/assignee/managers. Assignees (manual, reassignment, and workflow rules) must be approved users — the workflow engine skips rules whose assignee lost access and flags it in the activity feed instead of creating work.
    - **Todo Updates (notes timeline)**: `todo_updates` table — chronological progress notes on a todo, separate from the description (description = what to do; updates = what happened). Updates section lives inside the todo edit dialog (`TodoUpdates.tsx`): newest first, add box on top, "Show older updates" pagination (25/page), author + timestamp automatic, "Edited" marker via `editedAt`, soft-delete removal. Anyone who can view the todo can add updates (including status-only assignees, and on completed todos); only the author or an admin can edit/remove one. Adding an update logs activity ("X added an update to …" — no note text) and sends an in-app notification to the assignee (never for self-updates, no email). Todo cards show a 💬 count (`updateCount` on `TodoWithDetails`); notification clicks deep-link with `?todo=<id>`, which My Work and the project Todos tab read to auto-open that todo's dialog.
    - **My Work** (`/my-work`): Per-user dashboard with clickable Overdue / Due Today / Upcoming / Open summary cards, quick filters (All Open, Overdue, Today, This Week, Next 7 Days), grouped lists, and a Completed toggle. Date bucketing uses the client's local date (`today`/`clientDate` query params).
    - **Notifications**: `notifications` table + header bell (desktop sidebar and mobile top bar) with unread badge (30s poll), recent list, mark read / mark all read, click-through to the related project. Created on todo assignment/reassignment (skipped for self-assignment) and by workflow rules.
    - **Workflow Rules** (`/admin/workflows`, admin-only): "When project status changes to X → assign a todo to Y" with title/description/priority, due offset (immediately / within N days / none), in-app + email toggles, active switch, and an inactive-assignee warning. Canonical status list lives in `shared/projectStatus.ts` (used by client dropdowns and server validation).
    - **Workflow engine**: Project status transitions are detected in `storage.updateProjectWithStatusTracking` (row-locked transaction) and handled by `server/services/workflowEngine.ts`. Exactly-once execution is enforced by a unique index on `workflow_executions (workflow_rule_id, status_history_id)` — re-saves, refreshes, and concurrent updates never duplicate todos. Transitions are recorded in `project_status_history`.
    - **Workflow email**: `server/services/workflowMailer.ts` sends via Mailgun (same pattern as daily-report mailer), non-blocking after the response, only when the rule enables email.
    - **Activity log**: Reusable `activity_logs` table + `server/services/activityLog.ts` (actor or "System"). Project Activity tab shows chronological business events (status changes, todo lifecycle, workflow actions) grouped by day.
    - **Verification scripts**: `scripts/test-workflow-engine.ts` (storage/engine level) and `scripts/test-http-api.ts` (authenticated HTTP, forged session) create temp data, assert behavior incl. duplicate prevention, and clean up.

## Recent Changes

### 2026-08-10: Todos, My Work & Workflow Automation (Phase 1)
- **New tables**: `todos`, `workflow_rules`, `workflow_executions` (unique per rule+status-history row), `project_status_history`, `notifications`, `activity_logs`.
- **Shared status source of truth**: `shared/projectStatus.ts` (9 canonical project statuses) replaces duplicated client constants; server validates `insertProjectSchema.status` against it.
- **New pages/components**: `MyWork.tsx`, `WorkflowRules.tsx`, `ProjectTodosTab.tsx`, `ProjectActivityTab.tsx`, `TodoForm.tsx`, `TodoItem.tsx`, `NotificationBell.tsx`; nav additions (My Work, Admin > Workflows) and project tabs (Todos, Activity).
- **Todo Updates addendum (same day)**: `todo_updates` table; endpoints `GET/POST /api/todos/:id/updates`, `PUT/DELETE /api/todo-updates/:id` (author-or-admin, soft delete); `TodoUpdates.tsx` timeline embedded in the todo dialog; 💬 `updateCount` on todo lists; `todo_update` notifications to the assignee (skip self); `?todo=<id>` deep-link auto-opens the todo from the bell; HTTP test suite extended with 18 update permission/notification checks.
- **Untouched**: existing construction Tasks feature and RFI tool.

### 2026-02-17: Schedule Feature
- **New `schedule_entries` table**: `taskId`, `projectId`, `startDate`, `duration`, `includeSunday`, `notes`, `createdBy`, soft delete.
- **Updated `allocations` table**: Added `scheduleEntryId` and `employeeId` columns to link allocations to schedule entries and Fingercheck employees.
- **API routes**: Full CRUD for schedule entries (`/api/schedule-entries`), plus allocations by schedule entry.
- **Schedule page**: Responsive monthly/weekly calendar, add/edit/delete dialogs, resource allocation dialog, multi-day working-day spans.

### 2026-02-16: Mailgun Email Configuration & Auto-Email Fix
- **Switched from SendGrid to Mailgun** for all outbound email (daily report auto-email). Removed `@sendgrid/mail` dependency.
- **Renamed** `server/services/sendgridHelper.ts` to `server/services/dailyReportMailer.ts` with Mailgun REST API implementation using native `fetch` and `FormData` with `File` attachment for PDF.
- **Mailgun Configuration**: Domain is `updates.sitetechnj.com`, from address is `reports@updates.sitetechnj.com`. Secrets: `MAILGUN_API_KEY`, `MAILGUN_FROM_EMAIL`. Env var: `MAILGUN_DOMAIN`.
- **Fixed auto-email PDF fetch 401 error**: The server was fetching the PDF from the external production URL (`APP_BASE_URL`), which caused authentication failures. Changed to use loopback address (`http://127.0.0.1:PORT`) for self-fetch since the server calls its own PDF endpoint. The user's session cookie is forwarded for auth.
- **Project Daily Report Recipients**: `project_daily_report_recipients` table with CRUD operations. Recipients have email (required) and name (optional), with soft delete support. Managed in Project Settings page.
- **Project Settings Page**: Accessible via gear icon in project header or floating tools. Contains Fingercheck job mapping and daily report recipient management sections.