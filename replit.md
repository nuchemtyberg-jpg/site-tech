# SiteTech - Sitework Management Platform

## Overview

SiteTech is a comprehensive web-based sitework management platform for construction companies, built with React, Express, and PostgreSQL. It provides tools for managing construction projects through their full lifecycle (from bidding to completion), customer relationships, equipment inventory, and scheduling.

Core features include:
- **Projects**: Full lifecycle management from bidding to completion with customer linking
- **Customers**: Database with contact info and communication history
- **Dashboard**: Operational metrics and analytics charts
- **Scheduling**: Calendar view with task scheduling and equipment/manpower allocation
- **Equipment**: Inventory with location tracking, maintenance schedules, and repair logs

## User Preferences

Preferred communication style: Simple, everyday language.

### UI/UX Requirements
- **Delete Confirmations**: Always show a confirmation dialog before deleting anything in the system (projects, tasks, customers, equipment, files, folders, etc.)
- **Mandatory Field Indicators**: Add a red asterisk (*) before the label of all mandatory/required fields in forms throughout the system

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **State Management**: TanStack React Query for server state, with custom hooks per domain (projects, tasks, equipment)
- **Styling**: Tailwind CSS with custom CSS variables for theming, shadcn/ui component library using Radix UI primitives
- **Build Tool**: Vite with hot module replacement

The frontend follows a feature-based organization with pages in `client/src/pages/`, reusable hooks in `client/src/hooks/`, and UI components in `client/src/components/ui/`. The design uses a dark slate blue theme with safety orange accents appropriate for construction software.

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Design**: RESTful API with typed routes defined in `shared/routes.ts` using Zod schemas for validation
- **Database**: PostgreSQL with Drizzle ORM
- **Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple)

The server uses a storage abstraction layer (`server/storage.ts`) implementing the `IStorage` interface for database operations, making it testable and allowing for potential storage backend changes.

### Authentication
- **Provider**: Replit Auth (OpenID Connect)
- **Session Storage**: PostgreSQL-backed sessions
- **User Management**: Automatic user upsert on authentication via `authStorage`

Authentication is handled through `server/replit_integrations/auth/` with Passport.js and OpenID Connect strategy. Protected routes use the `isAuthenticated` middleware.

### Data Models
Main entities defined in `shared/schema.ts`:
- **Projects**: Core entity with projectNumber (auto-generated S-1000+), name, streetAddress, city, state, customerId, status, notes, and color
  - Status options: new, bidding, takeoff_done, proposal_sent, active, completed, bid_lost, archive
- **Tasks**: Belong to projects with title, description, dates, status, priority, and percentComplete (0-100%)
  - Percent complete uses 5% increments in the UI slider
  - Status auto-updates based on percent: 0% = pending, 1-99% = in_progress, 100% = completed
- **TaskStatusHistory**: Audit trail for task status and percent changes
  - Tracks previousStatus, newStatus, previousPercentComplete, newPercentComplete
  - Records changedByUserId and changedByName for attribution
  - API: GET /api/tasks/:id/history returns history entries ordered by date descending
- **Equipment**: Inventory items with type, status, and notes
- **Allocations**: Link equipment to projects for scheduling
- **Customers**: Customer information with name, company, contact details

### Address Autocomplete
The project creation form includes address autocomplete using OpenStreetMap's Nominatim API:
- Component: `client/src/components/AddressAutocomplete.tsx`
- No API key required (free service)
- Debounced search with AbortController for race condition handling
- Parses addresses into streetAddress, city, and state (with full state name to abbreviation conversion)

### Build System
- **Development**: Vite dev server with HMR proxied through Express
- **Production**: esbuild for server bundling, Vite for client build
- **Database Migrations**: Drizzle Kit with `db:push` command

## External Dependencies

### Database
- **PostgreSQL**: Primary database accessed via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management

### Authentication Services
- **Replit Auth**: OpenID Connect provider using `ISSUER_URL` environment variable
- **Session Secret**: Required `SESSION_SECRET` environment variable

