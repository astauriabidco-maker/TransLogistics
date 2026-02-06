/**
 * Scale Processor
 * 
 * Calibrates pixel-to-millimeter scale using A4 reference.
 */

import {
    ScaleCalibration,
    A4_DIMENSIONS_MM,
} from '../types';
import { A4DetectionSuccess } from '../detectors/a4.detector';

// ==================================================
// PROCESSOR
// ==================================================

export class ScaleProcessor {
    /**
     * Calculate scale calibration from A4 detection.
     */
    calibrate(a4Detection: A4DetectionSuccess): ScaleCalibration {
        // Determine A4 orientation (portrait or landscape)
        const isLandscape = a4Detection.widthPx > a4Detection.heightPx;

        // Map pixel dimensions to real-world dimensions
        let a4WidthMm: number;
        let a4HeightMm: number;

        if (isLandscape) {
            // A4 is rotated (landscape)
            a4WidthMm = A4_DIMENSIONS_MM.HEIGHT; // 297mm
            a4HeightMm = A4_DIMENSIONS_MM.WIDTH;  // 210mm
        } else {
            // A4 is upright (portrait)
            a4WidthMm = A4_DIMENSIONS_MM.WIDTH;   // 210mm
            a4HeightMm = A4_DIMENSIONS_MM.HEIGHT; // 297mm
        }

        // Calculate pixels per millimeter
        const pxPerMm_x = a4Detection.widthPx / a4WidthMm;
        const pxPerMm_y = a4Detection.heightPx / a4HeightMm;

        // Average for cases where perspective causes slight distortion
        const pxPerMm = (pxPerMm_x + pxPerMm_y) / 2;

        // Confidence is reduced if X and Y scales differ significantly (perspective)
        const scaleDifference = Math.abs(pxPerMm_x - pxPerMm_y) / pxPerMm;
        const confidence = Math.max(0.5, 1 - scaleDifference);

        return {
            pxPerMm_x,
            pxPerMm_y,
            pxPerMm,
            a4Rect: a4Detection.rectangle,
            confidence: confidence * a4Detection.confidence,
        };
    }
}
