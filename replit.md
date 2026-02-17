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
- **Document Management**: Supports grid/list views, automatic project folder generation, tagging, search, starring, multi-select batch operations, and drag-and-drop uploads.
- **Photo Management**: Organizes photos into albums, offers variable tile sizes, multi-select for bulk actions, and date-based grouping with EXIF data. Includes virtualized scrolling, cursor-based pagination, background image processing (thumbnails, WebP), BlurHash LQIP placeholders, client-side IndexedDB caching, and prefetching. Features tab-gated loading and smart thumbnail fallback for performance.
- **Daily Report Weather Integration**: Open-Meteo geocoding and weather APIs provide local weather conditions.
- **Daily Report Labor Integration**: Links to Fingercheck time tracking, allowing employees who punched into a project to be added to daily report tasks with role selection and hours input, validated against actual tracked hours.
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

## Recent Changes

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