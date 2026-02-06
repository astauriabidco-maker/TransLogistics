/**
 * Dimension Processor
 * 
 * Converts pixel measurements to real-world dimensions.
 */

import {
    DimensionsMM,
    ScaleCalibration,
    PackageMeasurement,
    VOLUMETRIC_DIVISOR,
} from '../types';

// ==================================================
// OUTPUT
// ==================================================

export interface DimensionOutput {
    dimensions_mm: DimensionsMM;
    volume_cm3: number;
    estimated_weight_volumetric_kg: number;
}

// ==================================================
// PROCESSOR
// ==================================================

export class DimensionProcessor {
    /**
     * Convert pixel measurements to real-world dimensions.
     */
    calculate(
        measurement: PackageMeasurement,
        calibration: ScaleCalibration
    ): DimensionOutput {
        // Convert pixels to millimeters
        const lengthMm = measurement.lengthPx / calibration.pxPerMm;
        const widthMm = measurement.widthPx / calibration.pxPerMm;
        const heightMm = measurement.heightPx / calibration.pxPerMm;

        // Round to nearest millimeter
        const dimensions_mm: DimensionsMM = {
            length: Math.round(lengthMm),
            width: Math.round(widthMm),
            height: Math.round(heightMm),
        };

        // Calculate volume in cm³
        // mm³ to cm³ = divide by 1000
        const volume_mm3 = dimensions_mm.length * dimensions_mm.width * dimensions_mm.height;
        const volume_cm3 = Math.round(volume_mm3 / 1000);

        // Calculate volumetric weight (kg)
        // Standard air freight formula: cm³ / 5000
        const estimated_weight_volumetric_kg = parseFloat(
            (volume_cm3 / VOLUMETRIC_DIVISOR).toFixed(2)
        );

        return {
            dimensions_mm,
            volume_cm3,
            estimated_weight_volumetric_kg,
        };
    }
}
