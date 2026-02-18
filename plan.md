# SiteTech - Construction Management Platform

## Project Overview

SiteTech is a comprehensive web-based sitework management platform designed for construction companies. It facilitates the management of construction projects through their entire lifecycle, from bidding to completion, and includes robust tools for customer relationship management, equipment inventory tracking, scheduling, and team collaboration.

**Live URL**: https://sitetech-app.replit.app

---

## Development Progress

### Completed Features

#### Phase 1: Core Infrastructure
- [x] React 18 + TypeScript frontend with Vite
- [x] Express.js + TypeScript backend
- [x] PostgreSQL database with Drizzle ORM
- [x] Dark slate blue theme with safety orange accents
- [x] Responsive sidebar navigation
- [x] shadcn/ui component library integration

#### Phase 2: Authentication & Security
- [x] Replit Auth (OpenID Connect) integration
- [x] Passport.js implementation with OIDC strategy
- [x] PostgreSQL-backed session management
- [x] Protected route middleware (`isAuthenticated`)
- [x] Invite-only user system with role-based access control
- [x] Centralized authorization middleware (`isAuthorizedUser`)
- [x] Owner email auto-approval system
- [x] Pending access page for unauthorized users

#### Phase 3: User Management System
- [x] Admin-only User Management page
- [x] Authorized Email List management
- [x] Role-based permissions (Admin, Manager, User)
- [x] Add/remove authorized users
- [x] Mailgun email integration for invites
- [x] Professional HTML email templates with SiteTech branding
- [x] Production URL in email invite links
- [x] User approval workflow

#### Phase 4: Project Management
- [x] Project list view with grid/card layout
- [x] Project details page with tabbed interface
- [x] Project status workflow (new, bidding, proposal_sent, active, completed, on_hold, cancelled)
- [x] Custom color coding per project
- [x] Address autocomplete via OpenStreetMap Nominatim API
- [x] Customer association with projects

#### Phase 5: Task & Schedule Management
- [x] Task creation with title, description, dates, priority
- [x] Progress tracking (0-100% in 5% increments)
- [x] Automatic status updates based on progress
- [x] Task status history with user attribution
- [x] Priority levels (Low, Medium, High)
- [x] Gantt chart schedule view with fixed 40px column widths and 280px sidebar
- [x] Schedule entries with working-day durations (Mon-Fri, optional Sunday)
- [x] Multi-day task bar rendering spanning working days (skips weekends)
- [x] Project color coding on scheduled task bars
- [x] Resource allocation (Fingercheck employees and equipment) per schedule entry
- [x] Drag-and-drop to move scheduled tasks
- [x] Collapsible unscheduled tasks panel (right side)
- [x] Weekly list view alternative
- [x] Full page width layout for schedule route
- [x] Horizontal scrolling with synchronized header/body scroll

#### Phase 6: Equipment Management
- [x] Equipment inventory tracking
- [x] Equipment types, make, model, year, serial number
- [x] Status tracking (Available, In Use, Maintenance)
- [x] Location monitoring
- [x] Maintenance scheduling
- [x] Project allocations

#### Phase 7: Customer Management
- [x] Customer database with contact info
- [x] Company details and notes
- [x] Project association tracking
- [x] Customer details page

#### Phase 8: Document Management
- [x] Hierarchical folder structure per project
- [x] Auto-created default folders (Office/, Field/ with subfolders)
- [x] File upload via Uppy to object storage
- [x] Grid and list view modes
- [x] PDF viewer with annotation tools
- [x] Annotation persistence in localStorage
- [x] PDF export with embedded annotations

#### Phase 9: Photo Management
- [x] Album-based organization (separate from documents)
- [x] Auto-created "General" album for Photos tab
- [x] Auto-created "Daily Report Photos" album for daily reports
- [x] EXIF date extraction for photo sorting (takenAt field)
- [x] Date-based grouping headers (month/day)
- [x] Variable tile sizes (Small, Medium, Large)
- [x] Multi-select for bulk actions
- [x] Download, share, delete bulk operations
- [x] Professional lightbox gallery (yet-another-react-lightbox)
- [x] Keyboard navigation and swipe gestures
- [x] Album-aware lightbox (respects current album filter)
- [x] Lazy loading for improved performance

#### Phase 10: Daily Reports
- [x] Comprehensive field reporting
- [x] Weather integration via Open-Meteo API
- [x] Task entries with progress snapshots
- [x] Labor line logging per task
- [x] Equipment usage logging per task
- [x] Delivery tracking with vendor/status
- [x] Draft → Completed workflow
- [x] Signature capture (freehand or typed)
- [x] PDF export with optional photos
- [x] Daily Report Photos album integration

#### Phase 11: Dashboard
- [x] Key metrics overview
- [x] Analytics charts using Recharts
- [x] Quick access navigation

#### Phase 12: Fingercheck Integration (Employee Sync)
- [x] Fingercheck REST API integration (GetAllEmployees endpoint)
- [x] Employee data sync with upsert pattern (no duplicates)
- [x] Database table with unique constraint on employee_id
- [x] Data cleaning (whitespace trimming, empty phone filtering)
- [x] Status detection (Active "A" / Terminated "T" / by termination date)
- [x] Employees page with table view, search, and status filtering
- [x] Employee detail dialog with full contact/employment info
- [x] Robust error handling with user-friendly messages (401/403/invalid response)
- [x] Sidebar navigation with HardHat icon

---

## Current Features Detail

### 1. Authentication & User Management

**Invite-Only Access System**
- Only pre-authorized email addresses can access the system
- Admins manage the authorized email list via User Management page
- Owner email (nuchemtyberg@gmail.com) auto-approved as admin on first login
- Unauthorized users see a "Pending Access" page with contact instructions

**Role-Based Permissions**
| Role | Permissions |
|------|-------------|
| Admin | Full access, manage users, authorize emails |
| Manager | Project management, reports, limited admin |
| User | View and update assigned projects/tasks |

