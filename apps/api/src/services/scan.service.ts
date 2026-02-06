/**
 * ScanService Implementation
 * 
 * Handles package dimension scanning via:
 * - VolumeScan AI (image-based dimension detection)
 * - Manual dimension declaration (fallback)
 * 
 * Uses A4 sheet reference for scale calibration.
 */

import type { PrismaClient } from '@prisma/client';
import type {
    IScanService,
    RequestScanInput,
    ValidateScanInput,
    ScanResultDTO,
    ScanProcessingResult,
} from '../domain/services/scan.service';
import type { ServiceContext, Dimensions } from '../domain/types';
import {
    NotFoundError,
    ShipmentNotFoundError,
    ConflictError,
    InvalidStateError,
    ValidationError,
} from '../domain/errors';
import { logger } from '../lib/logger';
import { VolumeScanPipeline } from '../volumescan';
import type { VolumeScanInput, DimensionResult } from '../volumescan';

// ==================================================
// CONSTANTS
// ==================================================

const MANUAL_SOURCE = 'MANUAL';
const MANUAL_MODEL_NAME = 'manual-input-stub';
const MANUAL_MODEL_VERSION = '1.0.0';
const MANUAL_CONFIDENCE = 1.0;

// ==================================================
// STUB INPUT TYPES
// ==================================================

/**
 * Input for manual dimension declaration.
 * This is the primary method until AI is ready.
 */
export interface DeclareManualDimensionsInput {
    shipmentId: string;
    dimensions: Dimensions;
    weightKg: number;
    declaredBy: 'USER' | 'OPERATOR';
    notes?: string;
}

// ==================================================
// SERVICE IMPLEMENTATION
// ==================================================

export class ScanService implements IScanService {
    constructor(private readonly prisma: PrismaClient) { }

    // --------------------------------------------------
    // DECLARE MANUAL DIMENSIONS (PRIMARY STUB METHOD)
    // --------------------------------------------------

    /**
     * Store manually declared dimensions.
     * This bypasses AI scanning entirely.
     */
    async declareManualDimensions(
        input: DeclareManualDimensionsInput,
        ctx: ServiceContext
    ): Promise<ScanResultDTO> {
        // Validate shipment exists
        const shipment = await this.prisma.shipment.findUnique({
            where: { id: input.shipmentId },
        });

        if (!shipment) {
            throw new ShipmentNotFoundError(input.shipmentId);
        }

        // Check for existing scan
        const existing = await this.prisma.scanResult.findFirst({
            where: { shipmentId: input.shipmentId },
        });

        if (existing) {
            throw new ConflictError(
                `Shipment ${input.shipmentId} already has a scan result`
            );
        }

        // Validate dimensions
        this.validateDimensions(input.dimensions);
        this.validateWeight(input.weightKg);

        // Create scan result (already VALIDATED since user declared)
        const scanResult = await this.prisma.scanResult.create({
            data: {
                shipmentId: input.shipmentId,
                status: 'VALIDATED',
                source: MANUAL_SOURCE,

                // No actual image (manual input)
                inputImageHash: `manual-${Date.now()}`,
                referenceObject: 'NONE',
                referenceWidthMm: 0,
                referenceHeightMm: 0,

                // Dimensions (user-declared)
                detectedLengthCm: input.dimensions.lengthCm,
                detectedWidthCm: input.dimensions.widthCm,
                detectedHeightCm: input.dimensions.heightCm,
                detectedWeightKg: input.weightKg,

                // Confidence = 1.0 for user-declared
                confidenceScore: MANUAL_CONFIDENCE,
                requiresManualValidation: false,

                // Traceability: clearly marked as MANUAL
                modelName: MANUAL_MODEL_NAME,
                modelVersion: MANUAL_MODEL_VERSION,
                processingTimeMs: 0,

                // Already validated (same as detected for manual)
                validatedLengthCm: input.dimensions.lengthCm,
                validatedWidthCm: input.dimensions.widthCm,
                validatedHeightCm: input.dimensions.heightCm,
                validatedWeightKg: input.weightKg,
                validatedById: ctx.userId ?? 'system',
                validatedAt: new Date(),
                validationNotes: input.notes ?? `Declared by ${input.declaredBy}`,

                completedAt: new Date(),
            },
        });

        logger.info('Manual dimensions declared', {
            scanResultId: scanResult.id,
            shipmentId: input.shipmentId,
            dimensions: input.dimensions,
            weightKg: input.weightKg,
            declaredBy: input.declaredBy,
            requestId: ctx.requestId,
        });

        return this.toDTO(scanResult);
    }

