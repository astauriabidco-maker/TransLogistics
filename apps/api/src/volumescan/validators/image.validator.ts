/**
 * Image Validator
 * 
 * Validates input images for the VolumeScan pipeline.
 * Checks format, size, and sharpness.
 */

import sharp from 'sharp';
import {
    VolumeScanInput,
    ValidatedImage,
    VolumeScanErrorCode,
    MIN_IMAGE_SIZE,
    MAX_IMAGE_SIZE,
} from '../types';

// ==================================================
// CONSTANTS
// ==================================================

/** Minimum Laplacian variance for sharpness (higher = sharper) */
const MIN_SHARPNESS = 100;

/** Supported image formats */
const SUPPORTED_FORMATS = ['jpeg', 'jpg', 'png', 'webp'];

// ==================================================
// VALIDATION RESULT
// ==================================================

export interface ImageValidationResult {
    valid: true;
    image: ValidatedImage;
}

export interface ImageValidationError {
    valid: false;
    errorCode: VolumeScanErrorCode;
    errorMessage: string;
}

export type ValidationResult = ImageValidationResult | ImageValidationError;

// ==================================================
// VALIDATOR
// ==================================================

export class ImageValidator {
    /**
     * Validate an input image for the VolumeScan pipeline.
     */
    async validate(input: VolumeScanInput): Promise<ValidationResult> {
        try {
            // Convert input to buffer
            const buffer = this.toBuffer(input.imageData);

            // Get image metadata
            const metadata = await sharp(buffer).metadata();

            if (!metadata.format || !metadata.width || !metadata.height) {
                return {
                    valid: false,
                    errorCode: VolumeScanErrorCode.INVALID_IMAGE_FORMAT,
                    errorMessage: 'Could not read image metadata',
                };
            }

            // Check format
            if (!SUPPORTED_FORMATS.includes(metadata.format.toLowerCase())) {
                return {
                    valid: false,
                    errorCode: VolumeScanErrorCode.INVALID_IMAGE_FORMAT,
                    errorMessage: `Unsupported format: ${metadata.format}. Supported: ${SUPPORTED_FORMATS.join(', ')}`,
                };
            }

            // Check minimum size
            if (metadata.width < MIN_IMAGE_SIZE || metadata.height < MIN_IMAGE_SIZE) {
                return {
                    valid: false,
                    errorCode: VolumeScanErrorCode.IMAGE_TOO_SMALL,
                    errorMessage: `Image too small: ${metadata.width}x${metadata.height}. Minimum: ${MIN_IMAGE_SIZE}x${MIN_IMAGE_SIZE}`,
                };
            }

            // Check maximum size
            if (metadata.width > MAX_IMAGE_SIZE || metadata.height > MAX_IMAGE_SIZE) {
                return {
                    valid: false,
                    errorCode: VolumeScanErrorCode.IMAGE_TOO_LARGE,
                    errorMessage: `Image too large: ${metadata.width}x${metadata.height}. Maximum: ${MAX_IMAGE_SIZE}x${MAX_IMAGE_SIZE}`,
                };
            }

            // Calculate sharpness (Laplacian variance approximation)
            const sharpness = await this.calculateSharpness(buffer);

            if (sharpness < MIN_SHARPNESS) {
                return {
                    valid: false,
                    errorCode: VolumeScanErrorCode.IMAGE_BLURRY,
                    errorMessage: `Image is too blurry. Sharpness: ${sharpness.toFixed(1)}, minimum: ${MIN_SHARPNESS}`,
                };
            }

            return {
                valid: true,
                image: {
                    buffer,
                    width: metadata.width,
                    height: metadata.height,
                    format: metadata.format,
                    sharpness,
                },
            };
        } catch (error) {
            return {
                valid: false,
                errorCode: VolumeScanErrorCode.INVALID_IMAGE_FORMAT,
                errorMessage: `Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Convert input to Buffer.
     */
    private toBuffer(data: Buffer | string): Buffer {
        if (Buffer.isBuffer(data)) {
            return data;
        }

        // Assume base64 string
        // Remove data URL prefix if present
        const base64Data = data.replace(/^data:image\/\w+;base64,/, '');
        return Buffer.from(base64Data, 'base64');
    }

    /**
     * Calculate image sharpness using Laplacian variance approximation.
     * Uses edge detection as a proxy for sharpness.
     */
    private async calculateSharpness(buffer: Buffer): Promise<number> {
        // Convert to grayscale and apply Laplacian-like kernel
        const { data, info } = await sharp(buffer)
            .grayscale()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Calculate variance of grayscale values as sharpness proxy
        // Higher variance = more edges = sharper image
        const pixels = new Uint8Array(data);
        const mean = pixels.reduce((a, b) => a + b, 0) / pixels.length;

        let variance = 0;
        for (let i = 0; i < pixels.length; i++) {
            variance += Math.pow(pixels[i] - mean, 2);
        }
        variance /= pixels.length;

        // Apply Laplacian-like edge detection on a sample
        // This is a simplified approximation
        const edgeStrength = await this.calculateEdgeStrength(buffer, info.width, info.height);

        // Combine variance and edge strength
        return Math.sqrt(variance) + edgeStrength;
    }

    /**
     * Calculate edge strength using Sobel-like approximation.
     */
    private async calculateEdgeStrength(
        buffer: Buffer,
        width: number,
        height: number
    ): Promise<number> {
        // Use sharp's convolve to apply edge detection
        const { data } = await sharp(buffer)
            .grayscale()
            .convolve({
                width: 3,
                height: 3,
                kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], // Laplacian kernel
            })
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Calculate mean absolute value of edge response
        const pixels = new Uint8Array(data);
        let sum = 0;
        for (let i = 0; i < pixels.length; i++) {
            sum += Math.abs(pixels[i] - 128); // Center around 128
        }

        return sum / pixels.length;
    }
}
