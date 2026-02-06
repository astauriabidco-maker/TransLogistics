# TransLogistics — Coding Conventions

> **Version**: 1.0.0  
> **Status**: Foundation  
> **Last Updated**: 2026-02-05

---

## 1. Naming Conventions

### 1.1 Files & Folders

| Type | Convention | Example |
|------|------------|---------|
| **Folders** | kebab-case | `pricing-rules/`, `scan-result/` |
| **React Components** | PascalCase.tsx | `ShipmentCard.tsx`, `QuoteForm.tsx` |
| **Utilities** | kebab-case.ts | `format-currency.ts`, `validate-phone.ts` |
| **API Routes** | kebab-case | `/api/pricing-rules`, `/api/scan-result` |
| **Prisma Models** | PascalCase | `PricingRule`, `ScanResult` |
| **Python Modules** | snake_case.py | `volume_scan.py`, `image_processor.py` |
| **Test Files** | `*.test.ts` / `*.spec.ts` | `shipment.service.test.ts` |

### 1.2 Variables & Functions

| Language | Variables | Functions | Constants |
|----------|-----------|-----------|-----------|
| **TypeScript** | camelCase | camelCase | SCREAMING_SNAKE_CASE |
| **Python** | snake_case | snake_case | SCREAMING_SNAKE_CASE |

### 1.3 Types & Interfaces

```typescript
// ✅ Correct
interface ShipmentCreateInput { ... }
type PaymentStatus = 'pending' | 'completed' | 'failed';

// ❌ Incorrect
interface IShipmentCreateInput { ... }  // No "I" prefix
type paymentStatus = ...;               // Must be PascalCase
```

### 1.4 Database Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Table names | PascalCase (Prisma model) | `PricingRule` |
| Column names | camelCase | `createdAt`, `hubId` |
| Foreign keys | `{relation}Id` | `shipmentId`, `driverId` |
| Enum values | SCREAMING_SNAKE_CASE | `PENDING`, `IN_TRANSIT` |

---

## 2. Domain Boundaries

### 2.1 Entity Ownership

Each domain entity belongs to exactly one module:

| Entity | Owner Module | Secondary Access |
|--------|--------------|------------------|
| `User` | `auth` | All modules (read-only) |
| `Hub` | `hub` | `route`, `shipment` |
| `Route` | `route` | `shipment`, `dispatch` |
| `PricingRule` | `pricing` | `quote` |
| `Shipment` | `shipment` | `payment`, `dispatch` |
| `Quote` | `quote` | `shipment` |
| `ScanResult` | `scan` | `quote`, `shipment` |
| `Payment` | `payment` | `shipment` |
| `Driver` | `driver` | `dispatch` |
| `DispatchTask` | `dispatch` | — |
| `Referral` | `referral` | `user` |

### 2.2 Cross-Domain Rules

1. **Owner writes, others read**: Only the owner module can create/update/delete an entity.
2. **No direct imports**: Modules access other domains via service interfaces, not direct imports.
3. **Events for side effects**: Cross-domain side effects use event-driven patterns.

```typescript
// ✅ Correct: Service interface
class ShipmentService {
  async create(data: ShipmentInput) {
    const quote = await this.quoteService.getById(data.quoteId); // Via interface
    ...
  }
}

// ❌ Incorrect: Direct import
import { quoteRepository } from '../quote/repository'; // Breaks boundary
```

---

## 3. Code Style

### 3.1 TypeScript Rules

```typescript
// ✅ Explicit return types
function calculatePrice(weight: number, distance: number): number {
  return weight * distance * 0.05;
}

// ✅ Explicit null handling
function findUser(id: string): User | null { ... }

// ✅ Defensive guards
function processShipment(shipment: Shipment | null): void {
  if (!shipment) {
    throw new ShipmentNotFoundError();
  }
  // proceed...
}

// ❌ No implicit any
function process(data) { ... }  // Error: implicit any

// ❌ No non-null assertions without justification
const user = users.find(u => u.id === id)!;  // Why is this safe?
```

### 3.2 Error Handling

```typescript
// ✅ Correct: Domain-specific errors
class ShipmentNotFoundError extends Error {
  constructor(id: string) {
    super(`Shipment not found: ${id}`);
    this.name = 'ShipmentNotFoundError';
  }
}

// ✅ Correct: Explicit error propagation
async function getShipment(id: string): Promise<Shipment> {
  const shipment = await repository.findById(id);
  if (!shipment) {
    throw new ShipmentNotFoundError(id);
  }
  return shipment;
}

// ❌ Incorrect: Generic errors
throw new Error('Not found');

// ❌ Incorrect: Silent failures
const result = await fetch(...).catch(() => null);
```

