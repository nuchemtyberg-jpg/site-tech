# SiteTech - Features and Implementation Details

## Current Features

### 1. Project Management
- **Project List View**: Grid/card layout showing all projects with status indicators, color coding, and key details
- **Project Details**: Comprehensive project page with tabbed interface (Overview, Schedule, Documents, Photos, Daily Reports)
- **Project Status Workflow**: Supports multiple statuses (new, bidding, proposal_sent, active, completed, on_hold, cancelled)
- **Color Coding**: Each project has a customizable color for easy identification
- **Address Autocomplete**: OpenStreetMap Nominatim API integration for address lookup during project creation

### 2. Customer Management
- **Customer Database**: Store customer contact info, company details, and notes
- **Project Association**: Link projects to customers for relationship tracking
- **Customer Details Page**: View all customer information and associated projects

### 3. Task/Schedule Management
- **Task Creation**: Create tasks with title, description, scheduled date, priority, and status
- **Progress Tracking**: Tasks have percent complete (0-100%) with automatic status updates
- **Status History**: Audit trail of task status changes with user attribution
- **Priority Levels**: Low, Medium, High priority settings
- **Schedule View**: Calendar-based view of all tasks across projects

### 4. Equipment Management
- **Equipment Inventory**: Track equipment with type, make, model, year, serial number
- **Status Tracking**: Available, In Use, Maintenance statuses
- **Location Monitoring**: Track current location and project assignments
- **Maintenance Scheduling**: Log service dates and schedule next maintenance
- **Allocations**: Link equipment to specific projects for scheduling

### 5. Document Management
- **Folder Structure**: Hierarchical folder organization per project
- **Default Folders**: Auto-created folder structure (Office/Field with subfolders like Takeoffs, Proposals, Drawings, etc.)
- **File Upload**: Direct upload to object storage via Uppy
- **Grid/List Views**: Toggle between viewing modes
- **PDF Viewer**: Professional PDF viewing with annotation tools

### 6. Photo Management (Separate from Documents)
- **Album Organization**: Photos organized into albums (not folders)
- **Default Album**: "General" album auto-created when uploading without album selection
- **EXIF Date Extraction**: Photos sorted by taken date from EXIF metadata (falls back to upload date)
- **Date-Based Grouping**: Photos grouped by date headers
- **Variable Tile Sizes**: Small, Medium, Large tile options
- **Multi-Select**: Bulk actions (download, share, delete) with selection mode
- **Upload with EXIF**: Automatic extraction of photo date from EXIF metadata

### 7. Daily Reports
- **Field Reporting**: Comprehensive daily field reports per project
- **Weather Integration**: Fetch and display local weather via Open-Meteo API
- **Task Entries**: Record tasks worked on with progress snapshots
- **Labor Lines**: Log labor hours per task entry
- **Equipment Lines**: Log equipment usage per task entry
- **Delivery Tracking**: Record deliveries with vendor, time, description, and status
- **Report Status**: Draft → Completed workflow
- **Signature Capture**: Freehand or typed signatures to complete reports
- **PDF Export**: Generate PDF reports with optional photo inclusion
- **Daily Report Photos Album**: Photos from daily reports saved to dedicated album

### 8. Dashboard
- **Key Metrics**: Overview of projects, tasks, equipment status
- **Analytics Charts**: Visual representations using Recharts
- **Quick Access**: Navigate to active items

### 9. Authentication
- **Replit Auth**: OpenID Connect integration
- **Protected Routes**: Middleware-based route protection
- **Session Management**: PostgreSQL-backed sessions

---

## Technical Implementation

### Frontend Stack
| Technology | Purpose |
|------------|---------|
| React 18 + TypeScript | UI Framework |
| Vite | Build tool with HMR |
| Wouter | Client-side routing |
| TanStack React Query | Server state management |
| Tailwind CSS | Utility-first styling |
| shadcn/ui + Radix UI | Component library |
| Uppy | File uploads to object storage |
| Recharts | Dashboard charts |
| date-fns | Date manipulation |
| pdf-lib | PDF annotation export |

