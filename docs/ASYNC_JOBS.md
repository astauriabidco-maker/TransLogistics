# TransLogistics — Async Job Communication Strategy

> **Status**: High-Level Design  
> **Implementation**: Deferred to Feature Phase

---

## Overview

TransLogistics uses a **Redis-based job queue** architecture for asynchronous operations.

```
┌─────────────────────────────────────────────────────────────────┐
│                         JOB FLOW                                │
│                                                                 │
│  ┌─────────┐     ┌─────────────────┐     ┌──────────────────┐  │
│  │   API   │────▶│   Redis Queue   │────▶│    Workers       │  │
│  │         │     │  (Bull/BullMQ)  │     │                  │  │
│  │         │◀────│                 │◀────│  - AI Engine     │  │
│  └─────────┘     └─────────────────┘     │  - Notifications │  │
│                                          │  - Payments      │  │
│                                          └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Queue Definitions

| Queue Name | Purpose | Consumer | Priority |
|------------|---------|----------|----------|
| `volumescan:process` | AI dimension estimation | AI Engine | High |
| `volumescan:validate` | Manual validation requests | Dashboard | Normal |
| `notifications:whatsapp` | WhatsApp message delivery | API Worker | High |
| `notifications:sms` | SMS fallback delivery | API Worker | Normal |
| `payments:process` | Payment webhook handling | API Worker | Critical |
| `payments:refund` | Refund processing | API Worker | Normal |
| `shipments:status` | Status update propagation | API Worker | Normal |

---

## Job Priority Levels

| Level | Value | Use Case |
|-------|-------|----------|
| Critical | 1 | Payment processing |
| High | 2 | User-facing operations (WhatsApp, VolumeScan) |
| Normal | 3 | Background operations |
| Low | 4 | Analytics, reports |

---

## Job Lifecycle

```
┌──────────┐     ┌──────────┐     ┌───────────┐     ┌───────────┐
│ WAITING  │────▶│  ACTIVE  │────▶│ COMPLETED │     │  FAILED   │
└──────────┘     └──────────┘     └───────────┘     └───────────┘
                      │                                   ▲
                      └───────────────────────────────────┘
                                 (on error)
```

### Retry Strategy

| Job Type | Max Retries | Backoff | Dead Letter |
|----------|-------------|---------|-------------|
| `volumescan:*` | 3 | Exponential (1s, 2s, 4s) | Yes |
| `notifications:*` | 5 | Exponential (5s, 10s, 20s, 40s, 80s) | Yes |
| `payments:*` | 3 | Fixed (30s) | Yes |

---

## Technology Choice

**BullMQ** is recommended for:
- Native TypeScript support
- Reliable job processing with persistence
- Built-in retry mechanisms
- Job prioritization
- Rate limiting capabilities
- Dashboard (Bull Board)

---

## API → AI Engine Communication

For VolumeScan jobs, the flow is:

1. **API** receives image via WhatsApp webhook
2. **API** stores image, creates job in `volumescan:process` queue
3. **AI Engine** consumes job, processes image
4. **AI Engine** publishes result to completion queue (or HTTP callback)
5. **API** updates shipment/quote with dimensions

### Alternative: Synchronous HTTP

For MVP, direct HTTP calls may be acceptable:
- Simpler implementation
- 30-second timeout
- Fallback to manual if timeout

---

## Implementation Notes

### Job Payload Structure

```typescript
interface VolumscanJob {
  jobId: string;
  shipmentId: string;
  imageUrl: string;          // S3/storage URL
  referenceObject: 'A4';
  callbackUrl: string;       // Where to POST results
  metadata: {
    userId: string;
    hubId: string;
    createdAt: string;
  };
}
```

### Result Payload Structure

```typescript
interface VolumescanResult {
  jobId: string;
  success: boolean;
  dimensions?: {
    length: number;   // cm
    width: number;    // cm
    height: number;   // cm
  };
  confidence: number;
  requiresManualValidation: boolean;
  modelVersion: string;
  processingTimeMs: number;
  error?: {
    code: string;
    message: string;
  };
}
```

---

## Monitoring

| Metric | Description |
|--------|-------------|
| `queue.jobs.waiting` | Jobs waiting to be processed |
| `queue.jobs.active` | Jobs currently processing |
| `queue.jobs.completed` | Total completed jobs |
| `queue.jobs.failed` | Total failed jobs |
| `queue.processing.time` | Average processing time |

---

## Implementation Timeline

| Phase | Scope |
|-------|-------|
| MVP | Direct HTTP (API → AI Engine) |
| Phase 2 | BullMQ for notifications |
| Phase 3 | Full queue architecture |
