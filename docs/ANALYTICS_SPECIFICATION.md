# TransLogistics — Analytics Domain Specification

> **Purpose**: Define analytics concepts and KPIs computable from existing entities.  
> **Audience**: Data Engineers, Product Managers, AI Agents.  
> **Created**: 2026-02-06

---

## 1. Analytics Concepts

### 1.1 RoutePerformance

**Purpose**: Measures the economic performance of a specific origin→destination corridor.

| Attribute | Source | Computation |
|-----------|--------|-------------|
| routeId | Route.id | Direct |
| routeCode | Route.code | Direct |
| period | Derived | Date truncation |
| shipmentCount | Shipment | COUNT WHERE routeId = X AND status = DELIVERED |
| totalRevenueXof | Payment | SUM(amountXof) WHERE CONFIRMED AND shipment.routeId = X |
| totalVolumetricWeightKg | Quote | SUM(volumetricWeightKg) WHERE shipment.routeId = X |
| totalPayableWeightKg | Quote | SUM(payableWeightKg) WHERE shipment.routeId = X |
| avgDeliveryDays | Shipment | AVG(deliveredAt - confirmedAt) |

---

### 1.2 HubPerformance

**Purpose**: Operational metrics for a physical hub location.

| Attribute | Source | Computation |
|-----------|--------|-------------|
| hubId | Hub.id | Direct |
| hubCode | Hub.code | Direct |
| period | Derived | Date truncation |
| shipmentsOriginated | Shipment | COUNT via Route.originHubId |
| shipmentsReceived | Shipment | COUNT via Route.destinationHubId |
| scanCount | ScanResult | COUNT WHERE hubId = X |
| avgScanConfidence | ScanResult | AVG(confidenceScore) |
| manualValidationRate | ScanResult | COUNT(requiresManualValidation=true) / COUNT |
| activeDrivers | Driver | COUNT WHERE hubId = X AND status = ACTIVE |

---

### 1.3 MarginSnapshot

**Purpose**: Financial margin analysis per route and period.

| Attribute | Source | Computation |
|-----------|--------|-------------|
| routeId | Route.id | Direct |
| period | Derived | Daily/Weekly/Monthly |
| grossRevenueXof | FinancialLedgerEntry | SUM(amountXof) WHERE entryType = CREDIT |
| refundsXof | FinancialLedgerEntry | SUM(amountXof) WHERE entryType = DEBIT |
| netRevenueXof | Derived | grossRevenueXof - refundsXof |
| estimatedCostXof | *External/Future* | Not yet available |
| grossMarginXof | Derived | netRevenueXof - estimatedCostXof (when available) |

> ⚠️ **Note**: Actual cost data (fuel, driver wages, customs) not yet in schema. Margin calculations require future cost tracking model.

---

### 1.4 VolumeUtilization

**Purpose**: Measures accuracy of volumetric vs declared weight.

| Attribute | Source | Computation |
|-----------|--------|-------------|
| shipmentId | Shipment.id | Direct |
| declaredWeightKg | Quote.declaredWeightKg | Direct |
| realWeightKg | Quote.realWeightKg | Direct (if measured) |
| volumetricWeightKg | Quote.volumetricWeightKg | Computed: volume / 5000 |
| payableWeightKg | Quote.payableWeightKg | MAX(real, volumetric) |
| volumetricDeltaKg | Derived | volumetricWeightKg - declaredWeightKg |
| volumetricDeltaPercent | Derived | (delta / declared) * 100 |
| revenueUpliftXof | Derived | (payableWeightKg - declaredWeightKg) * pricePerKg |

**Aggregated (per period)**:
- avgVolumetricDelta
- totalRevenueUplift (from accurate measurement)
- countUnderDeclared (where volumetric > declared)

---

### 1.5 LeadSourcePerformance

**Purpose**: Tracks conversion from WhatsApp leads to confirmed shipments.

| Attribute | Source | Computation |
|-----------|--------|-------------|
| source | WhatsApp metadata | "WHATSAPP_CTA" / "DIRECT" / "REFERRAL" |
| period | Derived | Date truncation |
| leadsInitiated | User | COUNT created via WhatsApp flow |
| quotesGenerated | Quote | COUNT WHERE source session |
| shipmentsConfirmed | Shipment | COUNT WHERE status >= CREATED |
| paymentsCompleted | Payment | COUNT WHERE status = CONFIRMED |
| conversionRate | Derived | shipmentsConfirmed / leadsInitiated |
| revenueXof | Payment | SUM(amountXof) |

> **Tracking requirement**: User or Shipment needs a `leadSource` field to enable this KPI. Currently inferrable from WhatsApp session metadata if stored.

---

## 2. Core KPIs

### 2.1 Revenue KPIs

