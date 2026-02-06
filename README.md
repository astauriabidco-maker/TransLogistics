# TransLogistics

> Production-grade, multi-hub logistics platform with AI-powered volume scanning.

---

## 🏗️ Architecture

| Component | Technology | Purpose |
|-----------|------------|---------|
| **Web App** | Next.js 15 | Customer portal, Hub dashboards, Admin |
| **API** | Node.js | Business logic, persistence, integrations |
| **AI Engine** | Python FastAPI | VolumeScan dimension estimation |

---

## 📁 Repository Structure

```
/apps
  /web        → Next.js 15 (App Router, TypeScript, PWA-ready)
  /api        → Node.js API Layer

/services
  /ai-engine  → Python FastAPI (VolumeScan AI)

/packages
  /ui         → Shared React Components
  /utils      → Shared Utilities

/docs         → Architecture & Conventions
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System overview, component boundaries |
| [REPO_STRUCTURE.md](./docs/REPO_STRUCTURE.md) | Folder responsibilities, dependency rules |
| [CONVENTIONS.md](./docs/CONVENTIONS.md) | Naming conventions, coding standards |

---

## 🚀 Quick Start

> ⚠️ **Prerequisites**: Node.js 20+, pnpm 8+, Python 3.11+, PostgreSQL 15+, Redis 7+

```bash
# 1. Clone the repository
git clone <repository-url>
cd TransLogistics

# 2. Install dependencies
pnpm install

# 3. Set up environment
cp .env.example .env.local
# Edit .env.local with your values

# 4. Start development servers
pnpm dev
```

---

## 🧩 Core Domain Entities

| Entity | Description |
|--------|-------------|
| `User` | Platform users (customers, operators, admins) |
| `Hub` | Logistics hub locations |
| `Route` | Defined routes between hubs |
| `PricingRule` | Versioned pricing configurations |
| `Shipment` | Package shipments |
| `Quote` | Price quotes for shipments |
| `ScanResult` | VolumeScan AI results |
| `Payment` | Payment transactions |
| `Driver` | Delivery drivers |
| `DispatchTask` | Driver assignments |
| `Referral` | Referral program entries |

---

## 🤖 VolumeScan AI (MVP)

- **Input**: Single photo with A4 sheet reference
- **Output**: Dimensions (L×W×H) with ±10% tolerance
- **Fallback**: Manual validation for low confidence

---

## 💬 WhatsApp Flow

```
INIT → CHOIX_SERVICE → SCAN_PHOTO → CALCUL_PRIX → CONFIRMATION → PAIEMENT → SUIVI
```

State is persisted server-side. No deviation allowed.

---

## 📜 License

Proprietary. All rights reserved.
