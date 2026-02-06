'use client';

/**
 * Shop & Ship - Request Detail Page
 * 
 * Shows full details of a purchase request including:
 * - Status tracking timeline
 * - Cost breakdown
 * - Product information
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { StatusTracker, CostBreakdown } from '@/components/shop-ship';
import '../shop-ship.css';

interface PurchaseRequest {
    id: string;
    status: string;
    productUrl: string;
    itemDescription: string;
    quantity: number;
    productOptions?: string;
    notes?: string;
    estimatedPriceXof?: number;
    createdAt: string;
    pricingSnapshot?: {
        productCostXof: number;
        serviceFeeXof: number;
        estimatedLogisticsXof: number;
        totalXof: number;
    };
    destinationHub?: {
        id: string;
        name: string;
        country: string;
    };
    user?: {
        firstName: string;
        lastName: string;
    };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function RequestDetailPage() {
    const params = useParams();
    const requestId = params.id as string;

    const [request, setRequest] = useState<PurchaseRequest | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (requestId) {
            fetchRequest();
        }
    }, [requestId]);

    async function fetchRequest() {
        try {
            const res = await fetch(`${API_BASE}/api/shop-ship/requests/${requestId}`);
            if (!res.ok) throw new Error('Demande non trouvée');
            const data = await res.json();
            setRequest(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur');
        } finally {
            setLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="shop-ship-container">
                <div className="shop-ship-header">
                    <h1>Chargement...</h1>
                </div>
            </div>
        );
    }

    if (error || !request) {
        return (
            <div className="shop-ship-container">
                <div className="shop-ship-header">
                    <h1>Erreur</h1>
                    <p>{error || 'Demande non trouvée'}</p>
                </div>
                <Link href={'/shop-ship' as any} style={{ color: 'var(--color-primary)' }}>
                    ← Retour à mes demandes
                </Link>
            </div>
        );
    }

    const canEdit = request.status === 'SUBMITTED';
    const hasQuote = request.status !== 'SUBMITTED';

    return (
        <div className="shop-ship-container">
            <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <Link href={'/shop-ship' as any} style={{
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.875rem'
                }}>
                    ← Retour à mes demandes
                </Link>
            </div>

            <div className="shop-ship-header">
                <h1>{request.itemDescription}</h1>
                <p>Demande #{request.id.slice(-8).toUpperCase()}</p>
            </div>

            {/* Status Tracker */}
            <StatusTracker
                currentStatus={request.status}
                requestId={request.id}
                createdAt={request.createdAt}
            />

            {/* Cost Breakdown */}
            {hasQuote && (
                <CostBreakdown pricing={request.pricingSnapshot || null} />
            )}

            {/* Product Details */}
            <div className="purchase-form" style={{ marginTop: 'var(--spacing-lg)' }}>
                <h3 style={{ marginBottom: 'var(--spacing-md)' }}>📦 Détails du produit</h3>

                <div className="form-group">
                    <label>Lien produit</label>
                    <a
                        href={request.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: 'block',
                            padding: '12px 16px',
                            background: 'var(--color-background)',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid #ddd',
                            wordBreak: 'break-all'
                        }}
                    >
                        {request.productUrl}
                    </a>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label>Quantité</label>
                        <div style={{
                            padding: '12px 16px',
                            background: 'var(--color-background)',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid #ddd'
                        }}>
                            {request.quantity}
                        </div>
                    </div>

                    {request.estimatedPriceXof && (
                        <div className="form-group">
                            <label>Prix estimé fourni</label>
                            <div style={{
                                padding: '12px 16px',
                                background: 'var(--color-background)',
                                borderRadius: 'var(--border-radius)',
                                border: '1px solid #ddd'
                            }}>
                                {new Intl.NumberFormat('fr-FR').format(request.estimatedPriceXof)} FCFA
                            </div>
                        </div>
                    )}
                </div>

                {request.productOptions && (
                    <div className="form-group">
                        <label>Options</label>
                        <div style={{
                            padding: '12px 16px',
                            background: 'var(--color-background)',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid #ddd'
                        }}>
                            {request.productOptions}
                        </div>
                    </div>
                )}

                {request.notes && (
                    <div className="form-group">
                        <label>Notes</label>
                        <div style={{
                            padding: '12px 16px',
                            background: 'var(--color-background)',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid #ddd'
                        }}>
                            {request.notes}
                        </div>
                    </div>
                )}

                {request.destinationHub && (
                    <div className="form-group">
                        <label>Point de retrait</label>
                        <div style={{
                            padding: '12px 16px',
                            background: 'var(--color-background)',
                            borderRadius: 'var(--border-radius)',
                            border: '1px solid #ddd'
                        }}>
                            📍 {request.destinationHub.name} ({request.destinationHub.country})
                        </div>
                    </div>
                )}
            </div>

            {/* Action Button for QUOTED status */}
            {request.status === 'QUOTED' && request.pricingSnapshot && (
                <div style={{
                    marginTop: 'var(--spacing-lg)',
                    padding: 'var(--spacing-lg)',
                    background: '#f0fff4',
                    borderRadius: 'var(--border-radius)',
                    textAlign: 'center'
                }}>
                    <p style={{ marginBottom: 'var(--spacing-md)' }}>
                        <strong>Votre devis est prêt !</strong><br />
                        Confirmez pour procéder à l'achat.
                    </p>
                    <button
                        className="submit-btn"
                        style={{ maxWidth: '300px' }}
                        onClick={() => {
                            // TODO: Implement payment flow
                            alert('Paiement à implémenter');
                        }}
                    >
                        Confirmer et payer ({new Intl.NumberFormat('fr-FR').format(request.pricingSnapshot.totalXof)} FCFA)
                    </button>
                </div>
            )}

            {/* Info for pending status */}
            {request.status === 'SUBMITTED' && (
                <div style={{
                    marginTop: 'var(--spacing-lg)',
                    padding: 'var(--spacing-lg)',
                    background: '#fff7ed',
                    borderRadius: 'var(--border-radius)',
                    textAlign: 'center'
                }}>
                    <p>
                        ⏳ <strong>En attente de devis</strong><br />
                        Notre équipe vérifie le produit et calcule le coût total.
                        Vous serez notifié lorsque le devis sera prêt.
                    </p>
                </div>
            )}
        </div>
    );
}
