# TransLogistics — System Architecture

> **Version**: 1.0.0  
> **Status**: Foundation  
> **Last Updated**: 2026-02-05

---

## 1. System Overview

TransLogistics is a **multi-hub logistics platform** built as a monorepo containing:

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Web App** | Next.js 15 (App Router) | Customer portal, Hub dashboards, Admin console |
| **API** | Node.js (Next.js API Routes) | Business logic, persistence, integrations |
| **AI Engine** | Python (FastAPI) | VolumeScan AI, dimension estimation |

---

## 2. Component Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Web App    │  │  WhatsApp   │  │  Partner Integrations   │  │
│  │  (Next.js)  │  │  (Webhook)  │  │  (REST API)             │  │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘  │
└─────────┼────────────────┼──────────────────────┼───────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                          │
│                      /apps/api                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Routes: /shipments, /quotes, /users, /hubs, /payments  │    │
│  │  Auth: JWT + API Keys                                   │    │
│  │  Rate Limiting: Per-tenant throttling                   │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │
          ├──────────────────────────────────┐
          ▼                                  ▼
┌─────────────────────────┐    ┌─────────────────────────────────┐
│      DATA LAYER         │    │       AI ENGINE                 │
│  ┌───────────────────┐  │    │       /services/ai-engine       │
│  │  PostgreSQL       │  │    │  ┌───────────────────────────┐  │
│  │  (Primary DB)     │  │    │  │  VolumeScan AI            │  │
│  └───────────────────┘  │    │  │  - Single image input     │  │
│  ┌───────────────────┐  │    │  │  - A4 reference object    │  │
│  │  Redis            │  │    │  │  - ±10% tolerance         │  │
│  │  (Cache/Sessions) │  │    │  └───────────────────────────┘  │
│  └───────────────────┘  │    └─────────────────────────────────┘
└─────────────────────────┘
```

---

## 3. Service Responsibilities

### 3.1 Web App (`/apps/web`)
| Responsibility | Description |
|----------------|-------------|
| **Customer Portal** | Shipment tracking, quote requests, payment |
| **Hub Dashboard** | Route management, driver assignment, scanning |
| **Admin Console** | Pricing rules, user management, analytics |

**Technology Stack**:
- Next.js 15 with App Router
- TypeScript (strict mode)
- PWA-ready (service workers, offline support)

### 3.2 API Layer (`/apps/api`)
| Responsibility | Description |
|----------------|-------------|
| **Business Logic** | All domain operations (Shipment, Quote, Payment) |
| **Persistence** | Prisma ORM → PostgreSQL |
| **Integrations** | WhatsApp webhook, payment gateways, SMS |
| **Authentication** | JWT for users, API keys for partners |

**Technology Stack**:
- Next.js API Routes (primary)
- Express middleware (if needed for complex routing)
- Prisma ORM

### 3.3 AI Engine (`/services/ai-engine`)
| Responsibility | Description |
|----------------|-------------|
| **VolumeScan AI** | Dimension estimation from single photo |
| **Validation** | Confidence scoring, fallback triggers |
| **Auditability** | Metadata storage, model versioning |

**Technology Stack**:
- Python 3.11+
- FastAPI
- Computer Vision model (TBD)

---

## 4. Inter-Service Communication

| From | To | Protocol | Purpose |
|------|----|----------|---------|
| `web` | `api` | HTTPS (REST) | All user operations |
| `api` | `ai-engine` | HTTPS (REST) | Dimension estimation requests |
| `api` | PostgreSQL | TCP | Data persistence |
| `api` | Redis | TCP | Caching, session storage |
| External | `api` | HTTPS (Webhook) | WhatsApp messages |

### Communication Rules

1. **Web → API**: Always via Next.js server actions or API routes. No direct DB access.
2. **API → AI Engine**: Synchronous HTTP calls with timeout (30s max).
3. **AI Engine → API**: Never. AI Engine is stateless and request-driven.
4. **Shared Packages**: Consumed via workspace dependencies (`@translogistics/ui`, `@translogistics/utils`).

---

## 5. Security Boundaries

### 5.1 Authentication Layers

| Layer | Mechanism | Token Type |
|-------|-----------|------------|
| Customer / Admin | JWT (HttpOnly cookie) | Access + Refresh |
| Partner API | API Key (header) | `X-API-Key` |
| Inter-service | Internal API Key | `X-Internal-Key` |

### 5.2 Data Isolation

- **Multi-hub**: Each Hub operates in isolation. Cross-hub queries require explicit authorization.
- **PII Protection**: Customer personal data is encrypted at rest. Logs are sanitized.
- **Audit Trail**: All write operations are logged with actor, timestamp, and payload hash.

### 5.3 Network Security

- All services behind reverse proxy (nginx/Caddy)
- TLS 1.3 enforced
- AI Engine not exposed publicly (internal network only)

---

## 6. Scalability Considerations

| Component | Scaling Strategy |
|-----------|------------------|
| **Web App** | Horizontal (Vercel auto-scaling) |
| **API** | Horizontal (container replicas) |
| **AI Engine** | Horizontal with GPU nodes (if needed) |
| **Database** | Vertical first, then read replicas |
| **Redis** | Cluster mode for high availability |

---

## 7. Failure Modes & Fallbacks

| Failure | Detection | Fallback |
|---------|-----------|----------|
| AI Engine unavailable | Health check timeout | Manual dimension entry |
| Low AI confidence | Confidence score < threshold | Manual validation prompt |
| Payment gateway down | HTTP 5xx | Retry queue + user notification |
| WhatsApp API down | Webhook failure | SMS fallback (if configured) |

---

## 8. Domain Model Reference

> **Note**: Detailed schemas are defined in Prisma. This is a conceptual overview.

```
User ─────────────────┐
                      │
Hub ──────────────────┼───── Route
                      │         │
PricingRule (versioned)         │
                      │         │
Shipment ◄────────────┴─────────┘
    │
    ├── Quote
    ├── ScanResult
    ├── Payment
    └── DispatchTask ───── Driver

Referral ───── User
```

---

## 9. Technology Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Monorepo | Yes | Atomic changes, shared packages, unified CI |
| Next.js 15 | App Router | Server components, streaming, modern patterns |
| Prisma | ORM | Type safety, migrations, introspection |
| FastAPI | AI service | Python ecosystem for ML, async performance |
| PostgreSQL | Primary DB | ACID compliance, JSON support, mature |
| Redis | Cache | Session storage, rate limiting, pub/sub |