    // --------------------------------------------------
    // AI SCAN METHODS (VolumeScan Integration)
    // --------------------------------------------------

    /** VolumeScan pipeline instance */
    private volumeScanPipeline = new VolumeScanPipeline();

    /**
     * Request AI-based dimension scan using VolumeScan.
     * Requires an image with A4 reference sheet.
     */
    async requestScan(
        input: RequestScanInput,
        ctx: ServiceContext
    ): Promise<ScanResultDTO> {
        // Validate shipment exists
        const shipment = await this.prisma.shipment.findUnique({
            where: { id: input.shipmentId },
        });

        if (!shipment) {
            throw new ShipmentNotFoundError(input.shipmentId);
        }

        // Check for existing scan
        const existing = await this.prisma.scanResult.findFirst({
            where: { shipmentId: input.shipmentId },
        });

        if (existing) {
            throw new ConflictError(
                `Shipment ${input.shipmentId} already has a scan result`
            );
        }

        // Run VolumeScan pipeline
        const volumeScanInput: VolumeScanInput = {
            imageData: input.imageData,
            filename: input.filename,
            requestId: ctx.requestId,
        };

        const result = await this.volumeScanPipeline.process(volumeScanInput);

        if (!result.success) {
            // Create failed scan record
            const failedScan = await this.prisma.scanResult.create({
                data: {
                    shipmentId: input.shipmentId,
                    status: 'REJECTED',
                    source: 'AI',
                    inputImageHash: `scan-${Date.now()}`,
                    referenceObject: 'A4',
                    referenceWidthMm: 210,
                    referenceHeightMm: 297,
                    detectedLengthCm: 0,
                    detectedWidthCm: 0,
                    detectedHeightCm: 0,
                    detectedWeightKg: 0,
                    confidenceScore: 0,
                    requiresManualValidation: true,
                    modelName: result.model_name,
                    modelVersion: result.model_version,
                    processingTimeMs: result.processing_time_ms,
                    validationNotes: `Scan failed: ${result.error_message}`,
                },
            });

            logger.warn('VolumeScan failed', {
                scanResultId: failedScan.id,
                shipmentId: input.shipmentId,
                errorCode: result.error_code,
                errorMessage: result.error_message,
                requestId: ctx.requestId,
            });

            return this.toDTO(failedScan);
        }

        // Success - create scan result
        const successResult = result as DimensionResult;
        const scanResult = await this.prisma.scanResult.create({
            data: {
                shipmentId: input.shipmentId,
                status: successResult.requires_manual_review ? 'COMPLETED' : 'VALIDATED',
                source: 'AI',
                inputImageHash: `scan-${Date.now()}`,
                referenceObject: 'A4',
                referenceWidthMm: 210,
                referenceHeightMm: 297,

                // Detected dimensions (mm to cm)
                detectedLengthCm: successResult.dimensions_mm.length / 10,
                detectedWidthCm: successResult.dimensions_mm.width / 10,
                detectedHeightCm: successResult.dimensions_mm.height / 10,
                detectedWeightKg: successResult.estimated_weight_volumetric_kg,

                // Confidence
                confidenceScore: successResult.confidence_score,
                requiresManualValidation: successResult.requires_manual_review,

                // Traceability
                modelName: successResult.model_name,
                modelVersion: successResult.model_version,
                processingTimeMs: successResult.processing_time_ms,

                // If high confidence, auto-validate
                ...(!successResult.requires_manual_review && {
                    validatedLengthCm: successResult.dimensions_mm.length / 10,
                    validatedWidthCm: successResult.dimensions_mm.width / 10,
                    validatedHeightCm: successResult.dimensions_mm.height / 10,
                    validatedWeightKg: successResult.estimated_weight_volumetric_kg,
                    validatedById: 'ai-system',
                    validatedAt: new Date(),
                    completedAt: new Date(),
                }),

                validationNotes: successResult.review_reason,
            },
        });

        logger.info('VolumeScan completed', {
            scanResultId: scanResult.id,
            shipmentId: input.shipmentId,
            dimensions: successResult.dimensions_mm,
            confidence: successResult.confidence_score,
            requiresReview: successResult.requires_manual_review,
            requestId: ctx.requestId,
        });

        return this.toDTO(scanResult);
    }

