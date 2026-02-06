'use client';

/**
 * Scan Result Component
 * 
 * Affiche les dimensions et le poids payable.
 */

import styles from './ScanResult.module.css';

interface ScanResultProps {
    dimensions: {
        lengthCm: number;
        widthCm: number;
        heightCm: number;
    };
    volumeCm3: number;
    payableWeightKg: number;
    weightSource: 'DECLARED' | 'AI_SCAN' | 'MANUAL' | 'volumetric';
    confidenceScore: number;
    requiresReview?: boolean;
}

function getConfidenceLevel(score: number): { dots: number; label: string; className: string } {
    if (score >= 0.9) return { dots: 5, label: 'Excellent', className: 'excellent' };
    if (score >= 0.8) return { dots: 4, label: 'Très bon', className: 'good' };
    if (score >= 0.7) return { dots: 3, label: 'Bon', className: 'ok' };
    if (score >= 0.5) return { dots: 2, label: 'Moyen', className: 'low' };
    return { dots: 1, label: 'Faible', className: 'veryLow' };
}

function formatNumber(n: number): string {
    return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

export function ScanResult({
    dimensions,
    volumeCm3,
    payableWeightKg,
    weightSource,
    confidenceScore,
    requiresReview = false,
}: ScanResultProps) {
    const confidence = getConfidenceLevel(confidenceScore);

    const weightLabel = weightSource === 'AI_SCAN'
        ? 'mesuré'
        : weightSource === 'volumetric'
            ? 'volumétrique'
            : weightSource === 'MANUAL'
                ? 'manuel'
                : 'déclaré';

    return (
        <div className={styles.container}>
            {requiresReview && (
                <div className={styles.reviewBanner}>
                    ⚠️ Ces résultats seront vérifiés par notre équipe
                </div>
            )}

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>📦 Dimensions détectées</h3>

                <div className={styles.dimensionsGrid}>
                    <div className={styles.dimension}>
                        <span className={styles.dimensionLabel}>Longueur</span>
                        <span className={styles.dimensionValue}>
                            {formatNumber(dimensions.lengthCm)} <small>cm</small>
                        </span>
                    </div>
                    <div className={styles.dimension}>
                        <span className={styles.dimensionLabel}>Largeur</span>
                        <span className={styles.dimensionValue}>
                            {formatNumber(dimensions.widthCm)} <small>cm</small>
                        </span>
                    </div>
                    <div className={styles.dimension}>
                        <span className={styles.dimensionLabel}>Hauteur</span>
                        <span className={styles.dimensionValue}>
                            {formatNumber(dimensions.heightCm)} <small>cm</small>
                        </span>
                    </div>
                </div>

                <div className={styles.volume}>
                    Volume: <strong>{formatNumber(volumeCm3).replace(/\s/g, ' ')} cm³</strong>
                </div>
            </div>

            <div className={styles.divider}></div>

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>💰 Poids facturé</h3>

                <div className={styles.weightDisplay}>
                    <span className={styles.weightValue}>
                        {formatNumber(payableWeightKg)}
                    </span>
                    <span className={styles.weightUnit}>kg</span>
                </div>

                <p className={styles.weightNote}>
                    ({weightLabel})
                </p>
            </div>

            <div className={styles.divider}></div>

            <div className={styles.section}>
                <h3 className={styles.sectionTitle}>🎯 Confiance</h3>

                <div className={`${styles.confidenceDisplay} ${styles[confidence.className]}`}>
                    <div className={styles.confidenceDots}>
                        {[1, 2, 3, 4, 5].map((i) => (
                            <span
                                key={i}
                                className={`${styles.dot} ${i <= confidence.dots ? styles.active : ''}`}
                            />
                        ))}
                    </div>
                    <span className={styles.confidenceLabel}>
                        {confidence.label} ({Math.round(confidenceScore * 100)}%)
                    </span>
                </div>
            </div>
        </div>
    );
}
