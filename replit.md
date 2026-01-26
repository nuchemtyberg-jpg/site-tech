# ConstructOS - Construction Project Management

## Overview

ConstructOS is a full-stack construction project management application built with React, Express, and PostgreSQL. It provides tools for managing construction projects, tasks, equipment allocation, and scheduling with a modern dark-themed UI designed for construction industry workflows.

The application features a dashboard for project analytics, project management with task tracking, equipment inventory management, and a weekly scheduling calendar view.

## User Preferences

Preferred communication style: Simple, everyday language.

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
Four main entities defined in `shared/schema.ts`:
- **Projects**: Core entity with name, location, dates, status, and color
- **Tasks**: Belong to projects with title, description, dates, status, and priority
- **Equipment**: Inventory items with type, status, and notes
- **Allocations**: Link equipment to projects for scheduling

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