/**
 * Scan Orchestrator Service
 * 
 * High-level API for scan operations.
 * Coordinates between API layer, queue, and database.
 */

import type { PrismaClient, ScanRequest, ScanRequestStatus } from '@prisma/client';
import { ScanProducer } from './scan.producer';
import { logger } from '../lib/logger';
import type { ServiceContext } from '../domain/types';
import { NotFoundError, ConflictError, InvalidStateError } from '../domain/errors';

// ==================================================
// INPUT TYPES
// ==================================================

export interface RequestAsyncScanInput {
    shipmentId: string;
    imageUrl: string;
    requestedById?: string;
    hubId?: string;
}

export interface ValidateManualScanInput {
    scanRequestId: string;
    dimensions: {
        lengthCm: number;
        widthCm: number;
        heightCm: number;
    };
    weightKg: number;
    notes?: string;
}

// ==================================================
// SERVICE
// ==================================================

export class ScanOrchestrator {
    private producer: ScanProducer;

    constructor(private readonly prisma: PrismaClient) {
        this.producer = new ScanProducer();
    }

    /**
     * Request an async scan.
     * Returns immediately with PENDING request.
     */
    async requestScan(
        input: RequestAsyncScanInput,
        ctx: ServiceContext
    ): Promise<ScanRequest> {
        // Check for existing pending/processing request
        const existing = await this.prisma.scanRequest.findFirst({
            where: {
                shipmentId: input.shipmentId,
                status: { in: ['PENDING', 'PROCESSING'] },
            },
        });

        if (existing) {
            throw new ConflictError(
                `Shipment ${input.shipmentId} already has a pending scan request`
            );
        }

        // Create request
        const request = await this.prisma.scanRequest.create({
            data: {
                shipmentId: input.shipmentId,
                imageUrl: input.imageUrl,
                status: 'PENDING',
                requestedById: input.requestedById ?? ctx.userId,
                hubId: input.hubId,
            },
        });

        // Enqueue job
        const job = await this.producer.enqueue({
            scanRequestId: request.id,
            imageUrl: input.imageUrl,
            shipmentId: input.shipmentId,
            requestedById: input.requestedById,
            hubId: input.hubId,
        });

        // Link job ID
        await this.prisma.scanRequest.update({
            where: { id: request.id },
            data: { jobId: job.id },
        });

        logger.info({
            scanRequestId: request.id,
            shipmentId: input.shipmentId,
            jobId: job.id,
            requestId: ctx.requestId,
        }, 'Async scan requested');

        return request;
    }

    /**
     * Get scan request status.
     */
    async getRequest(requestId: string): Promise<ScanRequest> {
        const request = await this.prisma.scanRequest.findUnique({
            where: { id: requestId },
            include: { scanResult: true },
        });

        if (!request) {
            throw new NotFoundError('ScanRequest', requestId);
        }

        return request;
    }

    /**
     * Get pending requests for a shipment.
     */
    async getShipmentRequests(shipmentId: string): Promise<ScanRequest[]> {
        return this.prisma.scanRequest.findMany({
            where: { shipmentId },
            orderBy: { createdAt: 'desc' },
        });
    }

    /**
     * Manually validate a scan request in MANUAL_REVIEW_REQUIRED status.
     */
    async validateManual(
        input: ValidateManualScanInput,
        ctx: ServiceContext
    ): Promise<ScanRequest> {
        const request = await this.prisma.scanRequest.findUnique({
            where: { id: input.scanRequestId },
        });

        if (!request) {
            throw new NotFoundError('ScanRequest', input.scanRequestId);
        }

        if (request.status !== 'MANUAL_REVIEW_REQUIRED') {
            throw new InvalidStateError(
                request.status,
                'manual validation',
                ['MANUAL_REVIEW_REQUIRED']
            );
        }

        // Create ScanResult with validated dimensions
        const scanResult = await this.prisma.scanResult.create({
            data: {
                shipmentId: request.shipmentId,
                status: 'VALIDATED',
                source: 'MANUAL',
                inputImageHash: `manual-${Date.now()}`,
                referenceObject: request.referenceObject,
                referenceWidthMm: 210,
                referenceHeightMm: 297,
                detectedLengthCm: input.dimensions.lengthCm,
                detectedWidthCm: input.dimensions.widthCm,
                detectedHeightCm: input.dimensions.heightCm,
                detectedWeightKg: input.weightKg,
                confidenceScore: 1.0, // Manual = 100% confidence
                requiresManualValidation: false,
                modelName: 'manual-validation',
                modelVersion: '1.0.0',
                processingTimeMs: 0,
                validatedLengthCm: input.dimensions.lengthCm,
                validatedWidthCm: input.dimensions.widthCm,
                validatedHeightCm: input.dimensions.heightCm,
                validatedWeightKg: input.weightKg,
                validatedById: ctx.userId,
                validatedAt: new Date(),
                validationNotes: input.notes,
                completedAt: new Date(),
            },
        });

        // Update request
        const updated = await this.prisma.scanRequest.update({
            where: { id: input.scanRequestId },
            data: {
                status: 'COMPLETED',
                scanResultId: scanResult.id,
                completedAt: new Date(),
            },
            include: { scanResult: true },
        });

        logger.info({
            scanRequestId: input.scanRequestId,
            scanResultId: scanResult.id,
            validatedBy: ctx.userId,
            requestId: ctx.requestId,
        }, 'Manual scan validation completed');

        return updated;
    }

    /**
     * Retry a failed scan request.
     */
    async retryFailed(requestId: string, ctx: ServiceContext): Promise<ScanRequest> {
        const request = await this.prisma.scanRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            throw new NotFoundError('ScanRequest', requestId);
        }

        if (request.status !== 'FAILED') {
            throw new InvalidStateError(request.status, 'retry', ['FAILED']);
        }

        // Reset to pending
        const updated = await this.prisma.scanRequest.update({
            where: { id: requestId },
            data: {
                status: 'PENDING',
                lastError: null,
            },
        });

        // Re-enqueue
        await this.producer.retry(requestId);

        logger.info({
            scanRequestId: requestId,
            requestId: ctx.requestId,
        }, 'Failed scan retry requested');

        return updated;
    }

    /**
     * Close connections.
     */
    async close(): Promise<void> {
        await this.producer.close();
    }
}