    /**
     * Record AI result - used for async processing flows.
     */
    async recordScanResult(
        _scanResultId: string,
        _result: ScanProcessingResult,
        _ctx: ServiceContext
    ): Promise<ScanResultDTO> {
        // For now, we process synchronously in requestScan
        // This method is kept for future async queue processing
        throw new Error('Async scan processing not yet implemented. Use requestScan() for synchronous processing.');
    }

    /**
     * Validate scan - works for manual dimensions too.
     */
    async validateScan(
        input: ValidateScanInput,
        ctx: ServiceContext
    ): Promise<ScanResultDTO> {
        const scan = await this.getScanOrThrow(input.scanResultId);

        // For manual input, allow re-validation
        if (scan.status !== 'COMPLETED' && scan.status !== 'VALIDATED') {
            throw new InvalidStateError(
                scan.status,
                'validate scan',
                ['COMPLETED', 'VALIDATED']
            );
        }

        this.validateDimensions(input.validatedDimensions);

        const updated = await this.prisma.scanResult.update({
            where: { id: input.scanResultId },
            data: {
                status: 'VALIDATED',
                validatedLengthCm: input.validatedDimensions.lengthCm,
                validatedWidthCm: input.validatedDimensions.widthCm,
                validatedHeightCm: input.validatedDimensions.heightCm,
                validatedById: ctx.userId ?? 'system',
                validatedAt: new Date(),
                validationNotes: input.notes,
            },
        });

        logger.info('Scan validated', {
            scanResultId: input.scanResultId,
            requestId: ctx.requestId,
        });

        return this.toDTO(updated);
    }

    /**
     * Reject scan - clears for new input.
     */
    async rejectScan(
        scanResultId: string,
        reason: string,
        ctx: ServiceContext
    ): Promise<ScanResultDTO> {
        await this.getScanOrThrow(scanResultId);

        const updated = await this.prisma.scanResult.update({
            where: { id: scanResultId },
            data: {
                status: 'REJECTED',
                validationNotes: reason,
            },
        });

        logger.info('Scan rejected', {
            scanResultId,
            reason,
            requestId: ctx.requestId,
        });

        return this.toDTO(updated);
    }

    /**
     * Get scan by ID.
     */
    async getScanById(scanResultId: string): Promise<ScanResultDTO> {
        const scan = await this.getScanOrThrow(scanResultId);
        return this.toDTO(scan);
    }

    /**
     * Get scan by shipment ID.
     */
    async getScanByShipmentId(shipmentId: string): Promise<ScanResultDTO | null> {
        const shipment = await this.prisma.shipment.findUnique({
            where: { id: shipmentId },
        });

        if (!shipment) {
            throw new ShipmentNotFoundError(shipmentId);
        }

        const scan = await this.prisma.scanResult.findFirst({
            where: { shipmentId },
        });

        return scan ? this.toDTO(scan) : null;
    }

    /**
     * Get final dimensions for quoting.
     */
    async getFinalDimensions(scanResultId: string): Promise<Dimensions> {
        const scan = await this.getScanOrThrow(scanResultId);

        if (scan.status !== 'VALIDATED') {
            throw new InvalidStateError(
                scan.status,
                'get final dimensions',
                ['VALIDATED']
            );
        }

        // Prefer validated, fallback to detected
        return {
            lengthCm: Number(scan.validatedLengthCm ?? scan.detectedLengthCm ?? 0),
            widthCm: Number(scan.validatedWidthCm ?? scan.detectedWidthCm ?? 0),
            heightCm: Number(scan.validatedHeightCm ?? scan.detectedHeightCm ?? 0),
        };
    }

    /**
     * Check if manual validation required.
     * For manual input, always false.
     */
    async requiresManualValidation(scanResultId: string): Promise<boolean> {
        const scan = await this.getScanOrThrow(scanResultId);
        return scan.requiresManualValidation;
    }