| KPI | Formula | Data Source |
|-----|---------|-------------|
| **Revenue per Route** | SUM(Payment.amountXof) GROUP BY Shipment.routeId | Payment, Shipment |
| **Revenue per Hub** | SUM via Route.originHubId or destinationHubId | Payment, Route, Hub |
| **ARPS** (Avg Revenue Per Shipment) | SUM(amountXof) / COUNT(shipments) | Payment |
| **Payment Success Rate** | COUNT(CONFIRMED) / COUNT(INITIATED) | Payment |

### 2.2 Operational KPIs

| KPI | Formula | Data Source |
|-----|---------|-------------|
| **Avg Volumetric Delta** | AVG(volumetricWeightKg - declaredWeightKg) | Quote |
| **Scan Accuracy Rate** | COUNT(VALIDATED) / COUNT(COMPLETED) | ScanResult |
| **Manual Validation Rate** | COUNT(requiresManualValidation=true) / COUNT | ScanResult |
| **Delivery Success Rate** | COUNT(DELIVERED) / COUNT(OUT_FOR_DELIVERY) | Shipment |
| **Avg Delivery Time (days)** | AVG(deliveredAt - confirmedAt) | Shipment |

### 2.3 Utilization KPIs

| KPI | Formula | Data Source |
|-----|---------|-------------|
| **Route Utilization** | COUNT(shipments) / Route capacity (if defined) | Shipment, Route |
| **Hub Throughput** | COUNT(shipments) per day | Shipment, Route |
| **Driver Utilization** | COUNT(completed tasks) / available days | DispatchTask, Driver |

### 2.4 Conversion KPIs

| KPI | Formula | Data Source |
|-----|---------|-------------|
| **Quote→Payment Rate** | COUNT(Payment.CONFIRMED) / COUNT(Quote.ACCEPTED) | Quote, Payment |
| **Lead→Quote Rate** | COUNT(Quote) / COUNT(Leads) | Quote, WhatsApp sessions |
| **WhatsApp CTA Conversion** | Shipments from WhatsApp / Total WhatsApp leads | Requires leadSource tracking |

---

## 3. Time Dimensions

| Dimension | Truncation | Primary Use |
|-----------|------------|-------------|
| **Daily** | DATE(createdAt) | Operational dashboards, anomaly detection |
| **Weekly** | DATE_TRUNC('week', createdAt) | Trend analysis, weekly reports |
| **Monthly** | DATE_TRUNC('month', createdAt) | Financial reporting, margin analysis |

### Fiscal Calendar Note
- Week starts: Monday
- Month: Calendar month (1-12)
- Timezone: Hub timezone or UTC for cross-hub aggregations

---

## 4. Data Sources Mapping

| Source Entity | Key Fields for Analytics |
|---------------|-------------------------|
| **Shipment** | id, routeId, customerId, status, confirmedAt, deliveredAt |
| **Quote** | shipmentId, pricingRuleId, totalPriceXof, volumetricWeightKg, payableWeightKg, declaredWeightKg |
| **Payment** | shipmentId, amountXof, status, confirmedAt, provider |
| **ScanResult** | shipmentId, confidenceScore, requiresManualValidation, hubId |
| **FinancialLedgerEntry** | paymentId, shipmentId, entryType, amountXof, createdAt |
| **Route** | id, originHubId, destinationHubId |
| **Hub** | id, code, country, region |
| **DispatchTask** | id, status, driver, shipmentIds |
| **Driver** | id, hubId, status, vehicleCapacityKg |

---

## 5. Schema Changes (Implemented)

| Change | Status | Description |
|--------|--------|-------------|
| `LeadSource` enum | ✅ Added | WHATSAPP_CTA, WHATSAPP_DIRECT, WEB, REFERRAL, B2B_CONTACT, AGENT_ONBOARDING, UNKNOWN |
| `RouteCostType` enum | ✅ Added | FUEL, DRIVER_WAGE, CUSTOMS, HANDLING, INSURANCE, THIRD_PARTY, OTHER |
| `Shipment.leadSource` | ✅ Added | Default UNKNOWN, tracks acquisition channel |
| `RouteCostEntry` model | ✅ Added | Cost tracking per route/period for margin analytics |

> Migration pending: Run `npx prisma migrate dev --name analytics_schema` to apply.

---

## 6. Implementation Priority

| Phase | KPIs | Effort |
|-------|------|--------|
| **P1: Revenue** | Revenue per Route, ARPS, Payment Success | Low (all data exists) |
| **P2: Volumetric** | Avg Delta, Revenue Uplift from measurement | Low (Quote data exists) |
| **P3: Operational** | Delivery Time, Scan Accuracy, Hub Throughput | Low (data exists) |
| **P4: Conversion** | Lead→Quote, Quote→Payment | Medium (needs leadSource field) |
| **P5: Margin** | Gross Margin per Route | High (needs cost model) |
