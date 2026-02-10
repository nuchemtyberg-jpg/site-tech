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
Core entities, utilizing soft deletes with a `deletedAt` timestamp, include Projects, Tasks, Equipment, Allocations, Customers, DailyReports, Photos, and Files.

### Specific Features
- **Address Autocomplete**: Utilizes OpenStreetMap's Nominatim API.
- **PDF Viewer**: iframe and canvas overlay for viewing and annotating PDFs.
- **Document Management**: Supports grid/list views, automatic project folder generation, tagging, search, starring, multi-select batch operations, and drag-and-drop uploads.
- **Photo Management**: Organizes photos into albums, offers variable tile sizes, multi-select for bulk actions, and date-based grouping with EXIF data. Includes virtualized scrolling, cursor-based pagination, background image processing (thumbnails, WebP), BlurHash LQIP placeholders, client-side IndexedDB caching, and prefetching. Features tab-gated loading and smart thumbnail fallback for performance.
- **Daily Report Weather Integration**: Open-Meteo geocoding and weather APIs provide local weather conditions.
- **Daily Report Labor Integration**: Links to Fingercheck time tracking, allowing employees who punched into a project to be added to daily report tasks with role selection and hours input, validated against actual tracked hours.
- **Signature Capture**: Enables freehand or typed signatures for daily reports.
- **Project Communications (Email Integration)**:
    - **Primary Method**: Each project receives an auto-generated email address (`{slug}-{id}@updates.sitetechnj.com`). Emails CC'd to this address are captured via a Mailgun inbound route webhook, with attachments stored in Replit Object Storage.
    - **Secondary Method**: Optional Outlook OAuth integration for syncing additional project emails via Microsoft Graph API.
    - **Features**: Centralized view of project emails, classification (internal/external), full-text search, HTML rendering, attachment handling.
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
- **Mailgun**: Inbound email routing.
- **Microsoft Graph API**: For Outlook email integration and RFI sending.
- **Fingercheck REST API**: Employee sync and time tracking data.