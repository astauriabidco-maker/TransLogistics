# TransLogistics — Project Context

> **Purpose**: Long-term memory for agents and architects.  
> **Audience**: AI agents, senior engineers.  
> **Last Updated**: 2026-02-05

---

## 1. Project Vision

TransLogistics is a **production-grade, multi-hub logistics platform** for West Africa.

The platform enables:
- Shipment booking via WhatsApp
- AI-powered dimension estimation from photos
- Multi-hub route optimization
- Real-time tracking and notifications
- Flexible, versioned pricing

---

## 2. Business Goals

| Priority | Goal | Constraint |
|----------|------|------------|
| P0 | Enable shipment booking via WhatsApp | Must work on basic smartphones |
| P0 | Accurate pricing without physical measurement | ±10% tolerance on dimensions |
| P0 | Multi-hub operations | Each hub operates independently |
| P1 | Real-time tracking | SMS/WhatsApp notifications |
| P1 | Driver dispatch | Mobile-friendly interface |
| P2 | Partner API integrations | REST API with API key auth |

---

## 3. Non-Negotiable Principles

### 3.1 Domain Integrity

These entities are **immutable in name and purpose**:

```
User, Hub, Route, PricingRule, Shipment, Quote,
ScanResult, Payment, Referral, Driver, DispatchTask
```

No feature may bypass these core entities.

### 3.2 WhatsApp State Machine

All WhatsApp interactions **must** follow this progression:

```
INIT → CHOIX_SERVICE → SCAN_PHOTO → CALCUL_PRIX → CONFIRMATION → PAIEMENT → SUIVI
```

- No state skipping allowed
- State is persisted server-side
- Session timeout: 24 hours of inactivity

### 3.3 VolumeScan AI (MVP)

| Rule | Value |
|------|-------|
| Input | Single image |
| Reference object | A4 sheet (210 × 297 mm) |
| Output tolerance | ±10% |
| Low confidence | Fallback to manual validation |
| Audit | All scans stored with metadata and model version |

❌ No multi-angle  
❌ No LiDAR  
❌ No unsupervised deployment

### 3.4 Code Quality

| Always | Never |
|--------|-------|
| Production-ready code | Over-engineering |
| Explicit types everywhere | Speculative features |
| Defensive programming | Unnecessary abstractions |
| Clear error handling | TODOs without context |
| Auditability over cleverness | Heuristics over data |

---

## 4. Target Users

| User Type | Primary Channel | Key Actions |
|-----------|-----------------|-------------|
| **Customer** | WhatsApp, Web | Book shipment, track package, pay |
| **Hub Operator** | Web Dashboard | Scan packages, manage routes, dispatch |
| **Driver** | Mobile Web | Receive tasks, update status, collect payment |
| **Admin** | Web Dashboard | Configure pricing, manage users, view analytics |
| **Partner** | REST API | Integrate shipping into their platform |

---

## 5. Geographic Scope

### Primary Markets (MVP)
- Côte d'Ivoire
- Senegal

### Expansion Targets (Post-MVP)
- Mali
- Burkina Faso
- Guinea

### Implications
| Aspect | Decision |
|--------|----------|
| Currency | XOF (CFA Franc) primary |
| Language | French primary, English secondary |
| Phone format | International (+225, +221, etc.) |
| Payment methods | Mobile Money (Orange, MTN, Wave), Cash |
| Network conditions | Optimize for 3G, handle offline gracefully |

---

## 6. Key Constraints

| Constraint | Reason | Impact |
|------------|--------|--------|
| WhatsApp-first | Smartphone penetration, low data usage | No complex UI required for booking |
| Offline resilience | Unreliable connectivity | State persistence, retry mechanisms |
| Low-end devices | Majority on budget phones | PWA, minimal JS, fast load |
| Multi-hub isolation | Different operators per region | Per-hub data separation |
| Regulatory compliance | Local transport laws | Audit trails, receipts |

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| WhatsApp booking completion rate | > 70% |
| VolumeScan accuracy | Within ±10% of manual |
| API response time (p95) | < 500ms |
| System uptime | > 99.5% |
| Customer satisfaction (NPS) | > 40 |
