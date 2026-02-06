/**
 * A4 Reference Detector
 * 
 * Detects an A4 sheet in an image using classical computer vision.
 * Uses edge detection and contour analysis.
 */

import sharp from 'sharp';
import {
    ValidatedImage,
    DetectedRectangle,
    Point,
    A4_ASPECT_RATIO,
    VolumeScanErrorCode,
} from '../types';

// ==================================================
// CONSTANTS
// ==================================================

/** Tolerance for A4 aspect ratio matching (±15%) */
const ASPECT_RATIO_TOLERANCE = 0.15;

/** Minimum area as fraction of image area */
const MIN_AREA_FRACTION = 0.03;

/** Maximum area as fraction of image area */
const MAX_AREA_FRACTION = 0.50;

/** Canny edge detection thresholds */
const CANNY_LOW = 50;
const CANNY_HIGH = 150;

/** Minimum contour points for rectangle approximation */
const MIN_CONTOUR_POINTS = 4;

// ==================================================
// DETECTION RESULT
// ==================================================

export interface A4DetectionSuccess {
    detected: true;
    rectangle: DetectedRectangle;
    widthPx: number;
    heightPx: number;
    confidence: number;
}

export interface A4DetectionError {
    detected: false;
    errorCode: VolumeScanErrorCode;
    errorMessage: string;
}

export type A4DetectionResult = A4DetectionSuccess | A4DetectionError;

// ==================================================
// DETECTOR
// ==================================================

