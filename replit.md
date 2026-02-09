# SiteTech - Sitework Management Platform

## Overview

SiteTech is a comprehensive web-based sitework management platform for construction companies, designed to manage projects from bidding to completion. It integrates CRM, equipment tracking, and scheduling tools to streamline operations, enhance project oversight, and improve efficiency in the construction industry. Key capabilities include end-to-end project lifecycle management, customer relationship management, an operational dashboard, resource scheduling, equipment management, daily reporting with weather integration and signature capture, and robust document and photo management with PDF annotation.

## User Preferences

Preferred communication style: Simple, everyday language.

### UI/UX Requirements
- **Delete Confirmations**: Always show a confirmation dialog before deleting anything in the system (projects, tasks, customers, equipment, files, folders, etc.)
- **Mandatory Field Indicators**: Add a red asterisk (*) before the label of all mandatory/required fields in forms throughout the system

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript.
- **Routing**: Wouter.
- **State Management**: TanStack React Query for server state, custom hooks for specific domains.
- **Styling**: Tailwind CSS, custom CSS variables, and shadcn/ui (Radix UI).
- **Build Tool**: Vite.
- **Design Theme**: Dark slate blue with golden yellow accents (matching SiteTech logo).
- **Logo**: SiteTech logo saved at `client/src/assets/sitetech-logo.png` and `attached_assets/Logo_1770600587313.png`. Import via `@assets/Logo_1770600587313.png` in frontend code.

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
Key entities defined in `shared/schema.ts` include: Projects, Tasks, TaskStatusHistory, Equipment, Allocations, Customers, DailyReports (with sub-entries for tasks, labor, equipment, deliveries), Photos, and Files. All primary entities utilize soft deletes with a `deletedAt` timestamp.

### Specific Features
- **Address Autocomplete**: OpenStreetMap's Nominatim API with debounced search.
- **PDF Viewer**: iframe and canvas overlay for viewing and annotating PDFs. Annotations are stored locally and exportable.
- **Document Management**: Grid and list views, with automatic folder generation for new projects. Supports tagging, search, starring, multi-select batch operations (move files and folders, delete), drag-and-drop uploads with folder structure preservation, button-upload folder selection with structure preservation, and direct file downloads.
- **Photo Management**: Organizes photos into albums ("General" and "Daily Report Photos" by default), offers variable tile sizes, multi-select for bulk actions, and date-based grouping. Photos are sorted by EXIF `takenAt` date, with a fallback to `createdAt`. Includes client-side EXIF extraction, lazy loading, and a professional lightbox gallery.
- **Photo Library Performance Optimizations**: 
  - Virtualized scrolling using react-virtuoso for handling large photo collections
  - Cursor-based pagination API with AbortController support for request cancellation
  - Background image processing for thumbnail generation (150px grid, 600px medium) in WebP format
  - BlurHash LQIP placeholders for smooth loading
  - Client-side IndexedDB caching with automatic cleanup (100MB max, 7-day TTL)
  - Prefetching of upcoming images
  - Performance metrics logging (scroll FPS, image load times, time-to-first-thumbnails)
  - **Tab-gated loading**: Photos tab uses React.lazy() and Suspense for lazy loading - photo data is only fetched when the Photos tab is active, not when the project page loads
  - **Smart thumbnail fallback**: OptimizedPhotoCard uses a fallback hierarchy: thumbnailPath (150px) → mediumPath (600px) → objectPath (only for legacy photos uploaded before 2026-02-02). New photos never load full-resolution in grid view.
  - **Memoized date grouping**: Date grouping computations are memoized using useMemo in VirtualizedPhotoGrid
  - **AbortController cleanup**: Photo fetch requests are aborted when tab switches or component unmounts
- **Photo Library Debug & Performance Tools**:
  - Debug logging system (`client/src/lib/debugPerf.ts`) with DEBUG_PERF flag for route mount/unmount, viewer open/close, scroll locks, event listeners, pagination fetch, and rendered items
  - Health HUD overlay (`client/src/components/HealthHUD.tsx`) for dev mode showing render count, items loaded, overlay status, body overflow, and FPS
  - Scroll lock hook (`client/src/hooks/use-scroll-lock.ts`) with ref-counting for multiple overlays, proper cleanup on unmount and route change
- **Daily Report Weather Integration**: Open-Meteo geocoding and weather APIs for local weather conditions.
- **Signature Capture**: Freehand or typed signatures for completing daily reports.

