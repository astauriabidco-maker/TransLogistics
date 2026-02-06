# TransLogistics — Domain Specification

> **Version**: 1.0.0  
> **Status**: Draft  
> **Phase**: 1 — Domain Model Definition

---

## 1. Entity Catalog

### 1.1 User

**Responsibility**: Represents any authenticated identity in the system.

**Lifecycle**:
```
CREATED → ACTIVE → SUSPENDED → DELETED
```

**Owns**:
- Authentication credentials (password hash, tokens)
- Profile information (name, phone, email)
- Role assignments

**Must Never**:
- Own business entities directly (uses associations)
- Store payment credentials (delegated to payment provider)
- Bypass role-based access control

**Roles**:
| Role | Description |
|------|-------------|
| `CUSTOMER` | End user booking shipments |
| `HUB_OPERATOR` | Staff managing a specific hub |
| `DRIVER` | Delivery personnel |
| `HUB_ADMIN` | Administrator for a hub |
| `PLATFORM_ADMIN` | System-wide administrator |

---

### 1.2 Hub

**Responsibility**: A physical logistics location that processes shipments.

**Lifecycle**:
```
DRAFT → ACTIVE → SUSPENDED → CLOSED
```

**Owns**:
- Physical location (address, coordinates)
- Operating configuration (hours, capacity)
- Staff assignments (operators, drivers)

**Must Never**:
- Process shipments when SUSPENDED or CLOSED
- Operate outside defined hours without override
- Have overlapping service areas without explicit resolution

**Invariants**:
- A Hub must have at least one HUB_ADMIN
- A Hub must have valid coordinates within service region
- Operating hours must be contiguous blocks

---

### 1.3 Route

**Responsibility**: A defined logistics path between two hubs.

**Lifecycle**:
```
DRAFT → ACTIVE → SUSPENDED → DEPRECATED
```

**Owns**:
- Origin and destination hub references
- Distance and duration estimates
- Scheduling constraints

**Must Never**:
- Connect a hub to itself (origin ≠ destination)
- Exist without both hubs being ACTIVE
- Have negative or zero distance

**Invariants**:
- Routes are unidirectional (A→B ≠ B→A)
- Distance must be > 0 km
- Duration must be > 0 minutes
- A route can only be ACTIVE if both hubs are ACTIVE

---

### 1.4 PricingRule

**Responsibility**: Versioned formula for calculating shipment prices.

**Lifecycle**:
```
DRAFT → ACTIVE → SUPERSEDED
```

**Owns**:
- Version number
- Pricing formula components (base, weight, volume multipliers)
- Effective date range
- Route scope (specific route or global)

**Must Never**:
- Be modified once ACTIVE (immutable)
- Affect quotes created before its effectiveFrom date
- Have overlapping validity periods for the same route

**Invariants**:
- Version is monotonically increasing per route
- effectiveFrom < effectiveTo (or effectiveTo is null for indefinite)
- Only ONE active rule per route at any time
- Base price must be > 0

**Versioning Rule**:
```
When updating pricing:
1. Create new PricingRule with incremented version
2. Set old rule's effectiveTo = new rule's effectiveFrom
3. Old rule transitions to SUPERSEDED
```

---

### 1.5 Shipment

**Responsibility**: A package lifecycle from booking to delivery.

**Lifecycle**:
```
DRAFT → QUOTED → CONFIRMED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED
                     ↓
                 CANCELLED
```

**Owns**:
- Tracking code (unique, immutable after creation)
- Origin and destination addresses
- Package description
- Timeline (created, confirmed, delivered timestamps)

**Must Never**:
- Change route after CONFIRMED
- Be delivered before being picked up (state order is strict)
- Exist without a Quote (once past DRAFT)
- Have multiple active DispatchTasks

**Invariants**:
- Tracking code is globally unique
- Status transitions follow strict order
- A shipment must have exactly one Quote when QUOTED or beyond
- A shipment must have exactly one Payment when CONFIRMED or beyond

---

### 1.6 Quote

**Responsibility**: A price calculation result for a shipment.

**Lifecycle**:
```
PENDING → ACCEPTED → EXPIRED
             ↓
          REJECTED
```