### Backend Stack
| Technology | Purpose |
|------------|---------|
| Express.js + TypeScript | API server |
| PostgreSQL | Primary database |
| Drizzle ORM | Type-safe database access |
| Zod | Schema validation |
| Passport.js | Authentication (OIDC) |
| connect-pg-simple | Session storage |

### Key Data Models

```
Projects
├── id, projectNumber, name, description
├── customerId (FK to Customers)
├── address fields (streetAddress, city, state, zip)
├── status, estimatedValue, color
└── startDate, endDate

Tasks
├── id, projectId (FK to Projects)
├── title, description, scheduledDate
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

PhotoAlbums
├── id, projectId (FK to Projects)
└── name (e.g., "General", "Daily Report Photos")
```

### File Organization Pattern
- **Documents**: Use `folderId` - organized in hierarchical folders
- **Photos**: Use `albumId` - organized in flat albums
- **Key Distinction**: Documents and Photos are completely separate tools with different organization systems

### Photo Upload Flow
1. User clicks Upload in Photos tab
2. Uppy modal opens for file selection
3. Files uploaded to object storage via presigned URLs
4. On complete:
   - EXIF date extracted from photos (if available)
   - Album determined (current selection or auto-create "General")
   - File record created with albumId, takenAt, etc.
5. Photos displayed sorted by takenAt (or createdAt fallback)

### API Endpoints

```
Authentication:
GET  /api/auth/user          - Current user
GET  /api/login              - Initiate login
POST /api/logout             - Logout

Projects:
GET    /api/projects         - List all
POST   /api/projects         - Create
GET    /api/projects/:id     - Get one
PATCH  /api/projects/:id     - Update
DELETE /api/projects/:id     - Delete

Project Files:
GET    /api/projects/:id/files    - List files
POST   /api/projects/:id/files    - Create file record
DELETE /api/files/:id             - Delete file

Project Albums:
GET    /api/projects/:id/albums   - List albums
POST   /api/projects/:id/albums   - Create album
DELETE /api/albums/:id            - Delete album

Folders:
GET    /api/projects/:id/folders  - List folders
POST   /api/projects/:id/folders  - Create folder
DELETE /api/folders/:id           - Delete folder

Tasks:
GET    /api/tasks                 - List all tasks
GET    /api/projects/:id/tasks    - Project tasks
POST   /api/tasks                 - Create
PATCH  /api/tasks/:id             - Update
DELETE /api/tasks/:id             - Delete

Daily Reports:
GET    /api/projects/:id/daily-reports     - List reports
POST   /api/projects/:id/daily-reports     - Create
GET    /api/daily-reports/:id              - Get one
PATCH  /api/daily-reports/:id              - Update
DELETE /api/daily-reports/:id              - Delete
POST   /api/daily-reports/:id/complete     - Complete with signature

Equipment:
GET    /api/equipment            - List all
POST   /api/equipment            - Create
GET    /api/equipment/:id        - Get one
PATCH  /api/equipment/:id        - Update
DELETE /api/equipment/:id        - Delete

Customers:
GET    /api/customers            - List all
POST   /api/customers            - Create
GET    /api/customers/:id        - Get one
PATCH  /api/customers/:id        - Update
DELETE /api/customers/:id        - Delete

File Uploads:
POST   /api/uploads/request-url  - Get presigned upload URL
```

---

## Design Theme
- **Primary Colors**: Dark slate blue background
- **Accent Color**: Safety orange (#f97316) - suitable for construction industry
- **Style**: Industrial, professional, dark mode optimized

## UI/UX Standards
- Delete confirmations required for all destructive actions
- Red asterisk (*) before mandatory field labels
- Consistent spacing and component usage
- Mobile-responsive layouts
