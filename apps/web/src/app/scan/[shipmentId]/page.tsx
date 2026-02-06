'use client';

/**
 * Scan Page
 * 
 * Page principale pour le scan VolumeScan AI.
 */

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import styles from './page.module.css';
import {
    A4Instructions,
    ScanUploader,
    ScanStatus,
    ScanResult,
    type ScanStatusType
} from './components';

// Types
interface ScanResultData {
    dimensions: {
        lengthCm: number;
        widthCm: number;
        heightCm: number;
    };
    volumeCm3: number;
    payableWeightKg: number;
    weightSource: 'DECLARED' | 'AI_SCAN' | 'MANUAL' | 'volumetric';
    confidenceScore: number;
    requiresReview: boolean;
}

type PageState = 'upload' | 'processing' | 'result';

export default function ScanPage() {
    const params = useParams();
    const shipmentId = params.shipmentId as string;

    const [pageState, setPageState] = useState<PageState>('upload');
    const [scanStatus, setScanStatus] = useState<ScanStatusType>('PENDING');
    const [scanResult, setScanResult] = useState<ScanResultData | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [scanRequestId, setScanRequestId] = useState<string | null>(null);

    // Upload handler
    const handleUpload = useCallback(async (file: File) => {
        setIsUploading(true);
        setError(null);

        try {
            const formData = new FormData();
            formData.append('image', file);
            formData.append('shipmentId', shipmentId);

            const response = await fetch('/api/scan/upload', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                throw new Error('Échec de l\'upload');
            }

            const data = await response.json();
            setScanRequestId(data.scanRequestId);
            setPageState('processing');
            setScanStatus('PENDING');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setIsUploading(false);
        }
    }, [shipmentId]);

    // Polling for scan status
    useEffect(() => {
        if (pageState !== 'processing' || !scanRequestId) return;

        const pollInterval = setInterval(async () => {
            try {
                const response = await fetch(`/api/scan/${scanRequestId}/status`);
                if (!response.ok) return;

                const data = await response.json();
                setScanStatus(data.status);

                if (data.status === 'PROCESSING') {
                    // Continue polling
                } else if (data.status === 'COMPLETED' || data.status === 'MANUAL_REVIEW_REQUIRED') {
                    // Fetch result
                    clearInterval(pollInterval);
                    const resultResponse = await fetch(`/api/scan/${scanRequestId}/result`);
                    if (resultResponse.ok) {
                        const resultData = await resultResponse.json();
                        setScanResult({
                            dimensions: resultData.dimensions,
                            volumeCm3: resultData.volumeCm3,
                            payableWeightKg: resultData.payableWeightKg,
                            weightSource: resultData.weightSource,
                            confidenceScore: resultData.confidenceScore,
                            requiresReview: data.status === 'MANUAL_REVIEW_REQUIRED',
                        });
                        setPageState('result');
                    }
                } else if (data.status === 'FAILED') {
                    clearInterval(pollInterval);
                    setError('Le scan a échoué. Veuillez réessayer avec une autre photo.');
                    setPageState('upload');
                }
            } catch {
                // Ignore polling errors
            }
        }, 2000);

        return () => clearInterval(pollInterval);
    }, [pageState, scanRequestId]);

    // Reset handler
    const handleReset = () => {
        setPageState('upload');
        setScanStatus('PENDING');
        setScanResult(null);
        setScanRequestId(null);
        setError(null);
    };

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <h1 className={styles.title}>📦 Scan du colis</h1>
                <p className={styles.subtitle}>
                    Expédition: <code>{shipmentId}</code>
                </p>
            </header>

            {error && (
                <div className={styles.error}>
                    ❌ {error}
                </div>
            )}

            {pageState === 'upload' && (
                <div className={styles.uploadSection}>
                    <A4Instructions />
                    <div className={styles.spacer}></div>
                    <ScanUploader
                        onUpload={handleUpload}
                        isLoading={isUploading}
                    />
                </div>
            )}

            {pageState === 'processing' && (
                <div className={styles.processingSection}>
                    <ScanStatus status={scanStatus} />
                </div>
            )}

            {pageState === 'result' && scanResult && (
                <div className={styles.resultSection}>
                    <ScanResult {...scanResult} />

                    <button
                        className={styles.newScanButton}
                        onClick={handleReset}
                    >
                        📷 Nouveau scan
                    </button>
                </div>
            )}
        </main>
    );
}
