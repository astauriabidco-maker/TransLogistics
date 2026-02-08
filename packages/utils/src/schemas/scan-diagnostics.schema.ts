import { z } from 'zod';

// ==================================================
// SCAN DIAGNOSTICS — rawAiOutput schema
// ==================================================

/**
 * Typed schema for the `rawAiOutput` JSON field in ScanResult.
 * 
 * This contract is shared between:
 * - AI Engine (Python/FastAPI) → produces this structure
 * - API (Node.js) → validates and stores it
 * - Learning Loop → consumes it for training data extraction
 * 
 * @see VOLUMESCAN_LEARNING_LOOP.md section 3.1 Signal 3
 */

// -- Sub-schemas --

const PointSchema = z.object({
    x: z.number(),
    y: z.number(),
});

const BoundingBoxSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
});

const DimensionEstimateSchema = z.object({
    lengthMm: z.number().positive(),
    widthMm: z.number().positive(),
    heightMm: z.number().positive().optional(),
    heightSource: z.enum(['MEASURED', 'HEURISTIC', 'DEFAULT']).optional(),
});

// -- Main schema --

export const ScanDiagnosticsSchema = z.object({
    /** Schema version for backward compat */
    schemaVersion: z.string().default('1.0.0'),

    // ── Image Quality ────────────────────────
    image: z.object({
        widthPx: z.number().int().positive(),
        heightPx: z.number().int().positive(),
        /** Laplacian variance — higher = sharper */
        sharpnessScore: z.number().min(0),
        /** Average brightness (0–255) */
        brightness: z.number().min(0).max(255).optional(),
    }),

    // ── A4 Reference Detection ───────────────
    a4Detection: z.object({
        detected: z.boolean(),
        confidence: z.number().min(0).max(1),
        /** 4 corner points (top-left, top-right, bottom-right, bottom-left) */
        cornersPx: z.array(PointSchema).length(4).optional(),
        /** Deviation from standard A4 aspect ratio (210/297 ≈ 0.707) */
        aspectRatioDelta: z.number().optional(),
        /** Calibration factor: pixels per millimeter */
        pixelsPerMm: z.number().positive().optional(),
    }),

    // ── Package Detection ────────────────────
    packageDetection: z.object({
        detected: z.boolean(),
        /** Number of candidate bounding boxes found */
        candidateCount: z.number().int().min(0),
        /** Selected bounding box */
        selectedBbox: BoundingBoxSchema.optional(),
        /** Contour area in pixels */
        contourAreaPx: z.number().optional(),
    }),

    // ── Dimension Estimation ─────────────────
    dimensions: DimensionEstimateSchema.optional(),

    // ── Confidence Breakdown ─────────────────
    confidenceBreakdown: z.object({
        /** A4 detection quality component */
        a4Quality: z.number().min(0).max(1),
        /** Image sharpness component */
        imageSharpness: z.number().min(0).max(1),
        /** Bounding box stability component */
        bboxStability: z.number().min(0).max(1),
        /** Overall composite score */
        composite: z.number().min(0).max(1),
    }).optional(),

    // ── Pipeline Diagnostics ─────────────────
    pipeline: z.object({
        /** Processing time per stage in milliseconds */
        timings: z.record(z.string(), z.number()),
        /** Total processing time */
        totalMs: z.number(),
        /** Model version used */
        modelVersion: z.string(),
        /** Stages completed successfully */
        stagesCompleted: z.array(z.string()),
        /** Stage that failed (if any) */
        failedStage: z.string().optional(),
        /** Error message if pipeline failed */
        errorMessage: z.string().optional(),
    }),

    // ── Failure Classification ───────────────
    failureMode: z.enum([
        'NONE',                // Successful scan
        'LOW_SHARPNESS',       // Image too blurry
        'A4_NOT_DETECTED',     // Reference sheet missing
        'A4_OCCLUDED',         // A4 partially covered
        'PACKAGE_NOT_DETECTED', // No package identified
        'SCALE_AMBIGUOUS',     // Multiple scale references
        'LOW_CONFIDENCE',      // All stages passed but confidence below threshold
        'PIPELINE_ERROR',      // Technical failure
    ]).default('NONE'),
});

// -- Derived types --

export type ScanDiagnostics = z.infer<typeof ScanDiagnosticsSchema>;
export type DimensionEstimate = z.infer<typeof DimensionEstimateSchema>;

// -- Validation helper --

/**
 * Validate and parse raw AI output.
 * Returns parsed result or null with logged warning.
 */
export function parseScanDiagnostics(
    rawOutput: unknown,
): ScanDiagnostics | null {
    const result = ScanDiagnosticsSchema.safeParse(rawOutput);
    if (!result.success) {
        // Don't throw — log warning and return null
        // The raw JSON is still stored even if it doesn't match the schema
        return null;
    }
    return result.data;
}