**Owns**:
- Calculated price breakdown (base, weight, volume, total)
- Dimensions and weight used for calculation
- PricingRule reference (snapshot, not live reference)
- Validity period

**Must Never**:
- Be modified after ACCEPTED (immutable)
- Outlive its validity period (auto-EXPIRED)
- Reference a future PricingRule

**Invariants**:
- Total price = base + (weight × pricePerKg) + (volume × pricePerCm³)
- Quote is immutable once shipment is CONFIRMED
- validUntil must be in the future at creation time
- One shipment has exactly one Quote

---

### 1.7 ScanResult

**Responsibility**: Output from VolumeScan AI dimension estimation.

**Lifecycle**:
```
PROCESSING → COMPLETED → VALIDATED
                ↓
             REJECTED (manual override)
```

**Owns**:
- Estimated dimensions (L×W×H in cm)
- Confidence score (0.0 - 1.0)
- Model version string
- Processing metadata
- Original image hash (not the image)

**Must Never**:
- Store the original image (only hash for verification)
- Be modified after COMPLETED (except validation status)
- Exist without model version tracking

**Invariants**:
- confidence ∈ [0.0, 1.0]
- All dimensions > 0
- modelVersion follows semver format
- If confidence < 0.60, requiresManualValidation = true

**Confidence Thresholds**:
| Range | Action |
|-------|--------|
| ≥ 0.85 | Auto-accept |
| 0.60 - 0.84 | Accept with warning |
| < 0.60 | Require manual validation |

---

### 1.8 Payment

**Responsibility**: Financial transaction for a shipment.

**Lifecycle**:
```
PENDING → PROCESSING → COMPLETED
               ↓
            FAILED → PENDING (retry)
               ↓
           REFUNDED
```

**Owns**:
- Amount in XOF
- Payment method (MOBILE_MONEY, CASH, CARD)
- Gateway reference (external transaction ID)
- Status and status history

**Must Never**:
- Be partially refunded (full refund only in MVP)
- Change amount after PROCESSING begins
- Exist without a shipment reference

**Invariants**:
- Amount must equal Quote.totalPrice
- A shipment has exactly one Payment
- REFUNDED is only reachable from COMPLETED
- Gateway reference is unique per provider

---

### 1.9 Driver

**Responsibility**: A delivery personnel with assigned vehicle.

**Lifecycle**:
```
ONBOARDING → ACTIVE → SUSPENDED → TERMINATED
```

**Owns**:
- User reference (1:1 with User of role DRIVER)
- Vehicle information
- Hub assignment
- Availability status

**Must Never**:
- Be assigned to multiple hubs simultaneously
- Accept tasks while SUSPENDED
- Operate without valid vehicle assignment

**Invariants**:
- Exactly one Driver per User with role DRIVER
- Driver.hubId must reference an ACTIVE hub
- isAvailable can only be true if status is ACTIVE

---

### 1.10 DispatchTask

**Responsibility**: Assignment of driver to deliver shipment(s).

**Lifecycle**:
```
ASSIGNED → EN_ROUTE_PICKUP → PICKED_UP → EN_ROUTE_DELIVERY → DELIVERED
                                              ↓
                                           FAILED
```

**Owns**:
- Driver reference
- Shipment references (one or more)
- Timestamps for each status transition
- Proof of delivery (signature hash, photo hash)

**Must Never**:
- Have shipments from different routes in same task
- Be reassigned to different driver after EN_ROUTE_PICKUP
- Complete without proof of delivery

**Invariants**:
- All shipments in a task must share the same Route
- Task cannot be ASSIGNED if driver is not ACTIVE and available
- DELIVERED requires proof of delivery
- Task status changes propagate to associated Shipment statuses

---

### 1.11 Referral

**Responsibility**: Tracks customer acquisition through referral program.

**Lifecycle**:
```
CREATED → CONVERTED → REWARDED
              ↓
           EXPIRED
```

**Owns**:
- Referrer user reference
- Referee user reference (after conversion)
- Referral code
- Reward status

**Must Never**:
- Allow self-referral (referrer ≠ referee)
- Credit rewards before conversion
- Allow multiple referrals for same referee