### 3.3 TODO Comments

```typescript
// ✅ Correct: Context-rich TODO
// TODO(2026-Q1): Implement SMS fallback when WhatsApp API is unavailable.
//                Depends on SMS provider selection (see ARCH-42).

// ❌ Incorrect: Orphan TODO
// TODO: fix this later
```

---

## 4. Environment Variables

### 4.1 Naming Convention

```bash
# Format: {SCOPE}_{CATEGORY}_{NAME}

# Database
DATABASE_URL=postgresql://...
DATABASE_POOL_SIZE=10

# Authentication
AUTH_JWT_SECRET=...
AUTH_JWT_EXPIRY=3600

# External Services
WHATSAPP_API_KEY=...
WHATSAPP_WEBHOOK_SECRET=...

# AI Engine
AI_ENGINE_URL=http://localhost:8000
AI_ENGINE_TIMEOUT_MS=30000

# Feature Flags
FEATURE_VOLUMESCAN_ENABLED=true
```

### 4.2 Environment Separation

| File | Purpose | Committed |
|------|---------|-----------|
| `.env.example` | Template with placeholders | ✅ Yes |
| `.env.local` | Local development overrides | ❌ No |
| `.env.development` | Development defaults | ❌ No |
| `.env.staging` | Staging configuration | ❌ No |
| `.env.production` | Production configuration | ❌ No |

### 4.3 Loading Priority

```
1. Process environment (highest priority)
2. .env.local
3. .env.{NODE_ENV}
4. .env (lowest priority)
```

### 4.4 Secrets Handling Principles

1. **Never commit secrets**: All `.env` files except `.env.example` are gitignored.
2. **Use secret managers in production**: AWS Secrets Manager, Vault, or equivalent.
3. **Rotate regularly**: API keys and JWT secrets have defined rotation schedules.
4. **Audit access**: Log when secrets are accessed (not the values).

---

## 5. API Design

### 5.1 URL Structure

```
/api/v1/{resource}              # Collection
/api/v1/{resource}/{id}         # Single resource
/api/v1/{resource}/{id}/{sub}   # Nested resource
```

### 5.2 HTTP Methods

| Method | Purpose | Idempotent |
|--------|---------|------------|
| `GET` | Retrieve resource(s) | Yes |
| `POST` | Create resource | No |
| `PUT` | Replace resource | Yes |
| `PATCH` | Partial update | Yes |
| `DELETE` | Remove resource | Yes |

### 5.3 Response Format

```typescript
// Success
{
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO8601"
  }
}

// Error
{
  "error": {
    "code": "SHIPMENT_NOT_FOUND",
    "message": "Shipment with ID xyz not found",
    "details": { ... }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "ISO8601"
  }
}
```

### 5.4 Health Endpoints (Outside Versioned API)

Health endpoints are **excluded** from the versioned `/api/v1` namespace:

```
/health         # Full status with dependencies
/health/live    # Kubernetes liveness probe
/health/ready   # Kubernetes readiness probe
```

**Rationale**: Health endpoints are infrastructure concerns, not business API.

### 5.5 Pagination

```
GET /api/v1/shipments?page=2&limit=20

Response:
{
  "data": [...],
  "pagination": {
    "page": 2,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

---

## 6. Shared Types Strategy

### 6.1 Type Locations

| Type Category | Location | Example |
|---------------|----------|---------|
| Domain entity interfaces | Generated from Prisma | `Shipment`, `Quote` |
| API request/response DTOs | Per-service | `ShipmentCreateInput` |
| Shared constants | `@translogistics/utils` | `WhatsAppState`, `ShipmentStatus` |
| UI component props | `@translogistics/ui` | `ButtonProps` |

### 6.2 Why Not a Separate `@translogistics/types` Package?

**Decision**: Entity types are generated from Prisma schema.

- Single source of truth (schema.prisma)
- Automatic type generation
- No manual sync between packages

### 6.3 Implementation Pattern

```typescript
// ✅ Correct: Import generated types from Prisma
import type { Shipment, Quote } from '@prisma/client';

// ✅ Correct: Import constants from utils
import { SHIPMENT_STATUSES } from '@translogistics/utils';

