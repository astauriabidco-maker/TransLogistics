# TransLogistics — Domain Model

> **Purpose**: Define core domain concepts for agent understanding.  
> **Audience**: AI agents, senior engineers.  
> **Last Updated**: 2026-02-05

---

## 1. Entity Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     TRANSLOGISTICS DOMAIN                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User ────────────────────┐                                    │
│                            │                                    │
│   Hub ─────────────────────┼───── Route                         │
│                            │         │                          │
│   PricingRule (versioned) ─┘         │                          │
│                                      │                          │
│   Shipment ◄─────────────────────────┘                          │
│       │                                                         │
│       ├── Quote                                                 │
│       ├── ScanResult                                            │
│       ├── Payment                                               │
│       └── DispatchTask ───── Driver                             │
│                                                                 │
│   Referral ───── User                                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Entity Definitions

### 2.1 User

**Purpose**: Represents any person interacting with the platform.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Identity and authentication | Business logic execution |
| Role assignment (customer, operator, admin) | Direct database access |
| Contact information | Payment processing |
| Session management | Route calculation |

**Key Attributes**: id, phone, email, role, hubId (optional), createdAt

---

### 2.2 Hub

**Purpose**: A physical logistics location that processes shipments.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Geographic location definition | User authentication |
| Operating hours and capacity | Payment collection |
| Staff assignment (operators, drivers) | Pricing calculations |
| Inventory of packages at location | AI processing |

**Key Attributes**: id, name, address, coordinates, timezone, isActive

**Isolation Rule**: Hubs operate independently. Cross-hub queries require explicit authorization.

---

### 2.3 Route

**Purpose**: A defined path between two hubs with associated cost and time estimates.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Origin and destination hubs | Driver assignment |
| Distance and estimated duration | Live tracking |
| Active/inactive status | Payment processing |
| Route scheduling constraints | Customer communication |

**Key Attributes**: id, originHubId, destinationHubId, distanceKm, durationMinutes, isActive

---

### 2.4 PricingRule

**Purpose**: Versioned rules for calculating shipment prices.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Price calculation formula | Quote generation (that's Quote's job) |
| Weight and dimension multipliers | Payment collection |
| Route-specific pricing | Customer discounts (applies separately) |
| Effective date ranges | UI presentation |

**Key Attributes**: id, version, routeId, basePriceXOF, pricePerKg, pricePerCm3, effectiveFrom, effectiveTo

**Versioning Rule**: Never modify a PricingRule. Create a new version instead.

---

### 2.5 Shipment

**Purpose**: A package being transported from origin to destination.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Package lifecycle management | Price calculation (that's Quote) |
| Current status and location | Driver routing |
| Origin/destination addresses | Payment processing |
| Tracking history | AI dimension estimation |

**Key Attributes**: id, trackingCode, status, originAddress, destinationAddress, quoteId, createdAt

**Status Values**: DRAFT, QUOTED, CONFIRMED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY, DELIVERED, CANCELLED

---

### 2.6 Quote

**Purpose**: A price estimate for a potential or confirmed shipment.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Final price calculation | Payment collection |
| Dimension and weight storage | Shipment status management |
| Price breakdown (base, weight, volume) | Customer communication |
| Validity period | Route selection |

**Key Attributes**: id, shipmentId, pricingRuleId, dimensionsCm, weightKg, totalPriceXOF, validUntil

**Rule**: A Quote becomes immutable once a Shipment is CONFIRMED.

---

### 2.7 ScanResult

**Purpose**: Output from VolumeScan AI dimension estimation.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Storing estimated dimensions | Price calculation |
| Confidence score | Final dimension decision (user validates) |
| Model version tracking | Image storage (stores hash, not image) |
| Processing metadata | Customer-facing display |

**Key Attributes**: id, shipmentId, lengthCm, widthCm, heightCm, confidence, modelVersion, requiresManualValidation

**Audit Rule**: Every scan must be stored with full metadata for traceability.

---

### 2.8 Payment

**Purpose**: A financial transaction for a shipment.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Transaction recording | Price negotation |
| Payment method tracking | Shipment status updates |
| Status management (pending, completed, failed) | Refund policy decisions |
| External gateway references | Customer communication |

**Key Attributes**: id, shipmentId, amountXOF, method, status, gatewayReference, paidAt

**Status Values**: PENDING, PROCESSING, COMPLETED, FAILED, REFUNDED

---

### 2.9 Driver

**Purpose**: A person who physically transports packages.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Driver identity and contact | Route planning |
| Vehicle assignment | Payment collection decisions |
| Availability status | Pricing |
| Hub assignment | Customer service |

**Key Attributes**: id, userId, hubId, vehicleType, isAvailable, currentLocation

---

### 2.10 DispatchTask

**Purpose**: An assignment of a driver to transport shipments.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Driver-to-shipment assignment | Route calculation |
| Task status tracking | Payment processing |
| Pickup/delivery timestamps | Customer notifications (triggers them) |
| Proof of delivery | Price adjustments |

**Key Attributes**: id, driverId, shipmentIds[], status, assignedAt, completedAt

**Status Values**: ASSIGNED, EN_ROUTE_PICKUP, PICKED_UP, EN_ROUTE_DELIVERY, DELIVERED, FAILED

---

### 2.11 Referral

**Purpose**: Tracks customer referrals for rewards program.

| Responsibility | NOT Responsible For |
|----------------|---------------------|
| Referrer-referee relationship | User registration |
| Referral code management | Payment of rewards (separate process) |
| Conversion tracking | Customer communication |

**Key Attributes**: id, referrerId, refereeId, referralCode, convertedAt, rewardPaid

---

## 3. Cross-Entity Rules

| Rule | Description |
|------|-------------|
| **Single ownership** | Each entity has exactly one owner module |
| **Read-only access** | Other modules can read, but never write |
| **Events for side effects** | Cross-domain changes publish events |
| **No circular dependencies** | Entity A → B means B cannot → A |
| **Versioning over mutation** | For PricingRule, create new version |
| **Audit all writes** | Every write operation is logged |

---

## 4. Entity Ownership Map

| Entity | Owner Module | Can Read |
|--------|--------------|----------|
| User | auth | All |
| Hub | hub | route, shipment, dispatch |
| Route | route | shipment, pricing |
| PricingRule | pricing | quote |
| Shipment | shipment | payment, dispatch, tracking |
| Quote | quote | shipment |
| ScanResult | scan | quote, shipment |
| Payment | payment | shipment |
| Driver | driver | dispatch |
| DispatchTask | dispatch | tracking |
| Referral | referral | user |