**Invariants**:
- Referral code is unique
- One user can refer many, but can only be referred once
- Conversion requires referee's first completed shipment
- Referral expires after 30 days if not converted

---

## 2. Relationship Matrix

### 2.1 Entity Cardinalities

```
User 1──────────0..1 Driver
User 1──────────0..* Shipment (as customer)
User 1──────────0..* Referral (as referrer)
User 0..1───────0..1 Referral (as referee)

Hub 1───────────0..* Route (as origin)
Hub 1───────────0..* Route (as destination)
Hub 1───────────0..* Driver

Route 1─────────0..* PricingRule
Route 1─────────0..* Shipment

Shipment 1──────1 Quote
Shipment 1──────0..1 ScanResult
Shipment 1──────1 Payment
Shipment 0..*───0..1 DispatchTask

Driver 1────────0..* DispatchTask
```

### 2.2 Aggregate Roots

| Aggregate | Root Entity | Contained Entities |
|-----------|-------------|---------------------|
| **User Aggregate** | User | (none, Driver is separate) |
| **Hub Aggregate** | Hub | (none) |
| **Logistics Aggregate** | Route | PricingRule (versioned) |
| **Shipment Aggregate** | Shipment | Quote, ScanResult, Payment |
| **Dispatch Aggregate** | DispatchTask | (shipment references only) |
| **Driver Aggregate** | Driver | (none) |
| **Referral Aggregate** | Referral | (none) |

### 2.3 Consistency Boundaries

| Operation | Consistency Boundary | Reason |
|-----------|----------------------|--------|
| Create Quote | Shipment Aggregate | Quote depends on ScanResult |
| Confirm Shipment | Shipment Aggregate | Locks Quote, requires Payment |
| Update Pricing | Route Aggregate | New version, old unchanged |
| Dispatch Shipment | Dispatch Aggregate | Cross-aggregate, eventual |
| Complete Delivery | Dispatch + Shipment | Two aggregates, saga pattern |

---

## 3. Domain Invariants

### 3.1 Booking Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| B1 | A Quote is immutable once its Shipment is CONFIRMED | Quote.accept() locks all fields |
| B2 | A Shipment cannot be CONFIRMED without a Quote | State machine guard |
| B3 | A Shipment cannot be CONFIRMED without a Payment in COMPLETED | State machine guard |
| B4 | Quote.validUntil must be in the future at acceptance | Domain validation |

### 3.2 Pricing Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| P1 | A PricingRule cannot affect past Quotes | Quote snapshots rule at creation |
| P2 | Only one PricingRule per Route can be ACTIVE at any time | Service-level check on activation |
| P3 | PricingRule versions are monotonically increasing | Domain service |
| P4 | Base price must be > 0 | Value object validation |

### 3.3 Tracking Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| T1 | Tracking code is globally unique | Database constraint + generation |
| T2 | Shipment status can only move forward (no rollback except CANCEL) | State machine |
| T3 | A Shipment must be PICKED_UP before IN_TRANSIT | State machine guard |
| T4 | A Shipment must be IN_TRANSIT before DELIVERED | State machine guard |

### 3.4 Scan Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| S1 | ScanResult must include model version | Value object |
| S2 | If confidence < 0.60, requiresManualValidation = true | Domain rule |
| S3 | ScanResult dimensions must all be positive | Value object validation |
| S4 | ScanResult is immutable after COMPLETED | Entity behavior |

### 3.5 Hub/Route Invariants

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| H1 | A Route cannot be ACTIVE if either Hub is not ACTIVE | State machine guard |
| H2 | Route origin ≠ destination | Constructor validation |
| H3 | Hub must have at least one HUB_ADMIN | Service-level check |

---

## 4. Domain Events

### 4.1 User Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `UserCreated` | User registration | Referral, Notification |
| `UserSuspended` | Admin action | Shipment, Driver |
| `UserRoleAssigned` | Role change | Access control |

### 4.2 Hub Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `HubActivated` | Hub goes live | Route, Notification |
| `HubSuspended` | Admin action | Route, Shipment, Driver |
| `HubClosed` | Permanent closure | Route (deprecate all) |