**Email Invitations**
- Mailgun API integration for sending invites
- Professional HTML email template with SiteTech branding
- Dark slate blue design with orange accent CTA button
- Includes role information and login instructions
- Links to production app URL

### 2. Project Management
- **Project List View**: Grid/card layout with status indicators and color coding
- **Project Details**: Tabbed interface (Overview, Schedule, Documents, Photos, Daily Reports)
- **Status Workflow**: new → bidding → proposal_sent → active → completed/on_hold/cancelled
- **Address Autocomplete**: OpenStreetMap Nominatim API with debounced search

### 3. Task/Schedule Management
- **Task Fields**: Title, description, scheduled date, due date, priority, status
- **Progress**: 0-100% with 5% increment controls
- **Auto-Status**: Automatically updates status based on percent complete
- **History Audit**: Records all status/progress changes with timestamps

### 4. Equipment Management
- **Inventory Fields**: Name, type, make, model, year, serial number
- **Status Options**: Available, In Use, Maintenance
- **Location Tracking**: Current location and project assignments
- **Maintenance**: Service date logging and next service scheduling

### 5. Document Management
- **Folder Structure**: Office/ and Field/ with subfolders (Takeoffs, Proposals, Drawings, etc.)
- **Upload**: Native file uploader with drag-and-drop and folder upload support (preserves folder hierarchy)
- **Move Feature**: Hierarchical folder picker with breadcrumb navigation, cycle prevention
- **PDF Viewer**: Annotation tools (pen, highlighter, shapes, text, eraser)
- **Export**: Save annotated PDFs
- **Mobile Optimizations**:
  - Sticky header with search, view toggles, and action buttons
  - List view default on mobile, grid view on desktop
  - File names truncate properly (no horizontal scroll)
  - Dropdown menu (⋮) for file actions on mobile
  - Star button always visible on right side
  - Tags hidden on mobile to save space

### 6. Photo Management
- **Album System**: Flat album structure (not hierarchical folders)
- **EXIF Support**: Extracts photo taken date for sorting
- **Bulk Actions**: Multi-select mode for download, share, delete
- **Tile Sizes**: Adjustable grid density

### 7. Daily Reports
- **Weather**: Auto-fetched via Open-Meteo based on project location
- **Task Logging**: Select tasks, log progress changes with custom TimePicker component
- **Labor/Equipment**: Detailed resource logging per task
- **Deliveries**: Track vendor deliveries with status (up to 50 photos per upload)
- **Signatures**: Complete reports with freehand or typed signature (embedded in PDF)
- **PDF Export**: Generate professional PDF reports with 2-column photo grid layout

### 8. Dashboard
- **Metrics**: Active projects, pending tasks, equipment status
- **Charts**: Visual analytics using Recharts
- **Quick Actions**: Navigate to key sections

### 9. Employee Management (Fingercheck Integration)
- **Sync**: One-click sync pulls all employees from Fingercheck payroll/HR system
- **Employee Table**: Searchable, filterable list with name, email, title, status, hire date
- **Status Filtering**: Filter by Active, Terminated, or All employees
- **Detail View**: Click any employee to see full contact info, employment details, and address
- **Data Cleaning**: Trims whitespace, removes empty phone placeholders, normalizes status codes
- **Upsert Pattern**: Re-syncing updates existing records without creating duplicates

---

## Technical Architecture

### Frontend Stack
| Technology | Purpose |
|------------|---------|
| React 18 + TypeScript | UI Framework |
| Vite | Build tool with HMR |
| Wouter | Client-side routing |
| TanStack React Query | Server state management |
| Tailwind CSS | Utility-first styling |
| shadcn/ui + Radix UI | Component library |
| Native File Uploader | File uploads to object storage |
| Recharts | Dashboard charts |
| date-fns | Date manipulation |
| pdf-lib | PDF annotation export |
| exifreader | EXIF metadata extraction |
| yet-another-react-lightbox | Photo gallery lightbox |
| TimePicker (custom) | Hour/minute/AM-PM time selection |

### Backend Stack
| Technology | Purpose |
|------------|---------|
| Express.js + TypeScript | API server |
| PostgreSQL | Primary database |
| Drizzle ORM | Type-safe database access |
| Zod | Schema validation |
| Passport.js | Authentication (OIDC) |
| connect-pg-simple | Session storage |
| Mailgun API | Email delivery |
| Cloudinary | Photo storage & transformations |

### Key Data Models

```
Users
├── id, email, firstName, lastName
├── role (admin/manager/user)
├── isAuthorized (approved/pending/denied)
├── profileImageUrl
└── createdAt, updatedAt

AuthorizedEmails
├── id (UUID), email, role
├── addedBy (FK to Users), addedByName
└── createdAt

Projects
├── id, projectNumber, name, description
├── customerId (FK to Customers)
├── address fields (streetAddress, city, state, zip)
├── status, estimatedValue, color
└── startDate, endDate

Tasks
├── id, projectId (FK to Projects)
├── title, description, scheduledDate, dueDate
├── status (pending/in_progress/completed)
├── priority (low/medium/high)
└── percentComplete (0-100)

Files (Documents & Photos)
├── id, projectId (FK to Projects)
├── folderId (FK to Folders) - for documents
├── albumId (FK to PhotoAlbums) - for photos
├── name, objectPath, contentType, size
└── takenAt (EXIF date for photos)

DailyReports
├── id, projectId (FK to Projects)
├── date, weatherConditions, temperature
├── status (draft/completed)
├── signature, signatureType
└── notes, createdBy

Equipment
├── id, name, type, make, model, year
├── serialNumber, status, currentLocation
├── assignedProjectId
└── lastServiceDate, nextServiceDate

Customers
├── id, name, company, email, phone
├── address, city, state, zip
└── notes, createdAt
```

### API Endpoints

