/**
 * Package Detector
 * 
 * Detects the package bounding box in an image.
 * Uses the A4 reference position to define the region of interest.
 */

import sharp from 'sharp';
import {
    ValidatedImage,
    DetectedRectangle,
    PackageMeasurement,
    Point,
    VolumeScanErrorCode,
} from '../types';
import { A4DetectionSuccess } from './a4.detector';

// ==================================================
// CONSTANTS
// ==================================================

/** Minimum package area as fraction of A4 area */
const MIN_PACKAGE_AREA_RATIO = 0.1;

/** Maximum package area as fraction of image */
const MAX_PACKAGE_AREA_FRACTION = 0.8;

/** Edge detection threshold */
const EDGE_THRESHOLD = 100;

/** Height estimation factor (when height cannot be measured directly) */
const DEFAULT_HEIGHT_RATIO = 0.5; // Assume height = 50% of smaller dimension

// ==================================================
// DETECTION RESULT
// ==================================================

export interface PackageDetectionSuccess {
    detected: true;
    measurement: PackageMeasurement;
}

export interface PackageDetectionError {
    detected: false;
    errorCode: VolumeScanErrorCode;
    errorMessage: string;
}

export type PackageDetectionResult = PackageDetectionSuccess | PackageDetectionError;

// ==================================================
// DETECTOR
// ==================================================