### Project Communications (Email Integration)
- **Purpose**: Centralized, auditable view of all project-related email correspondence
- **Primary Method - Auto-Generated Project Emails (Mailgun Inbound Routing)**:
  - Each project gets an auto-generated email address: `{slug}-{id}@email.sitetechnj.com`
  - Email addresses are generated on project creation and backfilled for existing projects
  - Team members CC the project email on relevant correspondence; emails are automatically captured
  - Mailgun inbound route forwards to webhook at `/api/webhooks/inbound-email` which receives and processes emails
  - Webhook includes Mailgun signature verification (HMAC SHA256 using MAILGUN_API_KEY)
  - Attachments stored in Replit Object Storage under `email-attachments/{projectId}/{emailId}/`
  - Service: `server/services/inboundEmail.ts`
  - One-time setup required: Add domain in Mailgun, MX records for `email.sitetechnj.com` pointing to `mxa.mailgun.org` and `mxb.mailgun.org`, create Mailgun inbound route forwarding to webhook URL
  - Admin setup page: `/admin/email-setup` with step-by-step DNS and Mailgun instructions
- **Secondary Method - Outlook OAuth (Optional)**:
  - Projects can optionally connect to Outlook email accounts via OAuth for additional email sync
  - Backend: `server/services/outlook.ts` handles OAuth flow, token refresh, email sync via Microsoft Graph API
  - Configuration: Requires `OUTLOOK_CLIENT_ID`, `OUTLOOK_CLIENT_SECRET`, `OUTLOOK_TENANT_ID` environment variables
- **Classification**: Emails are automatically classified as internal/external based on whether the project's customer email is in the recipients list
- **Storage**: Tables - `projectEmailConnections` (OAuth tokens per project), `projectEmails` (synced email data with full-text search, `source` field tracks inbound vs outlook), `projectEmailAttachments` (attachment metadata)
- **Frontend**: `client/src/components/CommunicationsTab.tsx` - accessible via FloatingProjectTools "Communications" tab on project details page
- **Features**: Project email display with copy button, full-text search, internal/external filtering, HTML email rendering, attachment viewing and downloading

### Build System
- **Development**: Vite dev server with HMR.
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

## Photo Library Issue Root Causes & Fixes

### Root Causes Identified

1. **Navigation Blocking (Stuck UI)**
   - **Cause**: The Lightbox component was always mounted (controlled by `open` prop), causing it to continuously listen for events even when closed. Combined with the library's internal scroll lock, this could prevent navigation.
   - **Fix**: Changed Lightbox to conditional rendering (`{lightboxOpen && <Lightbox ... />}`) so it only mounts when open and fully unmounts when closed.

2. **Scroll Lock Leaks**
   - **Cause**: No explicit management of body.overflow when opening/closing overlays. If the lightbox or other overlays set overflow:hidden, it wasn't restored on route change or component unmount.
   - **Fix**: Created `useScrollLock` hook with ref-counting for multiple overlays, stores/restores original body.overflow, and cleans up on unmount AND route change.

3. **Event Listener Accumulation**
   - **Cause**: Scroll event listeners in VirtualizedPhotoGrid were added via scrollerRef callback but not properly cleaned up when the element changed or component unmounted.
   - **Fix**: Track scrollerElementRef and scrollHandlerRef, remove old listener before adding new one, cleanup all listeners on unmount.

4. **RequestAnimationFrame Loops**
   - **Cause**: Performance tracking used requestAnimationFrame loops that weren't cancelled on cleanup, causing multiple parallel animation frames.
   - **Fix**: Added `cancelAnimationFrame` call and `stopped` flag to ensure clean termination.

### Fingercheck Integration (Employee Sync)
- **Purpose**: Pull employee data from Fingercheck payroll/HR system into SiteTech
- **API**: Fingercheck REST API at `https://developer.fingercheck.com/api`
- **Authentication**: Uses `FINGERCHECK_API_KEY` and `FINGERCHECK_CLIENT_SECRET` secrets
- **Service**: `server/services/fingercheck.ts` — fetches and maps employee data
- **Database**: `fingercheck_employees` table with unique constraint on `employee_id`
- **Routes**: 
  - `GET /api/employees` — list all synced employees
  - `GET /api/employees/:id` — get single employee
  - `POST /api/employees/sync` — trigger sync from Fingercheck API
  - `DELETE /api/employees/:id` — delete employee (admin only)
- **Frontend**: `client/src/pages/Employees.tsx` — table view with search, status filtering, detail dialog, and sync button
- **Sidebar**: "Employees" nav item with HardHat icon

### Verification Checklist

- [ ] **Navigation works from library page**: After viewing photos and scrolling, clicking sidebar links should navigate immediately
- [ ] **Open/close viewer doesn't break app**: Opening lightbox, viewing photos, closing it should leave app responsive
- [ ] **Scrolling is smooth**: Photo grid should scroll without jank, FPS visible in Health HUD
- [ ] **CPU doesn't spike continuously**: After stopping interaction, CPU should return to idle
- [ ] **Health HUD shows healthy state**: body.overflow should be "auto" when no overlays open, overlays count should be 0
- [ ] **Debug logging appears in console**: With DEBUG_PERF enabled, route mount/unmount and viewer open/close should log