```
Authentication:
GET  /api/auth/user              - Current user info
GET  /api/login                  - Initiate OIDC login
POST /api/logout                 - Logout

Admin/User Management:
GET    /api/admin/users          - List all users
GET    /api/admin/authorized-users - List authorized emails
POST   /api/admin/authorized-users - Add authorized email (sends invite)
DELETE /api/admin/authorized-users/:id - Remove authorized email

Projects:
GET    /api/projects             - List all
POST   /api/projects             - Create
GET    /api/projects/:id         - Get one
PATCH  /api/projects/:id         - Update
DELETE /api/projects/:id         - Delete

Tasks:
GET    /api/tasks                - List all tasks
GET    /api/projects/:id/tasks   - Project tasks
POST   /api/tasks                - Create
PATCH  /api/tasks/:id            - Update
DELETE /api/tasks/:id            - Delete

Daily Reports:
GET    /api/projects/:id/daily-reports   - List reports
POST   /api/projects/:id/daily-reports   - Create
GET    /api/daily-reports/:id            - Get one
PATCH  /api/daily-reports/:id            - Update
DELETE /api/daily-reports/:id            - Delete
POST   /api/daily-reports/:id/complete   - Complete with signature

Equipment:
GET    /api/equipment            - List all
POST   /api/equipment            - Create
PATCH  /api/equipment/:id        - Update
DELETE /api/equipment/:id        - Delete

Customers:
GET    /api/customers            - List all
POST   /api/customers            - Create
PATCH  /api/customers/:id        - Update
DELETE /api/customers/:id        - Delete

Employees (Fingercheck):
GET    /api/employees            - List all synced employees
GET    /api/employees/:id        - Get single employee
POST   /api/employees/sync       - Sync from Fingercheck API
DELETE /api/employees/:id        - Delete employee

Files & Uploads:
POST   /api/uploads/request-url  - Get presigned upload URL
GET    /api/projects/:id/files   - List project files
POST   /api/projects/:id/files   - Create file record
DELETE /api/files/:id            - Delete file

Folders & Albums:
GET    /api/projects/:id/folders - List folders
POST   /api/projects/:id/folders - Create folder
DELETE /api/folders/:id          - Delete folder
GET    /api/projects/:id/folders/children - Get child folders (for hierarchical picker)
GET    /api/folders/:id/path     - Get folder breadcrumb path
GET    /api/projects/:id/albums  - List albums
POST   /api/projects/:id/albums  - Create album
DELETE /api/albums/:id           - Delete album
```

---

## Security Implementation

### Authentication Flow
1. User clicks "Sign in with Google" via Replit Auth
2. OIDC callback creates/updates user record
3. System checks if email is in authorized list
4. If authorized: full access granted
5. If not authorized: shows "Pending Access" page
6. Owner email auto-approved as admin on first login

### Middleware Stack
```
server/middleware/auth.ts
├── isAuthenticated - Verifies user is logged in
└── isAuthorizedUser - Verifies user is approved

Protected Routes:
├── All /api/* routes require isAuthenticated
├── All /api/* routes require isAuthorizedUser
└── /api/admin/* routes require admin role
```

### Environment Variables
| Variable | Purpose |
|----------|---------|
| DATABASE_URL | PostgreSQL connection string |
| MAILGUN_API_KEY | Mailgun API authentication |
| MAILGUN_DOMAIN | Mailgun sending domain |
| MAILGUN_FROM_EMAIL | Sender email address |
| SESSION_SECRET | Express session encryption |
| CLOUDINARY_CLOUD_NAME | Cloudinary account cloud name |
| CLOUDINARY_API_KEY | Cloudinary API key |
| CLOUDINARY_API_SECRET | Cloudinary API secret |
| FINGERCHECK_API_KEY | Fingercheck API authentication key |
| FINGERCHECK_CLIENT_SECRET | Fingercheck client secret key |

---

## Design System

