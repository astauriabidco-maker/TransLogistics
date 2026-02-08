/**
 * Shop & Ship Agent Dashboard
 *
 * Procurement pipeline for Shop & Ship agents.
 * Kanban-style view of shopping requests by status.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

interface ShopShipRequest {
    id: string;
    status: string;
    customerName: string;
    itemDescription: string;
    sourceUrl?: string;
    estimatedPrice: number;
    currency: string;
    destinationCity: string;
    destinationHub?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}

const PIPELINE_STAGES = [
    { key: 'PENDING', label: 'En attente', color: '#94a3b8', emoji: '📋' },
    { key: 'QUOTED', label: 'Devis envoyé', color: '#8b5cf6', emoji: '💰' },
    { key: 'APPROVED', label: 'Approuvé', color: '#3b82f6', emoji: '✅' },
    { key: 'PROCURING', label: 'En achat', color: '#f59e0b', emoji: '🛒' },
    { key: 'SHIPPED', label: 'Expédié', color: '#22c55e', emoji: '📦' },
    { key: 'DELIVERED', label: 'Livré', color: '#10b981', emoji: '🏁' },
    { key: 'CANCELLED', label: 'Annulé', color: '#ef4444', emoji: '❌' },
];

export default function ShopShipPage() {
    const [requests, setRequests] = useState<ShopShipRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');

    const fetchRequests = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiClient.get<{ data: ShopShipRequest[] }>('/api/shop-ship/requests?limit=100');
            setRequests((data as unknown as { data: ShopShipRequest[] })?.data || []);
        } catch (err) {
            console.error(err);
            // If the API doesn't exist yet, show empty state
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchRequests(); }, [fetchRequests]);

    const groupByStatus = () => {
        const groups: Record<string, ShopShipRequest[]> = {};
        PIPELINE_STAGES.forEach(s => { groups[s.key] = []; });
        requests.forEach(r => {
            if (groups[r.status]) groups[r.status].push(r);
        });
        return groups;
    };

    const grouped = groupByStatus();

    return (
        <div>
            <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>🛍️ Shop & Ship — Pipeline Agent</h1>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className={`action-btn ${viewMode === 'kanban' ? 'primary' : 'secondary'}`}
                        onClick={() => setViewMode('kanban')}
                        style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                    >
                        Kanban
                    </button>
                    <button
                        className={`action-btn ${viewMode === 'table' ? 'primary' : 'secondary'}`}
                        onClick={() => setViewMode('table')}
                        style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                    >
                        Tableau
                    </button>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                {PIPELINE_STAGES.filter(s => s.key !== 'CANCELLED').map(stage => (
                    <div key={stage.key} style={{
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '10px',
                        padding: '0.75rem 1rem',
                        textAlign: 'center',
                    }}>
                        <div style={{ fontSize: '1.25rem' }}>{stage.emoji}</div>
                        <div style={{ color: stage.color, fontWeight: 700, fontSize: '1.5rem' }}>
                            {grouped[stage.key]?.length || 0}
                        </div>
                        <div style={{ color: '#94a3b8', fontSize: '0.6875rem' }}>{stage.label}</div>
                    </div>
                ))}
            </div>

            {loading ? (
                <div className="loading">Chargement...</div>
            ) : viewMode === 'kanban' ? (
                /* Kanban View */
                <div style={{
                    display: 'flex',
                    gap: '0.75rem',
                    overflowX: 'auto',
                    paddingBottom: '1rem',
                    minHeight: '400px',
                }}>
                    {PIPELINE_STAGES.filter(s => s.key !== 'CANCELLED' && s.key !== 'DELIVERED').map(stage => (
                        <div key={stage.key} style={{
                            minWidth: '260px',
                            flex: '1 0 260px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '12px',
                            padding: '0.75rem',
                        }}>
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '0.75rem',
                                paddingBottom: '0.5rem',
                                borderBottom: `2px solid ${stage.color}40`,
                            }}>
                                <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: stage.color }}>
                                    {stage.emoji} {stage.label}
                                </span>
                                <span style={{
                                    background: `${stage.color}20`,
                                    color: stage.color,
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '6px',
                                    fontSize: '0.7rem',
                                    fontWeight: 600,
                                }}>
                                    {grouped[stage.key]?.length || 0}
                                </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {(grouped[stage.key] || []).map(req => (
                                    <div key={req.id} style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        borderRadius: '8px',
                                        padding: '0.625rem 0.75rem',
                                        cursor: 'pointer',
                                        transition: 'border-color 0.2s',
                                    }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                                            {req.itemDescription.length > 40
                                                ? req.itemDescription.substring(0, 40) + '...'
                                                : req.itemDescription}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                            👤 {req.customerName}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                            📍 {req.destinationCity} •{' '}
                                            <span style={{ color: stage.color, fontWeight: 600 }}>
                                                {req.estimatedPrice.toLocaleString()} {req.currency}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {(grouped[stage.key] || []).length === 0 && (
                                    <div style={{
                                        textAlign: 'center',
                                        color: '#475569',
                                        fontSize: '0.75rem',
                                        padding: '1.5rem 0',
                                        border: '1px dashed rgba(255,255,255,0.08)',
                                        borderRadius: '8px',
                                    }}>
                                        Aucune demande
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                /* Table View */
                <div className="data-table-container">
                    {requests.length === 0 ? (
                        <div className="empty-state">Aucune demande Shop & Ship</div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Client</th>
                                    <th>Article</th>
                                    <th>Prix estimé</th>
                                    <th>Destination</th>
                                    <th>Statut</th>
                                    <th>Créé le</th>
                                </tr>
                            </thead>
                            <tbody>
                                {requests.map(r => {
                                    const stage = PIPELINE_STAGES.find(s => s.key === r.status);
                                    return (
                                        <tr key={r.id}>
                                            <td>{r.customerName}</td>
                                            <td>{r.itemDescription}</td>
                                            <td>{r.estimatedPrice.toLocaleString()} {r.currency}</td>
                                            <td>{r.destinationCity}</td>
                                            <td>
                                                <span style={{
                                                    background: `${stage?.color || '#94a3b8'}20`,
                                                    color: stage?.color || '#94a3b8',
                                                    border: `1px solid ${stage?.color || '#94a3b8'}40`,
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                }}>
                                                    {stage?.emoji} {stage?.label || r.status}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                                {new Date(r.createdAt).toLocaleDateString('fr-FR')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}
