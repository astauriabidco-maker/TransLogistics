# TransLogistics — Repository Structure

> **Version**: 1.0.0  
> **Status**: Foundation  
> **Last Updated**: 2026-02-05

---

## 1. Folder Hierarchy

```
/TransLogistics
├── apps/
│   ├── web/                   # Next.js 15 Frontend
│   └── api/                   # Node.js API Layer
├── services/
│   └── ai-engine/             # Python FastAPI (VolumeScan AI)
├── packages/
│   ├── ui/                    # Shared React Components
│   └── utils/                 # Shared Utilities
├── docs/                      # Architecture & Convention Docs
├── .env.example               # Environment Template
├── .gitignore                 # Git Ignore Rules
└── README.md                  # Project Overview
```

---

## 2. Folder Responsibilities

### 2.1 `/apps/web` — Next.js 15 Frontend

**Purpose**: All user-facing interfaces (Customer, Hub Operator, Admin).

| ✅ Allowed | ❌ Forbidden |
|-----------|-------------|
| React components | Direct database access |
| Server actions | Business logic beyond UI validation |
| API route consumption | Prisma imports |
| UI state management | Secret handling (use env vars) |
| Static assets | AI model execution |

**Internal Structure**:
```
/apps/web
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # Page-specific components
│   ├── lib/              # Utilities, API clients
│   └── styles/           # Global styles, tokens
├── public/               # Static assets
├── next.config.js
├── package.json
└── tsconfig.json
```

---

### 2.2 `/apps/api` — Node.js API Layer

**Purpose**: All business logic, data persistence, external integrations.

| ✅ Allowed | ❌ Forbidden |
|-----------|-------------|
| Route handlers | React components |
| Prisma queries | Frontend-specific code |
| Business logic services | Direct AI model execution |
| External API integrations | Hardcoded secrets |
| Authentication middleware | Presentation logic |

**Internal Structure**:
```
/apps/api
├── src/
│   ├── routes/           # API route handlers
│   ├── services/         # Business logic services
│   ├── repositories/     # Data access layer (Prisma)
│   ├── middleware/       # Auth, validation, logging
│   ├── integrations/     # External APIs (WhatsApp, payments)
│   └── types/            # Shared TypeScript types
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── migrations/       # Migration history
├── package.json
└── tsconfig.json
```

---

### 2.3 `/services/ai-engine` — Python FastAPI

**Purpose**: AI/ML operations, specifically VolumeScan dimension estimation.

| ✅ Allowed | ❌ Forbidden |
|-----------|-------------|
| FastAPI endpoints | Database access |
| ML model inference | User authentication logic |
| Image processing | Business domain logic |
| Confidence scoring | State persistence beyond request |

**Internal Structure**:
```
/services/ai-engine
├── app/
│   ├── main.py           # FastAPI app entry
│   ├── routers/          # API endpoints
│   ├── models/           # ML models, Pydantic schemas
│   ├── services/         # Business logic (estimation)
│   └── utils/            # Image processing, helpers
├── tests/
├── requirements.txt
└── Dockerfile
```

---

### 2.4 `/packages/ui` — Shared React Components

**Purpose**: Reusable UI components consumed by `/apps/web`.

| ✅ Allowed | ❌ Forbidden |
|-----------|-------------|
| Presentational components | API calls |
| Design tokens | Business logic |
| Component stories (Storybook) | Page-level layouts |
| CSS/styling utilities | Routing logic |

**Consumption**: 
```typescript
import { Button, Card } from '@translogistics/ui';
```

**Internal Structure**:
```
/packages/ui
├── src/
│   ├── components/       # Exported components
│   ├── tokens/           # Design tokens (colors, spacing)
│   └── index.ts          # Package entry point
├── package.json
└── tsconfig.json
```

---

### 2.5 `/packages/utils` — Shared Utilities

**Purpose**: Pure utility functions shared across apps.

| ✅ Allowed | ❌ Forbidden |
|-----------|-------------|
| Pure functions | Side effects |
| Validation helpers | API calls |
| Formatting utilities | React hooks |
| Type definitions | Stateful logic |

**Consumption**:
```typescript
import { formatCurrency, validatePhoneNumber } from '@translogistics/utils';
```

**Internal Structure**:
```
/packages/utils
├── src/
│   ├── validation/       # Input validators
│   ├── formatting/       # Display formatters
│   ├── constants/        # Shared constants
│   └── index.ts          # Package entry point
├── package.json
└── tsconfig.json
```

---

### 2.6 `/docs` — Documentation

**Purpose**: Architectural documentation, conventions, decision records.

| ✅ Allowed | ❌ Forbidden |
|-----------|-------------|
| Markdown files | Code files |
| Diagrams (Mermaid, images) | Configuration |
| Decision records (ADRs) | Deployment scripts |

---

## 3. Dependency Rules

### 3.1 Dependency Graph

```
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL DEPENDENCIES                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                      /packages/utils                         │
│                    (Pure utilities, no deps)                 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                       /packages/ui                           │
│                   (Depends on: utils)                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
               ▼                               ▼
┌──────────────────────────┐     ┌──────────────────────────┐
│       /apps/web          │     │       /apps/api          │
│   (Depends on: ui, utils)│     │    (Depends on: utils)   │
└──────────────────────────┘     └────────────┬─────────────┘
                                              │
                                              ▼ (HTTP only)
                               ┌──────────────────────────┐
                               │   /services/ai-engine    │
                               │   (Standalone, no deps)  │
                               └──────────────────────────┘
```

### 3.2 Dependency Matrix

| From ↓ / To → | `utils` | `ui` | `web` | `api` | `ai-engine` |
|---------------|---------|------|-------|-------|-------------|
| `utils`       | —       | ❌   | ❌    | ❌    | ❌          |
| `ui`          | ✅      | —    | ❌    | ❌    | ❌          |
| `web`         | ✅      | ✅   | —     | ❌    | ❌          |
| `api`         | ✅      | ❌   | ❌    | —     | ✅ (HTTP)   |
| `ai-engine`   | ❌      | ❌   | ❌    | ❌    | —           |

### 3.3 Rules

1. **No circular dependencies**: If A depends on B, B cannot depend on A.
2. **Packages are foundational**: `/packages/*` cannot depend on `/apps/*` or `/services/*`.
3. **AI Engine is isolated**: Python service has no Node.js dependencies.
4. **API is the bridge**: Only `/apps/api` can call `/services/ai-engine`.
5. **Web calls API only**: `/apps/web` never accesses database or AI Engine directly.

---

## 4. Package Manager Configuration

### 4.1 Workspace Setup (pnpm)

```yaml
# pnpm-workspace.yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 4.2 Package Naming Convention

| Package | Name |
|---------|------|
| `/apps/web` | `@translogistics/web` |
| `/apps/api` | `@translogistics/api` |
| `/packages/ui` | `@translogistics/ui` |
| `/packages/utils` | `@translogistics/utils` |

### 4.3 Version Strategy

- All packages share the same version number (synchronized releases).
- Version bumps are atomic across the monorepo.