export class PackageDetector {
    /**
     * Detect package bounding box in image.
     */
    async detect(
        image: ValidatedImage,
        a4Detection: A4DetectionSuccess
    ): Promise<PackageDetectionResult> {
        try {
            // Calculate A4 area for reference
            const a4Area = a4Detection.widthPx * a4Detection.heightPx;
            const imageArea = image.width * image.height;

            // Find the largest non-A4 rectangular region
            const candidates = await this.findPackageCandidates(
                image,
                a4Detection.rectangle,
                a4Area
            );

            if (candidates.length === 0) {
                return {
                    detected: false,
                    errorCode: VolumeScanErrorCode.NO_PACKAGE_DETECTED,
                    errorMessage: 'No package detected. Please ensure the package is clearly visible.',
                };
            }

            // Sort by area (largest first)
            candidates.sort((a, b) => b.area - a.area);

            // Check for ambiguity (multiple large candidates)
            if (candidates.length > 1) {
                const ratio = candidates[1].area / candidates[0].area;
                if (ratio > 0.7) {
                    return {
                        detected: false,
                        errorCode: VolumeScanErrorCode.AMBIGUOUS_PACKAGE,
                        errorMessage: 'Multiple package-like objects detected. Please photograph only one package.',
                    };
                }
            }

            const best = candidates[0];

            // Validate size
            if (best.area < a4Area * MIN_PACKAGE_AREA_RATIO) {
                return {
                    detected: false,
                    errorCode: VolumeScanErrorCode.NO_PACKAGE_DETECTED,
                    errorMessage: 'Detected object is too small. Please move closer to the package.',
                };
            }

            if (best.area > imageArea * MAX_PACKAGE_AREA_FRACTION) {
                return {
                    detected: false,
                    errorCode: VolumeScanErrorCode.AMBIGUOUS_PACKAGE,
                    errorMessage: 'Package fills most of the frame. Please move back to see the entire package.',
                };
            }

            // Estimate height (from perspective or shadow)
            const heightPx = await this.estimateHeight(
                image,
                best.rect,
                best.widthPx,
                best.heightPx
            );

            return {
                detected: true,
                measurement: {
                    rect: best.rect,
                    lengthPx: Math.max(best.widthPx, best.heightPx),
                    widthPx: Math.min(best.widthPx, best.heightPx),
                    heightPx,
                    confidence: best.confidence,
                },
            };
        } catch (error) {
            return {
                detected: false,
                errorCode: VolumeScanErrorCode.PROCESSING_ERROR,
                errorMessage: `Package detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Find package candidate regions.
     */
    private async findPackageCandidates(
        image: ValidatedImage,
        a4Rect: DetectedRectangle,
        a4Area: number
    ): Promise<PackageCandidate[]> {
        // Apply edge detection
        const edgeBuffer = await sharp(image.buffer)
            .grayscale()
            .blur(1)
            .convolve({
                width: 3,
                height: 3,
                kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
            })
            .threshold(EDGE_THRESHOLD)
            .toBuffer();

        const { data } = await sharp(edgeBuffer)
            .raw()
            .toBuffer({ resolveWithObject: true });

        const pixels = new Uint8Array(data);

        // Find connected regions
        const visited = new Set<number>();
        const candidates: PackageCandidate[] = [];

        // Sample the image to find regions
        const stepSize = 15;
        for (let y = 0; y < image.height; y += stepSize) {
            for (let x = 0; x < image.width; x += stepSize) {
                const idx = y * image.width + x;

                if (pixels[idx] > 200 && !visited.has(idx)) {
                    const region = this.traceRegion(
                        pixels,
                        image.width,
                        image.height,
                        x,
                        y,
                        visited
                    );

                    if (region.points.length >= 10) {
                        const rect = this.fitBoundingBox(region.points);
                        const area = this.calculateArea(rect);

                        // Exclude if overlaps significantly with A4
                        if (!this.overlapsWithA4(rect, a4Rect, 0.5)) {
                            const widthPx = Math.abs(rect.topRight.x - rect.topLeft.x);
                            const heightPx = Math.abs(rect.bottomLeft.y - rect.topLeft.y);

                            if (area > a4Area * MIN_PACKAGE_AREA_RATIO) {
                                candidates.push({
                                    rect,
                                    widthPx,
                                    heightPx,
                                    area,
                                    confidence: this.calculateConfidence(region.points, rect),
                                });
                            }
                        }
                    }
                }
            }
        }

        return candidates;
    }

    /**
     * Trace connected region of edge pixels.
     */
    private traceRegion(
        pixels: Uint8Array,
        width: number,
        height: number,
        startX: number,
        startY: number,
        visited: Set<number>
    ): { points: Point[] } {
        const points: Point[] = [];
        const stack: Point[] = [{ x: startX, y: startY }];
        const maxPoints = 2000;

        while (stack.length > 0 && points.length < maxPoints) {
            const p = stack.pop()!;
            const idx = p.y * width + p.x;

            if (visited.has(idx)) continue;
            if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) continue;
            if (pixels[idx] < 200) continue;

            visited.add(idx);
            points.push(p);

            const step = 3;
            stack.push(
                { x: p.x + step, y: p.y },
                { x: p.x - step, y: p.y },
                { x: p.x, y: p.y + step },
                { x: p.x, y: p.y - step },
            );
        }

        return { points };
    }

    /**
     * Fit axis-aligned bounding box to points.
     */
    private fitBoundingBox(points: Point[]): DetectedRectangle {
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const p of points) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        }

        return {
            topLeft: { x: minX, y: minY },
            topRight: { x: maxX, y: minY },
            bottomRight: { x: maxX, y: maxY },
            bottomLeft: { x: minX, y: maxY },
            confidence: 0.8,
        };
    }

    /**
     * Calculate rectangle area.
     */
    private calculateArea(rect: DetectedRectangle): number {
        const width = Math.abs(rect.topRight.x - rect.topLeft.x);
        const height = Math.abs(rect.bottomLeft.y - rect.topLeft.y);
        return width * height;
    }

    /**
     * Check if rectangle overlaps with A4.
     */
    private overlapsWithA4(
        rect: DetectedRectangle,
        a4Rect: DetectedRectangle,
        threshold: number
    ): boolean {
        // Calculate intersection
        const left = Math.max(rect.topLeft.x, a4Rect.topLeft.x);
        const right = Math.min(rect.topRight.x, a4Rect.topRight.x);
        const top = Math.max(rect.topLeft.y, a4Rect.topLeft.y);
        const bottom = Math.min(rect.bottomLeft.y, a4Rect.bottomLeft.y);

        if (left >= right || top >= bottom) {
            return false;
        }

        const intersectionArea = (right - left) * (bottom - top);
        const a4Area = this.calculateArea(a4Rect);

        return intersectionArea / a4Area > threshold;
    }

    /**
     * Calculate detection confidence.
     */
    private calculateConfidence(points: Point[], rect: DetectedRectangle): number {
        // Base confidence on edge coverage
        const rectArea = this.calculateArea(rect);
        const pointDensity = points.length / rectArea;

        // Higher density = clearer edges = higher confidence
        return Math.min(1, pointDensity * 1000);
    }

    /**
     * Estimate package height from image.
     * For MVP, uses a heuristic based on shadow or perspective.
     */
    private async estimateHeight(
        image: ValidatedImage,
        rect: DetectedRectangle,
        widthPx: number,
        heightPx: number
    ): Promise<number> {
        // MVP: Use the smaller of the two visible dimensions as height estimate
        // This assumes the package is roughly cubic or the photo is taken at an angle
        // where one face is visible

        // More sophisticated approach would analyze:
        // 1. Shadow length below the package
        // 2. Perspective distortion
        // 3. Vanishing point analysis

        // For now, use a conservative estimate
        const smallerDim = Math.min(widthPx, heightPx);
        return smallerDim * DEFAULT_HEIGHT_RATIO;
    }
}

// ==================================================
// INTERNAL TYPES
// ==================================================

interface PackageCandidate {
    rect: DetectedRectangle;
    widthPx: number;
    heightPx: number;
    area: number;
    confidence: number;
}
