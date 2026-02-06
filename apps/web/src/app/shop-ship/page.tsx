'use client';

/**
 * Shop & Ship - My Requests Page
 * 
 * Lists all purchase requests for the current user.
 * Shows status, cost breakdown, and links to detail view.
 */

import { useState, useEffect } from 'react';
import Link from 'next/link';
import './shop-ship.css';

interface PurchaseRequest {
    id: string;
    itemDescription: string;
    status: string;
    quantity: number;
    createdAt: string;
    pricingSnapshot?: {
        totalXof: number;
    };
    destinationHub?: {
        name: string;
        country: string;
    };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function formatDate(dateString: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    }).format(new Date(dateString));
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA';
}

function getStatusBadge(status: string): { className: string; label: string } {
    const statusMap: Record<string, { className: string; label: string }> = {
        SUBMITTED: { className: 'pending', label: 'En attente' },
        QUOTED: { className: 'pending', label: 'Devis prêt' },
        APPROVED: { className: 'active', label: 'Confirmé' },
        ORDERING: { className: 'active', label: 'En commande' },
        ORDERED: { className: 'active', label: 'Commandé' },
        RECEIVED_AT_HUB: { className: 'active', label: 'Réceptionné' },
        CONSOLIDATING: { className: 'active', label: 'Préparation' },
        SHIPPED: { className: 'active', label: 'Expédié' },
        COMPLETED: { className: 'complete', label: 'Livré' },
        EXCEPTION: { className: 'error', label: 'Exception' },
        CANCELLED: { className: 'error', label: 'Annulé' },
    };
    return statusMap[status] || { className: 'pending', label: status };
}

export default function ShopShipPage() {
    const [requests, setRequests] = useState<PurchaseRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchRequests();
    }, []);

    async function fetchRequests() {
        try {
            // TODO: Add authentication header
            const res = await fetch(`${API_BASE}/api/shop-ship/requests/my`);
            if (!res.ok) throw new Error('Erreur lors du chargement');
            const data = await res.json();
            setRequests(data);
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
                    <h1>Shop & Ship</h1>
                    <p>Chargement...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="shop-ship-container">
            <div className="shop-ship-header">
                <h1>Shop & Ship</h1>
                <p>Vos achats à l'étranger, livrés chez vous</p>
            </div>

            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <Link href={'/shop-ship/new' as any} className="new-request-btn">
                    + Nouvelle demande
                </Link>
            </div>

            {error && (
                <div style={{
                    color: 'var(--color-error)',
                    padding: 'var(--spacing-md)',
                    background: '#fef2f2',
                    borderRadius: 'var(--border-radius)',
                    marginBottom: 'var(--spacing-md)'
                }}>
                    {error}
                </div>
            )}

            {requests.length === 0 ? (
                <div className="empty-state">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z" />
                        <path d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z" />
                    </svg>
                    <h3>Aucune demande</h3>
                    <p>Commencez par créer votre première demande d'achat</p>
                </div>
            ) : (
                <div className="request-list">
                    {requests.map(request => {
                        const badge = getStatusBadge(request.status);
                        return (
                            <Link
                                href={`/shop-ship/${request.id}` as any}
                                key={request.id}
                                style={{ textDecoration: 'none', color: 'inherit' }}
                            >
                                <div className="request-card">
                                    <div className="request-card-header">
                                        <h3>{request.itemDescription}</h3>
                                        <span className={`status-badge ${badge.className}`}>
                                            {badge.label}
                                        </span>
                                    </div>
                                    <div className="request-card-meta">
                                        <span>Qté: {request.quantity}</span>
                                        {request.pricingSnapshot && (
                                            <span>{formatCurrency(request.pricingSnapshot.totalXof)}</span>
                                        )}
                                        <span>{formatDate(request.createdAt)}</span>
                                        {request.destinationHub && (
                                            <span>→ {request.destinationHub.name}</span>
                                        )}
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
