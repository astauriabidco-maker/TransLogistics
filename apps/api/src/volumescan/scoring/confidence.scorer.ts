/**
 * Confidence Scorer
 * 
 * Combines individual confidence factors into overall score.
 */

import {
    ConfidenceFactors,
    CONFIDENCE_THRESHOLD,
} from '../types';

// ==================================================
// WEIGHTS
// ==================================================

/** Weights for confidence factors (must sum to 1.0) */
const WEIGHTS = {
    a4_detection: 0.40,
    bounding_box: 0.35,
    edge_clarity: 0.25,
} as const;

// ==================================================
// SCORER
// ==================================================

export class ConfidenceScorer {
    /**
     * Calculate overall confidence score.
     */
    calculate(
        a4Confidence: number,
        boundingBoxConfidence: number,
        edgeClarity: number
    ): {
        score: number;
        factors: ConfidenceFactors;
        requiresManualReview: boolean;
        reviewReason?: string;
    } {
        // Normalize inputs to 0-1 range
        const factors: ConfidenceFactors = {
            a4_detection: this.clamp(a4Confidence, 0, 1),
            bounding_box: this.clamp(boundingBoxConfidence, 0, 1),
            edge_clarity: this.clamp(edgeClarity, 0, 1),
        };

        // Calculate weighted score
        const score =
            factors.a4_detection * WEIGHTS.a4_detection +
            factors.bounding_box * WEIGHTS.bounding_box +
            factors.edge_clarity * WEIGHTS.edge_clarity;

        // Determine if manual review is required
        const requiresManualReview = score < CONFIDENCE_THRESHOLD;

        // Determine review reason
        let reviewReason: string | undefined;
        if (requiresManualReview) {
            reviewReason = this.getReviewReason(factors);
        }

        return {
            score: parseFloat(score.toFixed(3)),
            factors,
            requiresManualReview,
            reviewReason,
        };
    }

    /**
     * Clamp value to range.
     */
    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    /**
     * Get human-readable review reason.
     */
    private getReviewReason(factors: ConfidenceFactors): string {
        const issues: string[] = [];

        if (factors.a4_detection < 0.7) {
            issues.push('A4 reference may not be clearly visible');
        }

        if (factors.bounding_box < 0.7) {
            issues.push('Package boundaries may be unclear');
        }

        if (factors.edge_clarity < 0.7) {
            issues.push('Image edges may be blurry or low contrast');
        }

        if (issues.length === 0) {
            return 'Overall confidence below threshold';
        }

        return issues.join('; ');
    }
}
