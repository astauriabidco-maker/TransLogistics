/**
 * Scan Job Types
 * 
 * Type definitions for scan processing jobs.
 */

import type { ScanRequestStatus } from '@prisma/client';

/**
 * Data payload for scan processing job.
 */
export interface ScanJobData {
    /** ScanRequest ID (used as job ID for idempotency) */
    scanRequestId: string;

    /** Image URL (S3/Minio) */
    imageUrl: string;

    /** Shipment ID for context */
    shipmentId: string;

    /** Request metadata */
    requestedById?: string;
    hubId?: string;

    /** Attempt number (for logging) */
    attemptNumber: number;
}

/**
 * Job result on success.
 */
export interface ScanJobResult {
    /** Final status */
    status: ScanRequestStatus;

    /** Created ScanResult ID (if successful) */
    scanResultId?: string;

    /** Error message (if failed) */
    errorMessage?: string;

    /** Processing time in ms */
    processingTimeMs: number;
}

/**
 * State transition for scan requests.
 */
export const SCAN_STATE_TRANSITIONS: Record<ScanRequestStatus, ScanRequestStatus[]> = {
    PENDING: ['PROCESSING'],
    PROCESSING: ['COMPLETED', 'FAILED', 'MANUAL_REVIEW_REQUIRED'],
    COMPLETED: [], // Terminal
    FAILED: ['PENDING'], // Can retry
    MANUAL_REVIEW_REQUIRED: ['COMPLETED'], // After manual validation
};

/**
 * Check if state transition is valid.
 */
export function isValidTransition(
    from: ScanRequestStatus,
    to: ScanRequestStatus
): boolean {
    return SCAN_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}
