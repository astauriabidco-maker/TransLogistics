'use client';

/**
 * Scan Status Component
 * 
 * Affiche l'état actuel du scan.
 */

import styles from './ScanStatus.module.css';

export type ScanStatusType =
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'MANUAL_REVIEW_REQUIRED';

interface ScanStatusProps {
    status: ScanStatusType;
    message?: string;
}

const STATUS_CONFIG: Record<ScanStatusType, { icon: string; label: string; className: string }> = {
    PENDING: {
        icon: '⏳',
        label: 'En attente...',
        className: 'pending',
    },
    PROCESSING: {
        icon: '🔄',
        label: 'Analyse en cours...',
        className: 'processing',
    },
    COMPLETED: {
        icon: '✅',
        label: 'Scan terminé',
        className: 'completed',
    },
    FAILED: {
        icon: '❌',
        label: 'Échec du scan',
        className: 'failed',
    },
    MANUAL_REVIEW_REQUIRED: {
        icon: '⚠️',
        label: 'Vérification requise',
        className: 'review',
    },
};

export function ScanStatus({ status, message }: ScanStatusProps) {
    const config = STATUS_CONFIG[status];

    return (
        <div className={`${styles.container} ${styles[config.className]}`}>
            <div className={styles.iconWrapper}>
                <span className={styles.icon}>{config.icon}</span>
            </div>

            <div className={styles.content}>
                <p className={styles.label}>{config.label}</p>
                {message && (
                    <p className={styles.message}>{message}</p>
                )}
            </div>

            {status === 'PROCESSING' && (
                <div className={styles.progressBar}>
                    <div className={styles.progressFill}></div>
                </div>
            )}
        </div>
    );
}
