/**
 * Scan Consumer
 * 
 * Processes scan jobs from the Redis queue.
 * Runs VolumeScan pipeline and persists results.
 */

import { Worker, Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { getQueueConfig, QUEUE_NAMES, JOB_TYPES } from './queue.config';
import type { ScanJobData, ScanJobResult } from './scan.job';
import { isValidTransition } from './scan.job';
import { VolumeScanPipeline, DimensionResult } from '../volumescan';
import { logger } from '../lib/logger';

// ==================================================
// CONSTANTS
// ==================================================

/** Confidence threshold for auto-completion */
const CONFIDENCE_THRESHOLD = 0.7;

// ==================================================
// CONSUMER
// ==================================================

export class ScanConsumer {
    private worker: Worker;
    private pipeline: VolumeScanPipeline;

    constructor(private readonly prisma: PrismaClient) {
        const config = getQueueConfig();
        this.pipeline = new VolumeScanPipeline();

        this.worker = new Worker<ScanJobData, ScanJobResult>(
            QUEUE_NAMES.SCAN,
            async (job) => this.process(job),
            {
                connection: config.redis,
                concurrency: 2, // Process 2 scans concurrently
            }
        );

        // Event handlers
        this.worker.on('completed', (job, result) => {
            logger.info({
                jobId: job.id,
                scanRequestId: job.data.scanRequestId,
                status: result.status,
            }, 'Scan job completed');
        });

        this.worker.on('failed', (job, error) => {
            logger.error({
                jobId: job?.id,
                scanRequestId: job?.data.scanRequestId,
                error: error.message,
            }, 'Scan job failed');
        });

        logger.info({ queueName: QUEUE_NAMES.SCAN }, 'ScanConsumer initialized');
    }

    /**
     * Process a scan job.
     */
    private async process(job: Job<ScanJobData>): Promise<ScanJobResult> {
        const startTime = Date.now();
        const { scanRequestId, imageUrl, shipmentId } = job.data;

        logger.info({
            jobId: job.id,
            scanRequestId,
            attempt: job.attemptsMade + 1,
        }, 'Processing scan job');

        // Update status to PROCESSING
        await this.updateRequestStatus(scanRequestId, 'PROCESSING');

        try {
            // Download image and run pipeline
            const imageBuffer = await this.downloadImage(imageUrl);

            const result = await this.pipeline.process({
                imageData: imageBuffer,
                requestId: scanRequestId,
            });

            // Handle result
            if (!result.success) {
                return await this.handleFailure(scanRequestId, result.error_message, startTime);
            }

            const successResult = result as DimensionResult;

            // Check confidence
            if (successResult.confidence_score < CONFIDENCE_THRESHOLD) {
                return await this.handleManualReview(scanRequestId, successResult, startTime);
            }

            // Success - create ScanResult
            return await this.handleSuccess(scanRequestId, shipmentId, successResult, startTime);

        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return await this.handleError(scanRequestId, message, startTime);
        }
    }

    /**
     * Download image from URL (S3/Minio).
     */
    private async downloadImage(url: string): Promise<Buffer> {
        // For now, assume URL is accessible via fetch
        // In production, use proper S3 client
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to download image: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }

    /**
     * Handle successful scan with high confidence.
     */
    private async handleSuccess(
        requestId: string,
        shipmentId: string,
        result: DimensionResult,
        startTime: number
    ): Promise<ScanJobResult> {
        // Create ScanResult
        const scanResult = await this.prisma.scanResult.create({
            data: {
                shipmentId,
                status: 'VALIDATED',
                source: 'AI',
                inputImageHash: `scan-${Date.now()}`,
                referenceObject: 'A4',
                referenceWidthMm: 210,
                referenceHeightMm: 297,
                detectedLengthCm: result.dimensions_mm.length / 10,
                detectedWidthCm: result.dimensions_mm.width / 10,
                detectedHeightCm: result.dimensions_mm.height / 10,
                detectedWeightKg: result.estimated_weight_volumetric_kg,
                confidenceScore: result.confidence_score,
                requiresManualValidation: false,
                modelName: result.model_name,
                modelVersion: result.model_version,
                processingTimeMs: result.processing_time_ms,
                validatedLengthCm: result.dimensions_mm.length / 10,
                validatedWidthCm: result.dimensions_mm.width / 10,
                validatedHeightCm: result.dimensions_mm.height / 10,
                validatedWeightKg: result.estimated_weight_volumetric_kg,
                validatedById: 'ai-system',
                validatedAt: new Date(),
                rawAiOutput: result as object,
                completedAt: new Date(),
            },
        });

        // Update request
        await this.prisma.scanRequest.update({
            where: { id: requestId },
            data: {
                status: 'COMPLETED',
                scanResultId: scanResult.id,
                rawAiOutput: result as object,
                completedAt: new Date(),
            },
        });

        return {
            status: 'COMPLETED',
            scanResultId: scanResult.id,
            processingTimeMs: Date.now() - startTime,
        };
    }

    /**
     * Handle low confidence - route to manual review.
     */
    private async handleManualReview(
        requestId: string,
        result: DimensionResult,
        startTime: number
    ): Promise<ScanJobResult> {
        await this.prisma.scanRequest.update({
            where: { id: requestId },
            data: {
                status: 'MANUAL_REVIEW_REQUIRED',
                rawAiOutput: result as object,
            },
        });

        logger.warn({
            scanRequestId: requestId,
            confidence: result.confidence_score,
            reason: result.review_reason,
        }, 'Scan requires manual review');

        return {
            status: 'MANUAL_REVIEW_REQUIRED',
            processingTimeMs: Date.now() - startTime,
        };
    }

    /**
     * Handle AI failure (not an error, just couldn't process).
     */
    private async handleFailure(
        requestId: string,
        errorMessage: string,
        startTime: number
    ): Promise<ScanJobResult> {
        await this.prisma.scanRequest.update({
            where: { id: requestId },
            data: {
                status: 'FAILED',
                lastError: errorMessage,
            },
        });

        return {
            status: 'FAILED',
            errorMessage,
            processingTimeMs: Date.now() - startTime,
        };
    }

    /**
     * Handle processing error (exception thrown).
     */
    private async handleError(
        requestId: string,
        errorMessage: string,
        startTime: number
    ): Promise<ScanJobResult> {
        const request = await this.prisma.scanRequest.findUnique({
            where: { id: requestId },
        });

        const attempts = (request?.attempts ?? 0) + 1;
        const maxAttempts = request?.maxAttempts ?? 3;

        // If max attempts reached, mark as failed
        if (attempts >= maxAttempts) {
            await this.prisma.scanRequest.update({
                where: { id: requestId },
                data: {
                    status: 'FAILED',
                    attempts,
                    lastError: errorMessage,
                },
            });

            return {
                status: 'FAILED',
                errorMessage: `Max attempts (${maxAttempts}) reached: ${errorMessage}`,
                processingTimeMs: Date.now() - startTime,
            };
        }

        // Otherwise, update attempt count and throw to trigger retry
        await this.prisma.scanRequest.update({
            where: { id: requestId },
            data: {
                status: 'PENDING', // Back to pending for retry
                attempts,
                lastError: errorMessage,
            },
        });

        // Throw to trigger BullMQ retry
        throw new Error(errorMessage);
    }

    /**
     * Update request status with validation.
     */
    private async updateRequestStatus(
        requestId: string,
        status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'MANUAL_REVIEW_REQUIRED'
    ): Promise<void> {
        const request = await this.prisma.scanRequest.findUnique({
            where: { id: requestId },
        });

        if (!request) {
            throw new Error(`ScanRequest not found: ${requestId}`);
        }

        if (!isValidTransition(request.status, status)) {
            logger.warn({
                requestId,
                from: request.status,
                to: status,
            }, 'Invalid state transition');
            return; // Skip invalid transitions
        }

        await this.prisma.scanRequest.update({
            where: { id: requestId },
            data: {
                status,
                processingStartedAt: status === 'PROCESSING' ? new Date() : undefined,
            },
        });
    }

    /**
     * Close the worker.
     */
    async close(): Promise<void> {
        await this.worker.close();
    }
}