export class A4Detector {
    /**
     * Detect A4 reference sheet in image.
     */
    async detect(image: ValidatedImage): Promise<A4DetectionResult> {
        try {
            // Step 1: Edge detection
            const edges = await this.detectEdges(image.buffer);

            // Step 2: Find rectangular contours
            const candidates = await this.findRectangularContours(
                edges,
                image.width,
                image.height
            );

            // Step 3: Filter by A4 aspect ratio
            const a4Candidates = this.filterByAspectRatio(candidates);

            // Step 4: Validate results
            if (a4Candidates.length === 0) {
                return {
                    detected: false,
                    errorCode: VolumeScanErrorCode.NO_REFERENCE_DETECTED,
                    errorMessage: 'No A4 reference sheet detected. Please ensure the A4 sheet is fully visible.',
                };
            }

            if (a4Candidates.length > 1) {
                return {
                    detected: false,
                    errorCode: VolumeScanErrorCode.MULTIPLE_REFERENCES_DETECTED,
                    errorMessage: `Multiple A4 candidates detected (${a4Candidates.length}). Please use only one A4 sheet.`,
                };
            }

            const best = a4Candidates[0];

            return {
                detected: true,
                rectangle: best.rect,
                widthPx: best.widthPx,
                heightPx: best.heightPx,
                confidence: best.confidence,
            };
        } catch (error) {
            return {
                detected: false,
                errorCode: VolumeScanErrorCode.PROCESSING_ERROR,
                errorMessage: `A4 detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }

    /**
     * Apply edge detection to image.
     */
    private async detectEdges(buffer: Buffer): Promise<Buffer> {
        // Apply Gaussian blur then edge detection
        return sharp(buffer)
            .grayscale()
            .blur(1.5)
            .convolve({
                width: 3,
                height: 3,
                kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1], // Laplacian for edges
            })
            .threshold(CANNY_LOW)
            .toBuffer();
    }

    /**
     * Find rectangular contours in edge image.
     * Uses a simplified approach without full OpenCV contour detection.
     */
    private async findRectangularContours(
        edgeBuffer: Buffer,
        imageWidth: number,
        imageHeight: number
    ): Promise<RectangleCandidate[]> {
        // Get raw pixel data
        const { data } = await sharp(edgeBuffer)
            .raw()
            .toBuffer({ resolveWithObject: true });

        const pixels = new Uint8Array(data);
        const imageArea = imageWidth * imageHeight;

        // Find connected white regions (edges)
        const visited = new Set<number>();
        const candidates: RectangleCandidate[] = [];

        // Scan for edge pixels and trace contours
        // This is a simplified region growing approach
        for (let y = 0; y < imageHeight; y += 10) { // Sample every 10 pixels
            for (let x = 0; x < imageWidth; x += 10) {
                const idx = y * imageWidth + x;

                if (pixels[idx] > 200 && !visited.has(idx)) {
                    // Found an edge pixel, trace the region
                    const region = this.traceRegion(pixels, imageWidth, imageHeight, x, y, visited);

                    if (region.points.length >= MIN_CONTOUR_POINTS) {
                        // Try to fit a rectangle
                        const rect = this.fitRectangle(region.points);
                        const area = this.calculateRectArea(rect);
                        const areaFraction = area / imageArea;

                        if (areaFraction >= MIN_AREA_FRACTION && areaFraction <= MAX_AREA_FRACTION) {
                            const widthPx = this.distance(rect.topLeft, rect.topRight);
                            const heightPx = this.distance(rect.topLeft, rect.bottomLeft);

                            candidates.push({
                                rect,
                                widthPx: Math.max(widthPx, heightPx),
                                heightPx: Math.min(widthPx, heightPx),
                                confidence: this.calculateRectConfidence(region.points, rect),
                            });
                        }
                    }
                }
            }
        }

        return candidates;
    }

    /**
     * Trace a connected region of edge pixels.
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
        const maxPoints = 1000; // Limit to prevent infinite loops

        while (stack.length > 0 && points.length < maxPoints) {
            const p = stack.pop()!;
            const idx = p.y * width + p.x;

            if (visited.has(idx)) continue;
            if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) continue;
            if (pixels[idx] < 200) continue;

            visited.add(idx);
            points.push(p);

            // Add neighbors (8-connected)
            const step = 2; // Skip pixels for speed
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
     * Fit a rectangle to a set of points (minimum bounding rectangle).
     */
    private fitRectangle(points: Point[]): DetectedRectangle {
        // Find bounding box (simplified - could use rotating calipers for better fit)
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
            confidence: 0.8, // Will be recalculated
        };
    }

    /**
     * Calculate rectangle area.
     */
    private calculateRectArea(rect: DetectedRectangle): number {
        const width = this.distance(rect.topLeft, rect.topRight);
        const height = this.distance(rect.topLeft, rect.bottomLeft);
        return width * height;
    }

    /**
     * Calculate distance between two points.
     */
    private distance(a: Point, b: Point): number {
        return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
    }

    /**
     * Calculate confidence that points form the given rectangle.
     */
    private calculateRectConfidence(points: Point[], rect: DetectedRectangle): number {
        // Check how well points fit the rectangle edges
        let onEdgeCount = 0;
        const tolerance = 5; // pixels

        for (const p of points) {
            if (this.isPointOnRectEdge(p, rect, tolerance)) {
                onEdgeCount++;
            }
        }

        return Math.min(1, onEdgeCount / Math.max(points.length * 0.3, 1));
    }

    /**
     * Check if point is on rectangle edge.
     */
    private isPointOnRectEdge(p: Point, rect: DetectedRectangle, tolerance: number): boolean {
        const minX = rect.topLeft.x;
        const maxX = rect.topRight.x;
        const minY = rect.topLeft.y;
        const maxY = rect.bottomLeft.y;

        const nearLeft = Math.abs(p.x - minX) < tolerance;
        const nearRight = Math.abs(p.x - maxX) < tolerance;
        const nearTop = Math.abs(p.y - minY) < tolerance;
        const nearBottom = Math.abs(p.y - maxY) < tolerance;

        const inXRange = p.x >= minX - tolerance && p.x <= maxX + tolerance;
        const inYRange = p.y >= minY - tolerance && p.y <= maxY + tolerance;

        return (nearLeft && inYRange) || (nearRight && inYRange) ||
            (nearTop && inXRange) || (nearBottom && inXRange);
    }

    /**
     * Filter candidates by A4 aspect ratio.
     */
    private filterByAspectRatio(candidates: RectangleCandidate[]): RectangleCandidate[] {
        return candidates.filter(c => {
            // A4 can be portrait or landscape
            const aspectRatio = c.widthPx / c.heightPx;
            const invertedRatio = c.heightPx / c.widthPx;

            const matchesPortrait = Math.abs(aspectRatio - A4_ASPECT_RATIO) < ASPECT_RATIO_TOLERANCE;
            const matchesLandscape = Math.abs(invertedRatio - A4_ASPECT_RATIO) < ASPECT_RATIO_TOLERANCE;

            return matchesPortrait || matchesLandscape;
        }).sort((a, b) => b.confidence - a.confidence);
    }
}

// ==================================================
// INTERNAL TYPES
// ==================================================

interface RectangleCandidate {
    rect: DetectedRectangle;
    widthPx: number;
    heightPx: number;
    confidence: number;
}