### 4.3 Route Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `RouteActivated` | Route goes live | Pricing, Shipment |
| `RouteDeprecated` | Route retired | Shipment (block new) |

### 4.4 Pricing Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `PricingRuleCreated` | New pricing version | Quote service |
| `PricingRuleActivated` | Rule becomes effective | Quote service |
| `PricingRuleSuperseded` | Replaced by newer version | Audit log |

### 4.5 Shipment Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `ShipmentCreated` | Draft shipment created | Analytics |
| `ShipmentQuoted` | Quote assigned | Notification |
| `ShipmentConfirmed` | Customer confirms + pays | Dispatch, Notification |
| `ShipmentPickedUp` | Driver picks up | Tracking, Notification |
| `ShipmentInTransit` | En route | Tracking |
| `ShipmentDelivered` | Delivery confirmed | Payment, Notification, Referral |
| `ShipmentCancelled` | Customer/admin cancels | Payment (refund), Analytics |

### 4.6 Scan Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `ScanRequested` | Image submitted | AI Engine |
| `ScanCompleted` | AI returns result | Quote, Shipment |
| `ScanValidated` | Manual validation done | Quote |
| `ScanRejected` | Manual override | Quote (re-trigger) |

### 4.7 Payment Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `PaymentInitiated` | Customer starts payment | Payment gateway |
| `PaymentProcessing` | Gateway confirms receipt | Shipment (wait) |
| `PaymentCompleted` | Payment successful | Shipment (confirm), Notification |
| `PaymentFailed` | Payment declined | Notification, Analytics |
| `PaymentRefunded` | Refund processed | Shipment, Notification |

### 4.8 Dispatch Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `TaskAssigned` | Dispatcher assigns | Driver, Notification |
| `TaskStarted` | Driver begins | Shipment, Tracking |
| `TaskPickupComplete` | All shipments picked | Shipment, Tracking |
| `TaskDeliveryComplete` | All shipments delivered | Shipment, Tracking, Payment |
| `TaskFailed` | Delivery failed | Shipment, Notification, Dispatch |

### 4.9 Referral Events

| Event | Trigger | Consumers |
|-------|---------|-----------|
| `ReferralCreated` | Code generated | User |
| `ReferralConverted` | Referee completes first shipment | Reward service |
| `ReferralRewarded` | Rewards credited | User, Notification |
| `ReferralExpired` | 30 days without conversion | Cleanup |

---

## 5. Decisions & Justifications

### 5.1 Why Unidirectional Routes?

**Decision**: A→B is a different Route than B→A.

**Justification**:
- Different pricing may apply per direction
- Different distance/duration estimates
- Logistics constraints differ by direction
- Explicit is better than implicit

### 5.2 Why Immutable Quotes?

**Decision**: Quote is immutable once Shipment is CONFIRMED.

**Justification**:
- Price disputes require audit trail
- Customer confirmed this specific price
- Legal compliance
- Prevents manipulation

### 5.3 Why Versioned PricingRules?

**Decision**: Never modify, always create new version.

**Justification**:
- Audit trail for price changes
- Existing quotes unaffected
- Easy rollback (activate old version)
- Temporal queries possible

### 5.4 Why Shipment Aggregate Contains Quote?

**Decision**: Quote is part of Shipment aggregate, not standalone.

**Justification**:
- Quote has no meaning without Shipment
- 1:1 relationship
- Transactional consistency required
- Simpler invariant enforcement

### 5.5 Why Driver is Separate from User?

**Decision**: Driver is not a User subtype but a related entity.

**Justification**:
- Driver has additional data (vehicle, hub assignment)
- User role can change without affecting Driver record
- Separation of concerns
- Driver aggregates work-related state

---

## 6. Glossary

| Term | Definition |
|------|------------|
| **Aggregate** | Cluster of entities with transactional boundary |
| **Aggregate Root** | Entry point entity for the aggregate |
| **Domain Event** | Something that happened that domain experts care about |
| **Invariant** | Business rule that must always be true |
| **Value Object** | Immutable object defined by its attributes |
| **Entity** | Object with identity and lifecycle |
| **CQRS** | Command Query Responsibility Segregation |
| **Saga** | Long-running transaction across aggregates |
