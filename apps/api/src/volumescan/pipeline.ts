/**
 * VolumeScan Pipeline
 * 
 * Main orchestrator for the dimension estimation pipeline.
 * Coordinates all processing stages.
 */

import {
    VolumeScanInput,
    VolumeScanResult,
    DimensionResult,
    DimensionError,
    VolumeScanErrorCode,
} from './types';
import { ImageValidator } from './validators/image.validator';
import { A4Detector } from './detectors/a4.detector';
import { PackageDetector } from './detectors/package.detector';
import { ScaleProcessor } from './processors/scale.processor';
import { DimensionProcessor } from './processors/dimension.processor';
import { ConfidenceScorer } from './scoring/confidence.scorer';

// ==================================================
// CONSTANTS
// ==================================================

const MODEL_NAME = 'volumescan-classical-cv';
const MODEL_VERSION = '1.0.0';

// ==================================================
// PIPELINE
// ==================================================

export class VolumeScanPipeline {
    private imageValidator: ImageValidator;
    private a4Detector: A4Detector;
    private packageDetector: PackageDetector;
    private scaleProcessor: ScaleProcessor;
    private dimensionProcessor: DimensionProcessor;
    private confidenceScorer: ConfidenceScorer;

    constructor() {
        this.imageValidator = new ImageValidator();
        this.a4Detector = new A4Detector();
        this.packageDetector = new PackageDetector();
        this.scaleProcessor = new ScaleProcessor();
        this.dimensionProcessor = new DimensionProcessor();
        this.confidenceScorer = new ConfidenceScorer();
    }

    /**
     * Process an image and extract package dimensions.
     */
    async process(input: VolumeScanInput): Promise<VolumeScanResult> {
        const startTime = Date.now();

        try {
            // Stage 1: Validate image
            const validationResult = await this.imageValidator.validate(input);

            if (!validationResult.valid) {
                return this.createError(
                    validationResult.errorCode,
                    validationResult.errorMessage,
                    startTime
                );
            }

            const image = validationResult.image;

            // Stage 2: Detect A4 reference
            const a4Result = await this.a4Detector.detect(image);

            if (!a4Result.detected) {
                return this.createError(
                    a4Result.errorCode,
                    a4Result.errorMessage,
                    startTime
                );
            }

            // Stage 3: Calibrate scale from A4
            const calibration = this.scaleProcessor.calibrate(a4Result);

            // Stage 4: Detect package
            const packageResult = await this.packageDetector.detect(image, a4Result);

            if (!packageResult.detected) {
                return this.createError(
                    packageResult.errorCode,
                    packageResult.errorMessage,
                    startTime
                );
            }

            // Stage 5: Calculate dimensions
            const dimensions = this.dimensionProcessor.calculate(
                packageResult.measurement,
                calibration
            );

            // Stage 6: Calculate confidence
            const edgeClarity = image.sharpness / 200; // Normalize to 0-1
            const confidenceResult = this.confidenceScorer.calculate(
                a4Result.confidence,
                packageResult.measurement.confidence,
                edgeClarity
            );

            // Build result
            const result: DimensionResult = {
                success: true,
                dimensions_mm: dimensions.dimensions_mm,
                volume_cm3: dimensions.volume_cm3,
                estimated_weight_volumetric_kg: dimensions.estimated_weight_volumetric_kg,
                confidence_score: confidenceResult.score,
                confidence_factors: confidenceResult.factors,
                model_name: MODEL_NAME,
                model_version: MODEL_VERSION,
                processing_time_ms: Date.now() - startTime,
                requires_manual_review: confidenceResult.requiresManualReview,
                review_reason: confidenceResult.reviewReason,
            };

            return result;

        } catch (error) {
            return this.createError(
                VolumeScanErrorCode.PROCESSING_ERROR,
                `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                startTime
            );
        }
    }

    /**
     * Create an error result.
     */
    private createError(
        errorCode: VolumeScanErrorCode,
        errorMessage: string,
        startTime: number
    ): DimensionError {
        return {
            success: false,
            error_code: errorCode,
            error_message: errorMessage,
            model_name: MODEL_NAME,
            model_version: MODEL_VERSION,
            processing_time_ms: Date.now() - startTime,
        };
    }
}
