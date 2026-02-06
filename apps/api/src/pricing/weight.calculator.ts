/**
 * Weight Calculator
 * 
 * Calcule le poids payable : max(poids_réel, poids_volumétrique)
 * Utilisé pour la facturation des expéditions.
 */

import type { WeightSource } from '@prisma/client';

// ==================================================
// CONSTANTS
// ==================================================

/** Diviseur volumétrique fret aérien standard */
export const VOLUMETRIC_DIVISOR = 5000;

// ==================================================
// TYPES
// ==================================================

export interface Dimensions {
    lengthCm: number;
    widthCm: number;
    heightCm: number;
}

export interface WeightCalculationInput {
    dimensions: Dimensions;
    declaredWeightKg?: number;
    realWeightKg?: number;
    source?: WeightSource;
}

export interface WeightCalculationResult {
    /** Volume en cm³ */
    volumeCm3: number;

    /** Poids déclaré par utilisateur (optionnel) */
    declaredWeightKg: number | null;

    /** Poids réel mesuré (optionnel) */
    realWeightKg: number | null;

    /** Poids volumétrique calculé (volume / 5000) */
    volumetricWeightKg: number;

    /** Poids payable = max(réel ou déclaré, volumétrique) */
    payableWeightKg: number;

    /** Source du poids utilisé */
    weightSource: WeightSource;
}

// ==================================================
// CALCULATOR
// ==================================================

export class WeightCalculator {
    private readonly divisor: number;

    constructor(divisor: number = VOLUMETRIC_DIVISOR) {
        this.divisor = divisor;
    }

    /**
     * Calcule le poids payable.
     * 
     * Logique:
     * 1. Calcul volume = L × W × H
     * 2. Calcul poids volumétrique = volume / 5000
     * 3. Sélection poids de référence = realWeightKg ?? declaredWeightKg
     * 4. Poids payable = max(référence, volumétrique)
     */
    calculate(input: WeightCalculationInput): WeightCalculationResult {
        const { dimensions, declaredWeightKg, realWeightKg, source } = input;

        // Calcul volume
        const volumeCm3 = dimensions.lengthCm * dimensions.widthCm * dimensions.heightCm;

        // Calcul poids volumétrique
        const volumetricWeightKg = this.roundWeight(volumeCm3 / this.divisor);

        // Poids de référence (réel prioritaire sur déclaré)
        const referenceWeightKg = realWeightKg ?? declaredWeightKg;

        // Poids payable = max(référence, volumétrique)
        let payableWeightKg: number;
        if (referenceWeightKg !== undefined && referenceWeightKg !== null) {
            payableWeightKg = Math.max(referenceWeightKg, volumetricWeightKg);
        } else {
            // Pas de poids de référence → utiliser volumétrique
            payableWeightKg = volumetricWeightKg;
        }

        // Déterminer la source
        let weightSource: WeightSource;
        if (source) {
            weightSource = source;
        } else if (realWeightKg !== undefined && realWeightKg !== null) {
            weightSource = 'AI_SCAN';
        } else if (declaredWeightKg !== undefined && declaredWeightKg !== null) {
            weightSource = 'DECLARED';
        } else {
            weightSource = 'DECLARED'; // Default
        }

        return {
            volumeCm3: this.roundVolume(volumeCm3),
            declaredWeightKg: declaredWeightKg ?? null,
            realWeightKg: realWeightKg ?? null,
            volumetricWeightKg,
            payableWeightKg: this.roundWeight(payableWeightKg),
            weightSource,
        };
    }

    /**
     * Met à jour le calcul après scan AI.
     */
    recalculateWithScan(
        currentResult: WeightCalculationResult,
        scanWeightKg: number
    ): WeightCalculationResult {
        const newPayable = Math.max(scanWeightKg, currentResult.volumetricWeightKg);

        return {
            ...currentResult,
            realWeightKg: scanWeightKg,
            payableWeightKg: this.roundWeight(newPayable),
            weightSource: 'AI_SCAN',
        };
    }

    /**
     * Surcharge manuelle (opérateur).
     */
    manualOverride(
        dimensions: Dimensions,
        overrideWeightKg: number
    ): WeightCalculationResult {
        const volumeCm3 = dimensions.lengthCm * dimensions.widthCm * dimensions.heightCm;
        const volumetricWeightKg = this.roundWeight(volumeCm3 / this.divisor);

        return {
            volumeCm3: this.roundVolume(volumeCm3),
            declaredWeightKg: null,
            realWeightKg: overrideWeightKg,
            volumetricWeightKg,
            payableWeightKg: Math.max(overrideWeightKg, volumetricWeightKg),
            weightSource: 'MANUAL',
        };
    }

    /**
     * Arrondir le poids à 3 décimales (grammes).
     */
    private roundWeight(weight: number): number {
        return Math.round(weight * 1000) / 1000;
    }

    /**
     * Arrondir le volume à 2 décimales.
     */
    private roundVolume(volume: number): number {
        return Math.round(volume * 100) / 100;
    }
}

// ==================================================
// SINGLETON
// ==================================================

let instance: WeightCalculator | null = null;

export function getWeightCalculator(): WeightCalculator {
    if (!instance) {
        instance = new WeightCalculator();
    }
    return instance;
}