### Key Libraries
- **@tanstack/react-query**: Server state management and caching
- **recharts**: Dashboard analytics charts
- **date-fns**: Date formatting and manipulation
- **react-day-picker**: Calendar component for scheduling
- **zod**: Runtime type validation for API inputs/outputs
- **drizzle-zod**: Integration between Drizzle schemas and Zod validation
- **pdf-lib**: PDF manipulation for exporting annotated PDFs
- **@uppy/core**, **@uppy/react**, **@uppy/xhr-upload**: File upload with drag-and-drop (max 50 files, 50MB each)

## PDF Viewer Architecture

The PDF viewer (`client/src/components/PDFViewer.tsx`) provides professional markup capabilities:

### Core Features
- **Rendering**: iframe + canvas overlay approach (not react-pdf or PDF.js)
- **Gestures**: Pinch-to-zoom (0.5x-6x), pan, double-tap to reset
- **Tools**: Pen, highlighter, rectangle, arrow, line, text annotation, eraser
- **Color/Thickness**: Configurable for all markup tools

### Annotation Persistence
- Annotations stored in localStorage keyed by PDF URL
- Auto-save on close via beforeunload handler
- Data structure: `{ paths: DrawPath[], shapes: ShapeAnnotation[], texts: TextAnnotation[] }`

### Undo/Redo Implementation
- Uses refs (`pathsRef`, `shapesRef`, `textsRef`, `historyRef`, `historyIndexRef`) to avoid stale closures
- Centralized `applyAnnotationChange` function handles all state mutations
- `isRestoringRef` prevents history recording during undo/redo operations
- All operations read from refs and update refs synchronously before setState

### PDF Export
- Uses pdf-lib to embed annotations into downloadable PDF
- Converts canvas drawings to image and overlays on PDF pages

### Limitations
- Annotations currently limited to first page only (multi-page support not implemented)
- Text annotations use native browser prompt for input

## Document Management

### Default Folder Structure
When a new project is created, the following folder structure is automatically generated:
- **Office/** (root folder)
  - Takeoffs
  - Proposals
  - **Billing/** (subfolder)
    - Change Orders
    - SOV
    - REQs & Invoices
- **Field/** (root folder)
  - Drawings
  - Permits & Legal
  - Submittals
  - RFI's

### View Modes
Documents can be displayed in two view modes (toggle available in Documents tab):
- **Grid View**: Files displayed as thumbnail cards grouped by upload date
  - Images show actual thumbnails
  - PDFs show red PDF icon with "PDF" label
  - Other files show generic file icon with file extension
  - File names displayed at bottom of each card
- **List View**: Files displayed in a traditional list format with icon, name, date, and size

### File Types
- **Images**: Displayed with actual image thumbnail in grid view, green image icon in list view
- **PDFs**: Opens in browser's native PDF viewer in new tab
- **Other files**: Download prompt with file info

## Photos Tab

The Photos tab provides a dedicated photo management experience for project photos with the following features:

### Photo Albums
- Create and delete albums to organize photos
- Album selector dropdown to filter photos by album
- Delete album confirmation dialog (photos are preserved, only album association removed)
- API endpoints: GET/POST `/api/projects/:projectId/albums`, PUT/DELETE `/api/albums/:id`

### View Options
- **Tile Size Toggle**: Three size options (small/medium/large) with grid icons
  - Small: 8 columns on large screens
  - Medium: 5 columns on large screens
  - Large: 3 columns on large screens

### Multi-Select Mode
- Toggle select mode with "Select" button
- Click photos to select/deselect (checkbox overlay appears)
- Selection actions bar appears when photos are selected:
  - Download: Downloads all selected photos
  - Share: Copies photo URLs to clipboard
  - Delete: Batch delete with confirmation dialog

### Date-Based Organization
- Photos sorted by date descending (newest first)
- Grouped by month with sticky month headers
- Grouped by day within each month
- Vertical date slider for quick month navigation (uses actual Date objects for locale-safe formatting)

### Photo Viewer
- Fullscreen viewer with dark overlay
- Previous/Next navigation buttons (ChevronLeft/ChevronRight)
- Photo counter showing "X of Y"
- Share, download, and close actions in bottom toolbar