// ❌ Incorrect: Manually define entity types
interface Shipment { ... }  // Will drift from schema
```

---

## 7. AI Engine Communication (MVP)

### 7.1 MVP Approach: Synchronous HTTP

For MVP, the API communicates with AI Engine via **direct HTTP calls**:

```
API ──HTTP POST──► AI Engine
API ◄──Response───AI Engine
```

**Timeout**: 30 seconds  
**Fallback**: Manual validation if timeout or error

### 7.2 Post-MVP: Queue-Based

After MVP, migrate to BullMQ:

```
API ──Job──► Redis Queue ──► AI Engine Worker
API ◄───────  Result Callback/Queue
```

See [ASYNC_JOBS.md](./ASYNC_JOBS.md) for queue architecture.

### 7.3 Implementation Pattern (MVP)

```typescript
// API calls AI Engine synchronously
const result = await aiEngineClient.estimateDimensions({
  imageUrl,
  referenceObject: 'A4',
  timeout: 30000,
});

if (!result || result.confidence < 0.6) {
  return { requiresManualValidation: true };
}
```

---

## 8. WhatsApp State Machine

All WhatsApp interactions follow this **mandatory** state progression:

```
INIT → CHOIX_SERVICE → SCAN_PHOTO → CALCUL_PRIX → CONFIRMATION → PAIEMENT → SUIVI
```

### 8.1 State Persistence

```typescript
interface WhatsAppSession {
  phoneNumber: string;
  state: WhatsAppState;
  stateData: Record<string, unknown>;  // Context for current state
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;  // Sessions expire after 24h of inactivity
}
```

### 8.2 State Transitions

| Current State | Valid Next States | Trigger |
|---------------|-------------------|---------|
| `INIT` | `CHOIX_SERVICE` | User sends first message |
| `CHOIX_SERVICE` | `SCAN_PHOTO` | User selects service type |
| `SCAN_PHOTO` | `CALCUL_PRIX` | User sends photo |
| `CALCUL_PRIX` | `CONFIRMATION` | Price calculated successfully |
| `CONFIRMATION` | `PAIEMENT` | User confirms quote |
| `PAIEMENT` | `SUIVI` | Payment completed |
| Any | `INIT` | Session timeout or user restart |

### 8.3 No Deviation Rule

```typescript
// ✅ Correct: Explicit state validation
function transitionState(session: WhatsAppSession, newState: WhatsAppState): void {
  if (!isValidTransition(session.state, newState)) {
    throw new InvalidStateTransitionError(session.state, newState);
  }
  session.state = newState;
}

// ❌ Incorrect: Skipping states
session.state = 'PAIEMENT';  // Direct assignment bypasses validation
```

---

## 9. VolumeScan AI Conventions

### 9.1 Input Requirements

```python
class ScanInput(BaseModel):
    image_base64: str          # Single image, base64 encoded
    reference_object: Literal["A4"]  # Only A4 sheets supported in MVP
    metadata: dict             # Client info, timestamp, etc.
```

### 9.2 Output Format

```python
class ScanResult(BaseModel):
    dimensions: Dimensions     # length, width, height in cm
    confidence: float          # 0.0 to 1.0
    requires_manual_validation: bool
    model_version: str         # e.g., "volumescan-v1.2.0"
    processing_time_ms: int
```

### 9.3 Confidence Thresholds

| Confidence | Action |
|------------|--------|
| ≥ 0.85 | Auto-accept dimensions |
| 0.60 - 0.84 | Proceed with warning |
| < 0.60 | Require manual validation |

### 9.4 Audit Trail

Every scan MUST be stored with:
- Original image hash (not the image itself for storage efficiency)
- Computed dimensions
- Confidence score
- Model version
- Processing timestamp
- Whether manual override was applied

---

## 10. Git Conventions

### 10.1 Branch Naming

```
main                    # Production-ready code
develop                 # Integration branch
feature/{ticket}-{desc} # Feature branches
fix/{ticket}-{desc}     # Bug fixes
hotfix/{desc}           # Production hotfixes
```

### 10.2 Commit Messages

```
{type}({scope}): {description}

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `refactor`: Code refactoring
- `test`: Adding tests
- `chore`: Maintenance

**Examples**:
```
feat(shipment): add real-time tracking webhook
fix(quote): correct pricing calculation for oversized packages
docs(api): update authentication flow diagram
```

### 10.3 Pull Request Rules

1. **Single responsibility**: One PR = one feature or fix.
2. **Tests required**: All PRs must include relevant tests.
3. **Review required**: Minimum 1 approval before merge.
4. **CI must pass**: No merge with failing checks.
