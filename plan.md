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
- [x] Calendar-based schedule view
- [x] Priority levels (Low, Medium, High)

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
- **Upload**: Uppy-powered drag-and-drop file upload
- **PDF Viewer**: Annotation tools (pen, highlighter, shapes, text, eraser)
- **Export**: Save annotated PDFs

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

Files & Uploads:
POST   /api/uploads/request-url  - Get presigned upload URL
GET    /api/projects/:id/files   - List project files
POST   /api/projects/:id/files   - Create file record
DELETE /api/files/:id            - Delete file

Folders & Albums:
GET    /api/projects/:id/folders - List folders
POST   /api/projects/:id/folders - Create folder
DELETE /api/folders/:id          - Delete folder
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
- Mobile-responsive layouts
- Toast notifications for user feedback

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
│   │   └── email.ts         # Mailgun email service
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
- [ ] Time tracking integration
- [ ] Invoice generation
- [ ] Subcontractor portal
- [ ] Equipment GPS tracking
- [ ] Custom report templates
- [ ] Project templates
- [ ] Bulk import/export

---

## Changelog

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
