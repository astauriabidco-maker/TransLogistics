/**
 * VolumeScan AI — Type Definitions
 * 
 * Input/output contracts for the dimension estimation pipeline.
 * These types are the API boundary between VolumeScan and the rest of the system.
 */

// ==================================================
// CONSTANTS
// ==================================================

/** A4 paper dimensions in millimeters */
export const A4_DIMENSIONS_MM = {
    WIDTH: 210,
    HEIGHT: 297,
} as const;

/** A4 aspect ratio (width/height) */
export const A4_ASPECT_RATIO = A4_DIMENSIONS_MM.WIDTH / A4_DIMENSIONS_MM.HEIGHT; // ~0.707

/** Confidence threshold for automatic acceptance */
export const CONFIDENCE_THRESHOLD = 0.7;

/** Minimum image dimensions */
export const MIN_IMAGE_SIZE = 640;

/** Maximum image size (pixels) */
export const MAX_IMAGE_SIZE = 4096;

/** Volumetric weight divisor (air freight standard) */
export const VOLUMETRIC_DIVISOR = 5000;

// ==================================================
// INPUT TYPES
// ==================================================

/**
 * Input to the VolumeScan pipeline.
 */
export interface VolumeScanInput {
    /** Image data as base64 or Buffer */
    imageData: Buffer | string;

    /** Original filename for logging */
    filename?: string;

    /** Request ID for traceability */
    requestId?: string;
}

// ==================================================
// OUTPUT TYPES
// ==================================================

/**
 * Detected dimensions in millimeters.
 */
export interface DimensionsMM {
    /** Longest edge */
    length: number;
    /** Second longest edge */
    width: number;
    /** Shortest edge (estimated from perspective) */
    height: number;
}

/**
 * Confidence factors breakdown.
 */
export interface ConfidenceFactors {
    /** A4 reference detection confidence (0-1) */
    a4_detection: number;
    /** Package bounding box confidence (0-1) */
    bounding_box: number;
    /** Edge clarity/sharpness (0-1) */
    edge_clarity: number;
}

/**
 * Successful dimension estimation result.
 */
export interface DimensionResult {
    /** Success indicator */
    success: true;

    /** Detected dimensions in millimeters */
    dimensions_mm: DimensionsMM;

    /** Computed volume in cubic centimeters */
    volume_cm3: number;

    /** Volumetric weight in kg (volume / 5000) */
    estimated_weight_volumetric_kg: number;

    /** Overall confidence score (0-1) */
    confidence_score: number;

    /** Breakdown of confidence factors */
    confidence_factors: ConfidenceFactors;

    /** Model identifier */
    model_name: string;

    /** Model version */
    model_version: string;

    /** Processing time in milliseconds */
    processing_time_ms: number;

    /** Flag for manual review requirement */
    requires_manual_review: boolean;

    /** Reason for manual review (if applicable) */
    review_reason?: string;
}

/**
 * Failed dimension estimation result.
 */
export interface DimensionError {
    /** Failure indicator */
    success: false;

    /** Error code for programmatic handling */
    error_code: VolumeScanErrorCode;

    /** Human-readable error message */
    error_message: string;

    /** Model identifier */
    model_name: string;

    /** Model version */
    model_version: string;

    /** Processing time in milliseconds */
    processing_time_ms: number;
}

/**
 * Union type for pipeline output.
 */
export type VolumeScanResult = DimensionResult | DimensionError;

// ==================================================
// ERROR CODES
// ==================================================

/**
 * Error codes for failure modes.
 */
export enum VolumeScanErrorCode {
    /** Image format not supported */
    INVALID_IMAGE_FORMAT = 'INVALID_IMAGE_FORMAT',

    /** Image too small */
    IMAGE_TOO_SMALL = 'IMAGE_TOO_SMALL',

    /** Image too large */
    IMAGE_TOO_LARGE = 'IMAGE_TOO_LARGE',

    /** Image is blurry */
    IMAGE_BLURRY = 'IMAGE_BLURRY',

    /** No A4 reference detected */
    NO_REFERENCE_DETECTED = 'NO_REFERENCE_DETECTED',

    /** Multiple A4 references detected */
    MULTIPLE_REFERENCES_DETECTED = 'MULTIPLE_REFERENCES_DETECTED',

    /** A4 reference partially occluded */
    REFERENCE_OCCLUDED = 'REFERENCE_OCCLUDED',

    /** Package not detected */
    NO_PACKAGE_DETECTED = 'NO_PACKAGE_DETECTED',

    /** Ambiguous package boundaries */
    AMBIGUOUS_PACKAGE = 'AMBIGUOUS_PACKAGE',

    /** Internal processing error */
    PROCESSING_ERROR = 'PROCESSING_ERROR',
}

// ==================================================
// INTERNAL TYPES (for pipeline stages)
// ==================================================

/**
 * Validated image metadata.
 */
export interface ValidatedImage {
    /** Image buffer */
    buffer: Buffer;
    /** Width in pixels */
    width: number;
    /** Height in pixels */
    height: number;
    /** Image format */
    format: string;
    /** Blur score (higher = sharper) */
    sharpness: number;
}

/**
 * Detected rectangle (for A4 or package).
 */
export interface DetectedRectangle {
    /** Top-left corner */
    topLeft: Point;
    /** Top-right corner */
    topRight: Point;
    /** Bottom-right corner */
    bottomRight: Point;
    /** Bottom-left corner */
    bottomLeft: Point;
    /** Detection confidence */
    confidence: number;
}

/**
 * 2D point.
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * Calibration result from A4 detection.
 */
export interface ScaleCalibration {
    /** Pixels per millimeter (horizontal) */
    pxPerMm_x: number;
    /** Pixels per millimeter (vertical) */
    pxPerMm_y: number;
    /** Average pixels per mm */
    pxPerMm: number;
    /** A4 rectangle in image */
    a4Rect: DetectedRectangle;
    /** Calibration confidence */
    confidence: number;
}

/**
 * Package measurement result.
 */
export interface PackageMeasurement {
    /** Bounding rectangle in pixels */
    rect: DetectedRectangle;
    /** Length in pixels */
    lengthPx: number;
    /** Width in pixels */
    widthPx: number;
    /** Estimated height in pixels (from shadow/perspective) */
    heightPx: number;
    /** Measurement confidence */
    confidence: number;
}
