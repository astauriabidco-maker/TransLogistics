/**
 * ScanService Interface
 * 
 * Manages AI-powered dimension scanning.
 * Enforces traceability and confidence thresholds.
 */

import type { ServiceContext, Dimensions, ScanStatus } from './types';

// ==================================================
// CONSTANTS
// ==================================================

export const SCAN_CONFIDENCE_THRESHOLDS = {
    AUTO_ACCEPT: 0.85,
    MANUAL_VALIDATION: 0.60,
} as const;

export const REFERENCE_OBJECTS = {
    A4: { widthMm: 210, heightMm: 297 },
} as const;

// ==================================================
// INPUT TYPES
// ==================================================

export interface RequestScanInput {
    shipmentId: string;
    /** Image as Buffer or base64 string */
    imageData: Buffer | string;
    /** Original filename for logging */
    filename?: string;
    /** Reference object type (only A4 supported) */
    referenceObject?: 'A4';
}

export interface ValidateScanInput {
    scanResultId: string;
    validatedDimensions: Dimensions;
    notes?: string;
}

// ==================================================
// OUTPUT TYPES
// ==================================================

export interface ScanResultDTO {
    id: string;
    shipmentId: string;
    status: ScanStatus;

    // Input reference
    inputImageHash: string;
    referenceObject: string;
    referenceWidthMm: number;
    referenceHeightMm: number;

    // AI output (null if still processing)
    detectedDimensions: Dimensions | null;
    confidenceScore: number | null;
    requiresManualValidation: boolean;

    // Model traceability
    modelName: string;
    modelVersion: string;
    processingTimeMs: number | null;

    // Manual validation (if applied)
    validatedDimensions: Dimensions | null;
    validatedById: string | null;
    validatedAt: Date | null;
    validationNotes: string | null;

    // Timestamps
    createdAt: Date;
    completedAt: Date | null;
}

export interface ScanProcessingResult {
    scanResultId: string;
    status: 'COMPLETED' | 'FAILED';
    dimensions: Dimensions | null;
    confidence: number | null;
    requiresManualValidation: boolean;
    processingTimeMs: number;
    error?: string;
}

// ==================================================
// SERVICE INTERFACE
// ==================================================

export interface IScanService {
    /**
     * Request a new dimension scan for a shipment.
     * Creates a ScanResult in PROCESSING state and triggers AI processing.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws ConflictError - Shipment already has a scan result
     * @throws ValidationError - Invalid image format
     */
    requestScan(
        input: RequestScanInput,
        ctx: ServiceContext
    ): Promise<ScanResultDTO>;

    /**
     * Record the result from AI processing.
     * Called by the AI engine callback or message handler.
     * 
     * @throws NotFoundError - ScanResult does not exist
     * @throws InvalidStateError - ScanResult is not in PROCESSING state
     */
    recordScanResult(
        scanResultId: string,
        result: ScanProcessingResult,
        ctx: ServiceContext
    ): Promise<ScanResultDTO>;

    /**
     * Manually validate a scan result.
     * Used when confidence is below threshold or user wants to override.
     * 
     * @throws NotFoundError - ScanResult does not exist
     * @throws InvalidStateError - ScanResult is not in COMPLETED state
     * @throws ValidationError - Invalid dimensions
     */
    validateScan(
        input: ValidateScanInput,
        ctx: ServiceContext
    ): Promise<ScanResultDTO>;

    /**
     * Reject a scan result and request a new scan.
     * 
     * @throws NotFoundError - ScanResult does not exist
     * @throws InvalidStateError - ScanResult is not in COMPLETED state
     */
    rejectScan(
        scanResultId: string,
        reason: string,
        ctx: ServiceContext
    ): Promise<ScanResultDTO>;

    /**
     * Get a scan result by ID.
     * 
     * @throws NotFoundError - ScanResult does not exist
     */
    getScanById(scanResultId: string): Promise<ScanResultDTO>;

    /**
     * Get the scan result for a shipment.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @returns null if shipment has no scan result
     */
    getScanByShipmentId(shipmentId: string): Promise<ScanResultDTO | null>;

    /**
     * Get the final dimensions to use for quoting.
     * Prefers validated dimensions over detected dimensions.
     * 
     * @throws NotFoundError - ScanResult does not exist
     * @throws InvalidStateError - Scan not completed or validated
     */
    getFinalDimensions(scanResultId: string): Promise<Dimensions>;

    /**
     * Check if a scan result requires manual validation.
     */
    requiresManualValidation(scanResultId: string): Promise<boolean>;
}