    // ==================================================
    // WEIGHT ACCESS (for QuoteService)
    // ==================================================

    /**
     * Get weight from scan result.
     */
    async getWeight(scanResultId: string): Promise<number> {
        const scan = await this.getScanOrThrow(scanResultId);
        return Number(scan.validatedWeightKg ?? scan.detectedWeightKg ?? 0);
    }

    // ==================================================
    // PRIVATE HELPERS
    // ==================================================

    private async getScanOrThrow(scanResultId: string) {
        const scan = await this.prisma.scanResult.findUnique({
            where: { id: scanResultId },
        });

        if (!scan) {
            throw new NotFoundError('ScanResult', scanResultId);
        }

        return scan;
    }

    private validateDimensions(dimensions: Dimensions): void {
        if (dimensions.lengthCm <= 0) {
            throw new ValidationError('Length must be positive', 'lengthCm');
        }
        if (dimensions.widthCm <= 0) {
            throw new ValidationError('Width must be positive', 'widthCm');
        }
        if (dimensions.heightCm <= 0) {
            throw new ValidationError('Height must be positive', 'heightCm');
        }
        // Max dimension check
        const maxCm = 200;
        if (
            dimensions.lengthCm > maxCm ||
            dimensions.widthCm > maxCm ||
            dimensions.heightCm > maxCm
        ) {
            throw new ValidationError(
                `Dimensions cannot exceed ${maxCm}cm`,
                'dimensions'
            );
        }
    }

    private validateWeight(weightKg: number): void {
        if (weightKg <= 0) {
            throw new ValidationError('Weight must be positive', 'weightKg');
        }
        if (weightKg > 100) {
            throw new ValidationError('Weight cannot exceed 100kg', 'weightKg');
        }
    }

    private toDTO(scan: {
        id: string;
        shipmentId: string;
        status: string;
        source: string;
        inputImageHash: string;
        referenceObject: string;
        referenceWidthMm: number;
        referenceHeightMm: number;
        detectedLengthCm: unknown;
        detectedWidthCm: unknown;
        detectedHeightCm: unknown;
        detectedWeightKg: unknown;
        confidenceScore: unknown;
        requiresManualValidation: boolean;
        modelName: string;
        modelVersion: string;
        processingTimeMs: number | null;
        validatedLengthCm: unknown;
        validatedWidthCm: unknown;
        validatedHeightCm: unknown;
        validatedWeightKg: unknown;
        validatedById: string | null;
        validatedAt: Date | null;
        validationNotes: string | null;
        createdAt: Date;
        completedAt: Date | null;
    }): ScanResultDTO {
        const hasDetected = scan.detectedLengthCm !== null;
        const hasValidated = scan.validatedAt !== null;

        return {
            id: scan.id,
            shipmentId: scan.shipmentId,
            status: scan.status as 'PROCESSING' | 'COMPLETED' | 'VALIDATED' | 'REJECTED',
            inputImageHash: scan.inputImageHash,
            referenceObject: scan.referenceObject,
            referenceWidthMm: scan.referenceWidthMm,
            referenceHeightMm: scan.referenceHeightMm,
            detectedDimensions: hasDetected
                ? {
                    lengthCm: Number(scan.detectedLengthCm),
                    widthCm: Number(scan.detectedWidthCm),
                    heightCm: Number(scan.detectedHeightCm),
                }
                : null,
            confidenceScore: scan.confidenceScore ? Number(scan.confidenceScore) : null,
            requiresManualValidation: scan.requiresManualValidation,
            modelName: scan.modelName,
            modelVersion: scan.modelVersion,
            processingTimeMs: scan.processingTimeMs,
            validatedDimensions: hasValidated
                ? {
                    lengthCm: Number(scan.validatedLengthCm),
                    widthCm: Number(scan.validatedWidthCm),
                    heightCm: Number(scan.validatedHeightCm),
                }
                : null,
            validatedById: scan.validatedById,
            validatedAt: scan.validatedAt,
            validationNotes: scan.validationNotes,
            createdAt: scan.createdAt,
            completedAt: scan.completedAt,
        };
    }
}
