/**
 * Delivery Page
 * 
 * Single delivery focus with:
 * - Photo capture
 * - Signature pad
 * - Confirm/fail actions
 * - Offline queuing
 */

import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
    type StopInfo,
    getRoutePlan,
    saveProof,
    queueAction,
    updateStopStatus,
} from '../lib/offlineStore';
import { submitDeliveryProof, recordFailedAttempt, OfflineError } from '../lib/api';
import StatusBanner from '../components/StatusBanner';
import CameraCapture from '../components/CameraCapture';
import SignaturePad from '../components/SignaturePad';

type Step = 'photo' | 'signature' | 'confirm' | 'failed';

const FAILURE_REASONS = [
    'Absent',
    'Adresse incorrecte',
    'Refusé',
    'Pas de réponse',
    'Autre',
];

export default function DeliveryPage() {
    const { deliveryId } = useParams<{ deliveryId: string }>();
    const navigate = useNavigate();
    const { session } = useAuth();

    const [stop, setStop] = useState<StopInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    // Proof data
    const [step, setStep] = useState<Step>('photo');
    const [photoBase64, setPhotoBase64] = useState<string | null>(null);
    const [signatureBase64, setSignatureBase64] = useState<string | null>(null);
    const [recipientName, setRecipientName] = useState('');
    const [failureReason, setFailureReason] = useState('');

    // Track online status
    useEffect(() => {
        const handleOnline = () => setIsOffline(false);
        const handleOffline = () => setIsOffline(true);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Load stop details
    useEffect(() => {
        async function loadStop() {
            const route = await getRoutePlan();
            if (route && deliveryId) {
                const found = route.stops.find(s => s.id === deliveryId);
                if (found) {
                    setStop(found);
                    setRecipientName(found.recipientName || '');
                }
            }
            setIsLoading(false);
        }
        loadStop();
    }, [deliveryId]);

    // Get current location
    const getCurrentLocation = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: true });
            });
            return { lat: pos.coords.latitude, lng: pos.coords.longitude };
        } catch {
            return null;
        }
    }, []);

    // Submit delivery proof
    const handleSubmitProof = async () => {
        if (!session || !stop || !deliveryId) return;
        if (!photoBase64 && !signatureBase64) return;

        setIsSubmitting(true);

        try {
            const location = await getCurrentLocation();
            const lat = location?.lat || 0;
            const lng = location?.lng || 0;

            const proofType = signatureBase64 ? 'SIGNATURE' : 'PHOTO';
            const proofData = {
                proofType: proofType as 'PHOTO' | 'SIGNATURE',
                photoUrls: photoBase64 ? [photoBase64] : undefined,
                signatureUrl: signatureBase64 || undefined,
                recipientName,
                lat,
                lng,
            };

            if (navigator.onLine) {
                await submitDeliveryProof(session.token, deliveryId, proofData);
            } else {
                // Store locally
                await saveProof({
                    id: crypto.randomUUID(),
                    shipmentDeliveryId: deliveryId,
                    proofType,
                    photoBase64: photoBase64 || undefined,
                    signatureBase64: signatureBase64 || undefined,
                    recipientName,
                    lat,
                    lng,
                    createdAt: new Date().toISOString(),
                });
            }

            // Update local state
            await updateStopStatus(deliveryId, 'DELIVERED');
            navigate('/route');
        } catch (error) {
            if (error instanceof OfflineError) {
                // Store locally for sync
                const location = await getCurrentLocation();
                await saveProof({
                    id: crypto.randomUUID(),
                    shipmentDeliveryId: deliveryId,
                    proofType: signatureBase64 ? 'SIGNATURE' : 'PHOTO',
                    photoBase64: photoBase64 || undefined,
                    signatureBase64: signatureBase64 || undefined,
                    recipientName,
                    lat: location?.lat || 0,
                    lng: location?.lng || 0,
                    createdAt: new Date().toISOString(),
                });
                await updateStopStatus(deliveryId, 'DELIVERED');
                navigate('/route');
            } else {
                console.error('Failed to submit proof:', error);
                alert('Erreur lors de la soumission');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // Record failed attempt
    const handleFailedAttempt = async () => {
        if (!session || !stop || !deliveryId || !failureReason) return;

        setIsSubmitting(true);

        try {
            const location = await getCurrentLocation();

            if (navigator.onLine) {
                await recordFailedAttempt(
                    session.token,
                    deliveryId,
                    failureReason,
                    photoBase64 ? [photoBase64] : undefined,
                    location?.lat,
                    location?.lng
                );
            } else {
                await queueAction({
                    type: 'FAILED_ATTEMPT',
                    payload: {
                        shipmentDeliveryId: deliveryId,
                        reason: failureReason,
                        photoUrls: photoBase64 ? [photoBase64] : undefined,
                        lat: location?.lat,
                        lng: location?.lng,
                    },
                });
            }

            await updateStopStatus(deliveryId, 'FAILED');
            navigate('/route');
        } catch (error) {
            if (error instanceof OfflineError) {
                const location = await getCurrentLocation();
                await queueAction({
                    type: 'FAILED_ATTEMPT',
                    payload: {
                        shipmentDeliveryId: deliveryId,
                        reason: failureReason,
                        photoUrls: photoBase64 ? [photoBase64] : undefined,
                        lat: location?.lat,
                        lng: location?.lng,
                    },
                });
                await updateStopStatus(deliveryId, 'FAILED');
                navigate('/route');
            } else {
                console.error('Failed to record failure:', error);
                alert('Erreur lors de l\'enregistrement');
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="app-container">
                <div className="page flex items-center justify-center">
                    <div className="spinner" />
                </div>
            </div>
        );
    }

    if (!stop) {
        return (
            <div className="app-container">
                <div className="page flex flex-col items-center justify-center gap-md">
                    <p>Livraison introuvable</p>
                    <button className="btn btn-primary" onClick={() => navigate('/route')}>
                        Retour
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="app-container">
            <StatusBanner isOffline={isOffline} />

            {/* Header */}
            <div className="page-header">
                <div className="flex items-center gap-md">
                    <button
                        className="btn btn-outline btn-icon"
                        style={{ width: '48px' }}
                        onClick={() => navigate('/route')}
                    >
                        ←
                    </button>
                    <div className="flex-1">
                        <h1 className="page-title">Livraison #{stop.sequence}</h1>
                        <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)' }}>
                            {stop.address}
                        </p>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="page gap-lg">
                {/* Recipient info */}
                <div className="card">
                    <p style={{ fontWeight: 600, marginBottom: 'var(--spacing-xs)' }}>{stop.recipientName}</p>
                    <a
                        href={`tel:${stop.recipientPhone}`}
                        style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                    >
                        📞 {stop.recipientPhone}
                    </a>
                </div>

                {/* Step: Photo */}
                {step === 'photo' && (
                    <div className="flex flex-col gap-md">
                        <h2 style={{ fontSize: 'var(--font-size-lg)' }}>📸 Photo de la livraison</h2>
                        <CameraCapture
                            onCapture={(base64) => setPhotoBase64(base64)}
                            captured={photoBase64}
                        />
                    </div>
                )}

                {/* Step: Signature */}
                {step === 'signature' && (
                    <div className="flex flex-col gap-md">
                        <h2 style={{ fontSize: 'var(--font-size-lg)' }}>✍️ Signature du destinataire</h2>
                        <SignaturePad
                            onSave={(base64) => setSignatureBase64(base64)}
                        />
                        <div className="input-group">
                            <label className="input-label">Nom du réceptionnaire</label>
                            <input
                                type="text"
                                className="input"
                                placeholder="Nom complet"
                                value={recipientName}
                                onChange={(e) => setRecipientName(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                {/* Step: Confirm */}
                {step === 'confirm' && (
                    <div className="flex flex-col gap-md">
                        <h2 style={{ fontSize: 'var(--font-size-lg)' }}>✅ Confirmer la livraison</h2>
                        <div className="card">
                            {photoBase64 && (
                                <div style={{ marginBottom: 'var(--spacing-md)' }}>
                                    <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-xs)' }}>Photo</p>
                                    <img
                                        src={photoBase64}
                                        alt="Livraison"
                                        style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
                                    />
                                </div>
                            )}
                            {signatureBase64 && (
                                <div>
                                    <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-xs)' }}>Signature</p>
                                    <img
                                        src={signatureBase64}
                                        alt="Signature"
                                        style={{ width: '100%', borderRadius: 'var(--radius-md)', background: 'white' }}
                                    />
                                </div>
                            )}
                            <p style={{ marginTop: 'var(--spacing-md)' }}>
                                <strong>Réceptionnaire:</strong> {recipientName || stop.recipientName}
                            </p>
                        </div>
                    </div>
                )}

                {/* Step: Failed */}
                {step === 'failed' && (
                    <div className="flex flex-col gap-md">
                        <h2 style={{ fontSize: 'var(--font-size-lg)' }}>❌ Livraison impossible</h2>
                        <div className="flex flex-col gap-sm">
                            {FAILURE_REASONS.map((reason) => (
                                <button
                                    key={reason}
                                    className={`btn ${failureReason === reason ? 'btn-danger' : 'btn-outline'}`}
                                    onClick={() => setFailureReason(reason)}
                                >
                                    {reason}
                                </button>
                            ))}
                        </div>
                        {photoBase64 && (
                            <div className="card">
                                <p className="text-muted" style={{ fontSize: 'var(--font-size-sm)', marginBottom: 'var(--spacing-xs)' }}>Photo (optionnelle)</p>
                                <img
                                    src={photoBase64}
                                    alt="Échec"
                                    style={{ width: '100%', borderRadius: 'var(--radius-md)' }}
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Action bar */}
            <div className="action-bar">
                {step === 'photo' && (
                    <>
                        <button
                            className="btn btn-primary"
                            onClick={() => setStep('signature')}
                            disabled={!photoBase64}
                        >
                            Suivant: Signature
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={() => setStep('failed')}
                        >
                            ❌ Impossible de livrer
                        </button>
                    </>
                )}

                {step === 'signature' && (
                    <>
                        <button
                            className="btn btn-primary"
                            onClick={() => setStep('confirm')}
                            disabled={!signatureBase64 || !recipientName}
                        >
                            Suivant: Confirmer
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={() => setStep('photo')}
                        >
                            ← Retour
                        </button>
                    </>
                )}

                {step === 'confirm' && (
                    <>
                        <button
                            className="btn btn-success"
                            onClick={handleSubmitProof}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="spinner" />
                                    Envoi...
                                </>
                            ) : (
                                '✅ Confirmer la livraison'
                            )}
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={() => setStep('signature')}
                            disabled={isSubmitting}
                        >
                            ← Retour
                        </button>
                    </>
                )}

                {step === 'failed' && (
                    <>
                        <button
                            className="btn btn-danger"
                            onClick={handleFailedAttempt}
                            disabled={isSubmitting || !failureReason}
                        >
                            {isSubmitting ? (
                                <>
                                    <span className="spinner" />
                                    Envoi...
                                </>
                            ) : (
                                'Confirmer l\'échec'
                            )}
                        </button>
                        <button
                            className="btn btn-outline"
                            onClick={() => setStep('photo')}
                            disabled={isSubmitting}
                        >
                            ← Retour
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