### Color Palette
- **Background**: Dark slate blue (#1e293b, #0f172a)
- **Accent**: Safety orange (#f97316)
- **Text Primary**: Light gray (#f8fafc)
- **Text Secondary**: Muted gray (#94a3b8)
- **Cards**: Slightly elevated slate (#334155)

### UI/UX Standards
- Delete confirmations required for all destructive actions
- Red asterisk (*) before mandatory field labels
- Consistent spacing and component usage
- Toast notifications for user feedback

### Mobile Optimization
- **Light Theme Default**: ChatGPT-style light theme as default, dark mode available via toggle
- **44px Tap Targets**: All interactive elements have minimum 44px height on mobile (iOS/Android guideline)
- **Edge-to-Edge Dialogs**: Forms and dialogs stretch nearly full-width on mobile with minimal margins
- **Responsive Form Grids**: Forms stack vertically on mobile, expand to multi-column on larger screens
- **Mobile Keyboard Types**: Phone inputs show numeric keypad, number inputs show appropriate keyboards
- **Floating Action Button (FAB)**: Quick access to project tools (Documents, Daily Reports, Photos, Tasks)
- **Fixed Navigation**: Global menu accessible from top-right corner on all screens
- **No Horizontal Scroll**: Content constrained to viewport width

---

## File Structure

```
/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/          # shadcn components
│   │   │   ├── Layout.tsx
│   │   │   ├── PDFViewer.tsx
│   │   │   ├── ObjectUploader.tsx
│   │   │   └── ...
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Projects.tsx
│   │   │   ├── ProjectDetails.tsx
│   │   │   ├── UserManagement.tsx
│   │   │   ├── PendingAccessPage.tsx
│   │   │   └── ...
│   │   ├── hooks/
│   │   ├── lib/
│   │   └── App.tsx
│   └── index.html
├── server/
│   ├── middleware/
│   │   └── auth.ts          # Authentication & authorization
│   ├── services/
│   │   ├── email.ts         # Mailgun email service
│   │   ├── cloudinary.ts    # Cloudinary upload/transform service
│   │   └── fingercheck.ts   # Fingercheck API integration
│   ├── replit_integrations/
│   │   └── auth/            # Replit Auth integration
│   ├── routes.ts
│   ├── storage.ts
│   └── index.ts
├── shared/
│   └── schema.ts            # Drizzle schemas & types
├── replit.md                # Project documentation
└── plan.md                  # This file
```

---

## Next Steps / Future Enhancements

### Potential Features
- [ ] Email notifications for task assignments
- [ ] Mobile app (React Native)
- [ ] Offline mode for field workers
- [x] Fingercheck employee sync (completed Feb 9, 2026)
- [x] Fingercheck time tracking integration in daily reports (completed Feb 10, 2026)
- [ ] Invoice generation
- [ ] Subcontractor portal
- [ ] Equipment GPS tracking
- [ ] Custom report templates
- [ ] Project templates
- [ ] Bulk import/export

---

## Fingercheck Integration - Progress Log

### Goal
Integrate with Fingercheck payroll/HR platform to pull employee data into SiteTech. Enables viewing and managing the workforce roster directly within the construction management platform.

### Completed Steps

#### 1. Database Schema - DONE
- Created `fingercheck_employees` table in `shared/schema.ts`
- Fields: employeeId, employeeNumber, firstName, lastName, middleInitial, email, phone, mobilePhone, jobTitle, position, department, location, hireDate, terminationDate, status, payType, address fields, isSupervisor, lastSyncedAt
- Unique constraint on `employee_id` to prevent duplicates on re-sync
- Insert schema with `createInsertSchema` from drizzle-zod

#### 2. Fingercheck API Service - DONE
- Service file: `server/services/fingercheck.ts`
- Endpoint: `GET https://developer.fingercheck.com/api/v1/Employees/GetAllEmployees`
- Headers: `APIKEY` and `ClientSecretKey` (case-sensitive)
- Response parsing handles array, `Data` wrapper, and `data` wrapper formats
- Data cleaning: trims whitespace, filters empty phone placeholders (`"()-"`), normalizes status codes
- Status detection: `"A"` = active, `"T"` or `"TERMINATED"` or has termination date = terminated
- Validation: `isValidEmployee()` skips records missing required fields

#### 3. Storage Layer - DONE
- Added to `IStorage` interface in `server/storage.ts`:
  - `getFingercheckEmployees()` - list all
  - `getFingercheckEmployee(id)` - get by ID
  - `getFingercheckEmployeeByEmployeeId(employeeId)` - get by Fingercheck employee ID
  - `upsertFingercheckEmployee(employee)` - insert or update on conflict
  - `deleteFingercheckEmployee(id)` - delete by internal ID
- Upsert pattern: `onConflictDoUpdate` on `employee_id` column, sets `lastSyncedAt` on both insert and update

#### 4. API Routes - DONE
- `GET /api/employees` - Returns all synced employees
- `GET /api/employees/:id` - Returns single employee by internal ID
- `POST /api/employees/sync` - Triggers sync from Fingercheck API, upserts all employees, returns count and results
- `DELETE /api/employees/:id` - Deletes employee record (admin only)
- Error handling: Specific messages for 401 (auth failed), 403 (access denied), generic for other errors

#### 5. Frontend UI - DONE
- Page: `client/src/pages/Employees.tsx`
- Features:
  - "Sync from Fingercheck" button with loading state
  - Searchable employee table (name, email, title)
  - Status filter buttons: Active (count), Terminated (count), All (count)
  - Employee detail dialog with full info (contact, employment, address)
  - Empty state with prompt to sync
  - Toast notifications for sync success/failure
  - Responsive: table on desktop, cards on mobile
- Sidebar: "Employees" nav item with HardHat icon in Layout.tsx
- Route: `/employees` registered in App.tsx

#### 6. API Credentials - DONE
- `FINGERCHECK_API_KEY` stored as Replit secret
- `FINGERCHECK_CLIENT_SECRET` stored as Replit secret
- Both are 36-character UUID-format keys

#### 7. End-to-End Testing - DONE (Feb 9, 2026)
- Verified sync pulls 6 employees from Fingercheck
- Search filtering works (tested with "Oton" → Otoniel Aguilar)
- Status filter buttons update counts correctly
- All 6 employee rows visible with correct data

### Key Files
| File | Purpose |
|------|---------|
| `server/services/fingercheck.ts` | Fingercheck API integration, data mapping, cleaning |
| `server/routes.ts` | Employee API endpoints |
| `server/storage.ts` | Employee CRUD operations with upsert |
| `shared/schema.ts` | `fingercheckEmployees` table schema |
| `client/src/pages/Employees.tsx` | Employee list page with search/filter/detail |
| `client/src/components/Layout.tsx` | Sidebar navigation (Employees link) |

### Phase 2: Time Tracking & Daily Report Labor Integration - DONE (Feb 10, 2026)

#### Goal
Replace generic labor entries in daily reports with employee-specific entries linked to Fingercheck time tracking data. Auto-populate employees who punched in to a project on the report date, track hours per employee per task, and validate against actual tracked hours.

#### Completed Steps

##### 1. Time Punch Sync & Storage - DONE (previously built)
- `fingercheck_time_punches` table stores raw punch-in/out records (unique on `guid`)
- `fingercheck_project_mappings` table maps SiteTech projects to Fingercheck job codes
- `POST /api/time-punches/sync` syncs punch data from Fingercheck for a date range
- `GET /api/time-punches/summary` returns aggregated daily time summaries with shifts

##### 2. Schema Updates - DONE
- Added `employee_id` (nullable integer) and `employee_name` (nullable text) to `daily_report_labor_lines` table
- Changed `hours` column from `integer` to `real` to support decimal hours (e.g., 2.5)

##### 3. Project Employees API Endpoint - DONE
- `GET /api/daily-reports/project-employees?projectId=X&date=YYYY-MM-DD`
- Looks up Fingercheck job code mappings for the project
- Queries time punch data for those job codes on the given date
- Pairs punch-in/out records into shifts, calculates total hours per employee
- For open shifts (punched in but not out): uses current time to calculate available hours
- Returns: `[{ employeeId, employeeName, totalHours, hasOpenShift, shifts, jobCode, jobDescription }]`

##### 4. Daily Report Labor UI Redesign - DONE
- Replaced generic "Labor Type / Quantity / Hours" inputs with employee-based system
- "Add Employee" dropdown button shows available employees with their tracked hours
- Each labor line shows: employee name, role selector (Foreman/Operator/Laborer), hours input
- Employees with open shifts display a "Still on site" badge
- Helpful message shown when no employees have punch data or no job code mappings exist

##### 5. Cross-Task Hour Validation - DONE
- `getEffectiveHours()`: checks `localLaborHours` state first, then falls back to saved values
- `employeeAllocatedHours`: useMemo that sums effective hours across all tasks per employee, recalculates when local edits change
- `getEmployeeRemainingHours(employeeId, excludeLaborLineId)`: total tracked hours minus allocated (excluding the current line being edited)
- On blur of hours input: validates value doesn't exceed remaining hours, blocks save with toast if exceeded
- Clamped to minimum 0 to prevent negative display from rounding edge cases
- Consistent `Math.round(x * 100) / 100` rounding at all calculation points

##### 6. PDF Export Update - DONE
- Updated daily report PDF to display Employee/Role/Hours columns instead of old Type/Qty/Hours format

#### Key Files
| File | Purpose |
|------|---------|
| `shared/schema.ts` | `dailyReportLaborLines` schema with employeeId/employeeName columns |
| `server/routes.ts` | `GET /api/daily-reports/project-employees` endpoint |
| `server/services/fingercheck.ts` | Time punch data fetching and shift pairing |
| `server/storage.ts` | Project mapping lookups, time punch queries |
| `client/src/pages/DailyReportPage.tsx` | Employee-based labor UI, validation logic, PDF export |

---

## Mailgun Inbound Email Integration - Progress Log

### Goal
Integrate Mailgun-based inbound email routing for SiteTech projects. Each project gets an auto-generated email address at `{slug}-{id}@updates.sitetechnj.com`. Team members CC these addresses on project correspondence, which are automatically captured via Mailgun's inbound routing webhook and displayed in the project's Communications tab.

### Completed Steps

#### 1. Email Domain Configuration - DONE
- Changed email domain from `projects.sitetechnj.com` to `updates.sitetechnj.com` throughout codebase
- Updated `PROJECT_EMAIL_DOMAIN` constant in `server/storage.ts`
- Updated admin setup page (`client/src/pages/EmailSetup.tsx`) instructions

#### 2. DNS Records - DONE (Verified in Mailgun)
- MX records for `updates.sitetechnj.com` pointing to:
  - `mxa.mailgun.org` (priority 10)
  - `mxb.mailgun.org` (priority 10)
- SPF and DKIM records in place
- Domain verified in Mailgun US region (`app.mailgun.com`)

#### 3. Mailgun Inbound Route - DONE
- Route pattern: `match_recipient(".*@updates.sitetechnj.com")`
- Action: Forward to `https://sitetech-app.replit.app/api/webhooks/inbound-email`
- Route configured in Mailgun dashboard under Receiving > Inbound Routes

#### 4. Webhook Endpoint - DONE (Published)
- Endpoint: `POST /api/webhooks/inbound-email` in `server/routes.ts`
- Service logic: `server/services/inboundEmail.ts`
- Features:
  - Parses multipart form data from Mailgun (using multer)
  - Verifies Mailgun signature (HMAC SHA256 using `MAILGUN_API_KEY`)
  - Extracts sender, recipients, subject, body (plain + HTML)
  - Matches recipient email to project via `getProjectByEmail()`
  - Stores email in `projectEmails` table
  - Handles attachments: stores in Replit Object Storage under `email-attachments/{projectId}/{emailId}/`
  - Classifies emails as internal/external based on customer email

#### 5. Project Email Address Generation - DONE
- Format: `{slug}-{id}@updates.sitetechnj.com`
- Slug: project name lowercased, non-alphanumeric replaced with hyphens, trimmed, max 30 chars
- Auto-generated on project creation (`storage.createProject()`)
- Backfill endpoint: `POST /api/admin/backfill-project-emails` (admin-only)

#### 6. Production Database - Email Address Backfill - DONE (Feb 9, 2026)
- All 4 production projects now have email addresses:

| ID | Project Name | Email Address |
|----|-------------|---------------|
| 1 | 215 forest Ave. | 215-forest-ave-1@updates.sitetechnj.com |
| 2 | Massachusetts project | massachusetts-project-2@updates.sitetechnj.com |
| 3 | TEST PROJECT | test-project-3@updates.sitetechnj.com |
| 4 | 319 Albert | 319-albert-4@updates.sitetechnj.com |

#### 7. Development Database - Email Address Backfill - DONE (previously completed)
- All 8 dev projects have email addresses

#### 8. App Published - DONE
- Latest code with webhook endpoint and backfill endpoint deployed to `sitetech-app.replit.app`

### Remaining / To Verify

#### 9. MAILGUN_API_KEY Secret - NEEDS VERIFICATION
- The `MAILGUN_API_KEY` secret must contain the **HTTP webhook signing key** (ending in `bdfb5`), NOT a regular API key
- This is the key Mailgun uses to sign POST payloads sent to the webhook
- User needs to verify/update this in Replit Secrets tab
- The signing key is found in Mailgun under: Settings > API Keys > HTTP webhook signing key

#### 10. End-to-End Test - PENDING
- Once MAILGUN_API_KEY is confirmed correct, send a test email to one of the project addresses (e.g., `319-albert-4@updates.sitetechnj.com`)
- Verify it appears in the project's Communications tab
- Check Mailgun Logs for delivery/webhook activity

#### 11. Communications Tab UI - EXISTING (already built)
- Located at `client/src/components/CommunicationsTab.tsx`
- Accessible via FloatingProjectTools on project details page
- Features: project email display with copy button, full-text search, internal/external filtering, HTML email rendering, attachment viewing

### Key Files
| File | Purpose |
|------|---------|
| `server/services/inboundEmail.ts` | Mailgun webhook processing, signature verification |
| `server/routes.ts` | Webhook endpoint, admin backfill endpoint |
| `server/storage.ts` | `backfillProjectEmails()`, `getProjectByEmail()`, email slug generation |
| `shared/schema.ts` | `projectEmails`, `projectEmailAttachments`, `projectEmailConnections` tables |
| `client/src/components/CommunicationsTab.tsx` | Frontend email display |
| `client/src/pages/EmailSetup.tsx` | Admin setup instructions page |

### Email Flow
1. External user sends email, CC'ing `{slug}-{id}@updates.sitetechnj.com`
2. Email arrives at Mailgun (MX records route to Mailgun servers)
3. Mailgun matches inbound route, forwards POST to webhook URL
4. Webhook verifies Mailgun HMAC signature
5. Webhook looks up project by recipient email address
6. Email stored in `projectEmails` table with metadata
7. Attachments stored in Replit Object Storage
8. Email appears in project's Communications tab

---

## Schedule Feature (Gantt Chart) - Progress Log

### Goal
Build a full-featured schedule system where users can schedule unfinished project tasks on specific dates with durations, allocate employees (from Fingercheck) and equipment resources, and manage the project timeline via a Gantt chart and weekly list view.

### Completed Steps

#### 1. Database Schema - DONE
- **`schedule_entries` table**: `id`, `taskId` (FK to tasks), `projectId` (FK to projects), `startDate`, `duration` (working days), `includeSunday` (boolean), `notes`, `createdBy`, soft delete (`deletedAt`)
- **Updated `allocations` table**: Added `scheduleEntryId` (FK to schedule_entries) and `employeeId` (FK to fingercheck_employees) columns to link allocations to schedule entries and Fingercheck employees

#### 2. API Routes - DONE
- `GET /api/schedule-entries` - List all schedule entries (with optional project filter)
- `POST /api/schedule-entries` - Create a new schedule entry
- `PATCH /api/schedule-entries/:id` - Update a schedule entry
- `DELETE /api/schedule-entries/:id` - Soft delete a schedule entry
- `GET /api/schedule-entries/:id/allocations` - Get allocations for a schedule entry
- `POST /api/schedule-entries/:id/allocations` - Add allocation to a schedule entry
- `DELETE /api/allocations/:id` - Remove an allocation

#### 3. Gantt Chart View - DONE
- **Fixed 40px column widths** for consistent day columns
- **280px sidebar** showing project names and task names with good readability
- **Horizontal scrolling** with synchronized header/body scroll for narrower screens
- **Full page width** on desktop (Layout removes max-w-7xl constraint for /schedule route, uses minimal padding)
- **Multi-day task bars** spanning working days (Mon-Fri by default, optionally including Sunday), skipping Saturdays
- **Project color coding** on task bars matching project colors
- **Weekend columns** visually distinguished (muted background for Saturdays/Sundays)
- **Today indicator** with vertical line and auto-scroll-to-today on load
- **Month/day headers** with two-row header (month names on top, day numbers below)

#### 4. Unscheduled Tasks Panel - DONE
- **Collapsible right-side panel** (collapsed by default)
- When collapsed: shows ListChecks icon with badge count of unscheduled tasks
- When expanded: 220px wide panel showing unscheduled tasks grouped by project
- Tasks can be scheduled from this panel

#### 5. Task Interaction - DONE
- **Drag-and-drop** to move scheduled tasks to different dates
- **Drag-and-drop resource allocation** via contextual side panel
- **Delete schedule entries** with confirmation dialog
- **Edit schedule entries** (duration, notes, includeSunday)

#### 6. Resource Management - DONE
- **Resource allocation dialog** for assigning employees and equipment to schedule entries
- Employees sourced from Fingercheck integration
- Equipment sourced from equipment inventory

#### 7. Weekly List View - DONE
- Alternative to Gantt view for mobile/tablet
- Shows scheduled tasks in a weekly list format

#### 8. Layout Optimizations - DONE
- Schedule page uses full page width (no max-w-7xl constraint)
- Reduced padding (`p-3 md:p-4`) on schedule route for maximum space utilization
- Sidebar widened to 280px for readability
- Horizontal scroll with header/body sync for smaller screens

### Key Files
| File | Purpose |
|------|---------|
| `shared/schema.ts` | `scheduleEntries` table, updated `allocations` table |
| `server/routes.ts` | Schedule entry CRUD, allocation endpoints |
| `server/storage.ts` | Schedule entry and allocation storage operations |
| `client/src/pages/Schedule.tsx` | Gantt chart, weekly list view, unscheduled panel, dialogs |
| `client/src/components/Layout.tsx` | Full-width layout for /schedule route |

### Design Decisions
- **Fixed 40px column width**: Provides consistent sizing; more columns visible on wide screens, horizontal scroll on narrow screens
- **280px sidebar**: Wide enough to read project and task names without excessive truncation
- **Collapsed unscheduled panel**: Keeps the main Gantt view uncluttered; expands on demand
- **Working-day spans**: Task bars skip Saturdays (and Sundays unless includeSunday is true), reflecting actual construction work schedules
- **Project color coding**: Each project's tasks use the project's assigned color for quick visual identification

---

## Changelog

### February 18, 2026
- **Schedule Feature - Gantt Chart**: Full-featured project scheduling with Gantt chart view
  - Created `schedule_entries` table with task/project linking, working-day duration, optional Sunday inclusion
  - Updated `allocations` table with `scheduleEntryId` and `employeeId` for resource assignment
  - Built Gantt chart with fixed 40px column widths, 280px sidebar, horizontal scrolling with header/body sync
  - Multi-day task bars that span working days (skip weekends), with project color coding
  - Collapsible right-side unscheduled tasks panel with badge count
  - Drag-and-drop to move tasks, resource allocation dialog, delete with confirmation
  - Weekly list view alternative for mobile
  - Full page width layout for schedule route (no max-w-7xl, minimal padding)
  - Today indicator with auto-scroll on load

### February 10, 2026
- **Daily Report Labor - Fingercheck Time Tracking Integration**: Replaced generic labor tracking with employee-specific entries linked to Fingercheck time tracking
  - Added `employee_id` and `employee_name` columns to `daily_report_labor_lines`; changed `hours` to `real` for decimal support
  - Created `GET /api/daily-reports/project-employees` endpoint that fetches employees by project/date from time punch data
  - Redesigned labor UI: employee dropdown with tracked hours, role selector (Foreman/Operator/Laborer), hours input per employee per task
  - Implemented cross-task hour validation using `getEffectiveHours()` with local state tracking and `getEmployeeRemainingHours()` with line exclusion
  - Open shifts (not punched out) use current time for available hours calculation
  - Updated PDF export to show Employee/Role/Hours columns
  - Consistent rounding and clamping to prevent float drift and negative display

### February 9, 2026
- **Fingercheck Employee Sync Integration**: Full integration with Fingercheck payroll/HR platform
  - Created `fingercheck_employees` database table with unique constraint on employee_id
  - Built `server/services/fingercheck.ts` API service to fetch from `GetAllEmployees` endpoint
  - Implemented upsert-based sync with data cleaning (whitespace, empty phones, status normalization)
  - Added API routes: GET /api/employees, POST /api/employees/sync, DELETE /api/employees/:id
  - Built Employees page with searchable table, Active/Terminated/All filtering, and employee detail dialog
  - Added "Employees" sidebar navigation with HardHat icon
  - Successfully syncs 6 employees from Fingercheck production account
  - Published to production

### February 3, 2026 (Evening)
- **Mobile Document View Optimization**: Comprehensive mobile-first redesign of the project documents page
  - **Sticky Header on Mobile**: Search bar, view toggles, action buttons, and breadcrumbs fixed at top while documents scroll
  - **List View Default on Mobile**: Documents default to list view on screens < 640px, grid view on larger screens
  - **40x40px Action Buttons**: All header action buttons sized to 40x40px with 20x20px icons on mobile for better tap targets
  - **File Name Truncation**: Long file names properly truncate with ellipsis, preventing horizontal overflow
  - **Removed Section Labels**: Removed "Folders" and "Files" headings for cleaner interface
  - **Star Button Repositioned**: Moved star/favorite button to the right side with other action buttons
  - **Mobile Action Menu**: Added dropdown menu (⋮) on mobile containing all file actions:
    - Details, Download, Rename, Edit Tags, Delete
  - **Desktop Hover Actions**: Individual action buttons remain visible on hover for desktop users
  - **Hidden Tags on Mobile**: File tags hidden on mobile to save space, visible on desktop (sm breakpoint and up)
  - **Overflow Protection**: Multiple layers of `overflow-hidden` and `overflow-x-hidden` to prevent any horizontal scrolling
  - **Responsive Metadata**: Date and file size always visible, tags limited to 2 with max-width truncation on desktop
- **Technical Changes**:
  - `ProjectDetails.tsx` - Restructured documents tab with sticky header wrapper, responsive viewMode initialization
  - Added `DropdownMenu` for mobile file actions with all CRUD operations
  - Applied `w-full max-w-full overflow-hidden` to document containers
  - File list items use `min-w-0` for proper flexbox truncation

### February 3, 2026
- **Collapsible Project Details Header**: Project details section at top of project tools pages is now collapsible
  - Collapsed by default showing only status badge, project number, and name in a compact single row
  - Expand/collapse button (chevron) on the right side
  - Entire header bar is clickable to toggle
  - Expanded view shows all project details: description, customer, address, dates, value, notes
  - Edit and delete actions only visible when expanded
  - Smooth slide-in animation when expanding
  - Minimizes screen real estate usage on mobile while keeping project context accessible
  - **Fixed/Sticky positioning**: Header stays at top of page while scrolling through project tools content
- **Comprehensive Mobile Optimization**: Implemented mobile-first responsive design throughout the application
  - **Light Theme Default**: Changed default theme to light (ChatGPT-style) with dark theme available via toggle
  - **Global Navigation Menu**: Fixed-position menu button in top-right corner accessible from all screens
  - **44px Minimum Tap Targets**: All interactive elements (buttons, inputs, selects, checkboxes) have 44px minimum height on mobile for better touch accessibility
  - **Floating Project Tools (FAB)**: Bottom-right floating action button for quick access to project tools (Documents, Daily Reports, Photos, Tasks)
    - Automatically hides during form interactions to prevent accidental taps
    - Documents is the default landing page when accessing a project
  - **Responsive Form Layouts**: All forms converted from fixed grids to responsive breakpoints
    - `grid-cols-2` → `grid-cols-1 md:grid-cols-2` for stacking on mobile
    - `grid-cols-3` → `grid-cols-1 sm:grid-cols-3` for complex forms
  - **Mobile Keyboard Optimization**: 
    - Phone inputs use `type="tel"` for numeric keypad
    - Quantity fields use `inputMode="numeric"` 
    - Currency/hours fields use `inputMode="decimal"`
  - **Dialog Improvements**:
    - Dialogs are nearly edge-to-edge on mobile (`left-0.5 right-0.5`)
    - Positioned near top of screen on mobile (`top-2`) for easier reach
    - Reduced internal padding on mobile (`p-3`)
    - Close button has 44px tap target on mobile
    - Maximum height 90vh with scroll for long content
  - **Horizontal Scroll Prevention**: Added `overflow-x: hidden` to html/body and container elements
  - **Content Viewport Fit**: All content constrained to viewport width, preventing horizontal overflow
- **Updated Components**:
  - `dialog.tsx` - Mobile-first positioning with responsive breakpoints
  - `input.tsx`, `select.tsx`, `button.tsx`, `checkbox.tsx` - 44px minimum tap targets on mobile
  - `FloatingProjectTools.tsx` - New FAB component for project tool navigation
  - `Layout.tsx` - Fixed top-right menu, horizontal scroll prevention
  - All form pages (Projects, Customers, Equipment, etc.) - Responsive grid layouts

### February 2, 2026
- **Cloudinary Migration**: Migrated photo storage from Replit Object Storage to Cloudinary
  - All new photo uploads go directly to Cloudinary via signed uploads
  - Eliminated background processing - Cloudinary handles transformations on-demand
  - Photo thumbnails and medium sizes generated via Cloudinary URL transformations
  - EXIF date extraction preserved (client-side before upload)
  - Updated both Photo Library and Daily Report photo uploads
  - Photos display correctly in both contexts using Cloudinary URLs
  - Added delete support with Cloudinary cleanup
- **New Cloudinary Service** (`server/services/cloudinary.ts`):
  - `uploadToCloudinary(file, options)` - Upload files with folder organization
  - `deleteFromCloudinary(publicId)` - Delete files by public ID
  - `getCloudinaryUrl(publicId, options)` - Generate transformation URLs
  - URL transformation presets: thumbnail (150x150), medium (600px), full (auto quality/format)
- **Updated Components**:
  - `NativeFileUploader` - Now uploads directly to Cloudinary with signature-based auth
  - `OptimizedPhotoCard` - Displays photos using Cloudinary URLs with smart fallback
  - `PhotosTab` - Uses Cloudinary URLs for photo display
  - `DailyReportPage` - Updated to pass Cloudinary metadata for photo uploads
- **Database Schema**: `photos` table updated with:
  - `cloudinaryPublicId` - Cloudinary public ID for the image
  - `cloudinaryUrl` - Cloudinary secure URL
  - `objectPath` - Kept for backward compatibility with legacy photos
- **API Changes**:
  - `POST /api/cloudinary/signature` - Generate signed upload parameters
  - `POST /api/projects/:id/photos` - Accepts cloudinaryPublicId and cloudinaryUrl
  - `POST /api/daily-report-photos` - Accepts cloudinaryPublicId and cloudinaryUrl
- **Removed**:
  - Background image processor (`imageProcessor.ts`)
  - Prefetch logic for thumbnails
  - Object storage upload for photos

### January 29, 2026
- **Hierarchical Folder Picker for Move Feature**: Replaced flat folder list in move dialog with intuitive drill-down navigation
  - Users can now navigate into subfolders to select destination
  - Breadcrumb navigation shows current path (Root > Folder > Subfolder)
  - Back button for easy return to parent folder
  - Folders with children display navigation arrow indicator
  - Cycle prevention: Cannot move folder into itself or descendants
  - "Move Here" button disabled with "Cannot move here" text for invalid destinations
  - No-op detection: Shows message if items already in target folder
- **New API Endpoints**:
  - `GET /api/projects/:projectId/folders/children?parentId=X` - Returns child folders
  - `GET /api/folders/:id/path` - Returns breadcrumb path for folder
- **Storage Layer Updates**:
  - Added `getChildFolders(projectId, parentId)` method
  - Added `getFolder(id)` method  
  - Added `getFolderPath(id)` method for breadcrumb generation
- **Folder Upload Bug Fix**: Fixed critical bug where `useCreateFolder` returned Response object instead of parsed JSON, causing folder hierarchy to flatten during folder uploads

### January 28, 2026 (Late Night)
- **Router-Safe Tab URLs**: Implemented URL-synced tabs on project details page using wouter's `useSearch` and `navigate` hooks instead of direct window.history manipulation
- **TimePicker Component**: Created custom time picker with hour/minute/AM-PM dropdowns for better UX than native HTML5 time input (`client/src/components/ui/time-picker.tsx`)
- **Enhanced PDF Export**: 
  - Added freehand signature images (base64) to PDF exports
  - Improved photo layout with 2-column grid (240x160px photos)
  - Fixed photo loading by accessing object storage directly (bypasses authentication middleware)
- **Photo Upload Limit**: Increased from 5 to 50 photos per upload for task entries and deliveries
- **Task Progress Slider Fix**: Fixed slider not saving changes by adding `onValueCommit` handler to persist progress when user releases slider
- **PDF Photo Loading Fix**: Changed from HTTP fetch to direct `ObjectStorageService.getObjectEntityFile()` access for embedding photos in PDFs

### January 28, 2026 (Evening)
- Integrated `yet-another-react-lightbox` for professional fullscreen photo viewing
- Added EXIF metadata extraction using `exifreader` library during upload
- Photos now capture actual taken date from camera metadata (takenAt field)
- Implemented lazy loading for photo gallery images (loading="lazy")
- Lightbox respects album filtering (only shows photos from current album)
- Keyboard navigation and swipe gestures in lightbox
- Fixed mobile photo upload error (date string to Date conversion)
- Removed legacy image viewer in favor of new lightbox
- Updated replit.md and plan.md documentation

### January 28, 2026
- Added first name, last name, and phone number fields to authorized users system
- Enhanced Add Authorized User form with new contact fields
- Updated authorized users list to display name and phone columns
- Migrated email service from SendGrid to Mailgun API
- Updated email invite links to use production URL
- Published app to sitetech-app.replit.app
- Comprehensive documentation update (plan.md)

### January 27, 2026
- Implemented invite-only user management system
- Added role-based access control (Admin, Manager, User)
- Created centralized auth middleware
- Added owner email auto-approval system
- Built User Management admin page
- Created professional HTML email templates

### January 26, 2026
- Photo management with EXIF date extraction
- Daily reports with signature capture
- Weather integration for daily reports
- PDF viewer with annotations

### January 25, 2026
- Initial project setup
- Core authentication with Replit Auth
- Basic project and task management
- Equipment tracking system
