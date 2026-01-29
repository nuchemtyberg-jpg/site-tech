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
- **Design Theme**: Dark slate blue with safety orange accents.

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
- **Daily Report Weather Integration**: Open-Meteo geocoding and weather APIs for local weather conditions.
- **Signature Capture**: Freehand or typed signatures for completing daily reports.

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