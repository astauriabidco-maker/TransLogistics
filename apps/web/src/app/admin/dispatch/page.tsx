/**
 * Dispatch Dashboard Page
 *
 * Route planning + driver assignment UI for dispatch managers.
 * 3 panels: pending shipments, route plans, create plan modal.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

interface PendingShipment {
    id: string;
    trackingNumber: string;
    status: string;
    senderName: string;
    recipientName: string;
    recipientCity: string;
    weightKg: number;
    originHubId: string;
    destinationHubId: string;
    createdAt: string;
}

interface RoutePlan {
    id: string;
    status: string;
    scheduledDate: string;
    totalTasks: number;
    route?: { id: string; name: string };
    hub?: { id: string; name: string; code: string };
    driver?: { id: string; firstName: string; lastName: string };
    _count: { tasks: number };
    createdAt: string;
}

interface Driver {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: string;
    hubId: string;
    _count: { dispatchTasks: number };
}

const STATUS_COLORS: Record<string, string> = {
    DRAFT: '#94a3b8',
    APPROVED: '#3b82f6',
    IN_PROGRESS: '#f59e0b',
    COMPLETED: '#22c55e',
    CANCELLED: '#ef4444',
};

const PLAN_TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['APPROVED', 'CANCELLED'],
    APPROVED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED'],
};

export default function DispatchPage() {
    const [pendingShipments, setPendingShipments] = useState<PendingShipment[]>([]);
    const [plans, setPlans] = useState<RoutePlan[]>([]);
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'pending' | 'plans'>('pending');
    const [statusFilter, setStatusFilter] = useState('');
    const [planPagination, setPlanPagination] = useState({ page: 1, limit: 20, total: 0 });

    const fetchPending = useCallback(async () => {
        try {
            const res = await apiClient('/api/admin/dispatch/pending-shipments?limit=50');
            const data = await res.json();
            setPendingShipments(data.data || []);
        } catch (err) { console.error(err); }
    }, []);

    const fetchPlans = useCallback(async () => {
        try {
            const params = new URLSearchParams();
            if (statusFilter) params.append('status', statusFilter);
            params.append('page', planPagination.page.toString());
            params.append('limit', planPagination.limit.toString());

            const res = await apiClient(`/api/admin/dispatch/plans?${params}`);
            const data = await res.json();
            setPlans(data.data || []);
            if (data.meta?.pagination) {
                setPlanPagination(prev => ({ ...prev, total: data.meta.pagination.total }));
            }
        } catch (err) { console.error(err); }
    }, [statusFilter, planPagination.page, planPagination.limit]);

    const fetchDrivers = useCallback(async () => {
        try {
            const res = await apiClient('/api/admin/dispatch/drivers');
            const data = await res.json();
            setDrivers(data.data || []);
        } catch (err) { console.error(err); }
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchPending(), fetchPlans(), fetchDrivers()]).finally(() => setLoading(false));
    }, [fetchPending, fetchPlans, fetchDrivers]);

    const handlePlanTransition = async (plan: RoutePlan, newStatus: string) => {
        try {
            const res = await apiClient(`/api/admin/dispatch/plans/${plan.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) fetchPlans();
        } catch (err) { console.error(err); }
    };

    return (
        <div>
            <div className="admin-header">
                <h1>🚛 Tableau de Bord Dispatch</h1>
            </div>

            {/* Stats Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px', padding: '1rem 1.25rem',
                }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.25rem' }}>EN ATTENTE</div>
                    <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '1.75rem' }}>{pendingShipments.length}</div>
                </div>
                <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px', padding: '1rem 1.25rem',
                }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.25rem' }}>PLANS ACTIFS</div>
                    <div style={{ color: '#3b82f6', fontWeight: 700, fontSize: '1.75rem' }}>
                        {plans.filter(p => ['DRAFT', 'APPROVED', 'IN_PROGRESS'].includes(p.status)).length}
                    </div>
                </div>
                <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px', padding: '1rem 1.25rem',
                }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.25rem' }}>CHAUFFEURS DISPO</div>
                    <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '1.75rem' }}>{drivers.length}</div>
                </div>
                <div style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '12px', padding: '1rem 1.25rem',
                }}>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.25rem' }}>COMPLÉTÉS</div>
                    <div style={{ color: '#22c55e', fontWeight: 700, fontSize: '1.75rem' }}>
                        {plans.filter(p => p.status === 'COMPLETED').length}
                    </div>
                </div>
            </div>

            {/* Tab Nav */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
                {([
                    { key: 'pending' as const, label: '📦 Colis en attente' },
                    { key: 'plans' as const, label: '🗺️ Plans de tournée' },
                ]).map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`action-btn ${tab === t.key ? 'primary' : 'secondary'}`}
                        style={{ fontSize: '0.8125rem', padding: '0.5rem 1rem' }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {loading ? (
                <div className="loading">Chargement...</div>
            ) : tab === 'pending' ? (
                /* Pending Shipments Table */
                <div className="data-table-container">
                    {pendingShipments.length === 0 ? (
                        <div className="empty-state">Aucun colis en attente d&apos;affectation</div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Tracking</th>
                                    <th>Expéditeur</th>
                                    <th>Destinataire</th>
                                    <th>Destination</th>
                                    <th>Poids</th>
                                    <th>Statut</th>
                                    <th>Créé le</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingShipments.map(s => (
                                    <tr key={s.id}>
                                        <td><strong>{s.trackingNumber}</strong></td>
                                        <td>{s.senderName}</td>
                                        <td>{s.recipientName}</td>
                                        <td>{s.recipientCity}</td>
                                        <td>{s.weightKg} kg</td>
                                        <td>
                                            <span style={{
                                                background: 'rgba(245,158,11,0.15)',
                                                color: '#f59e0b',
                                                border: '1px solid rgba(245,158,11,0.3)',
                                                padding: '0.2rem 0.5rem',
                                                borderRadius: '6px',
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                            }}>
                                                {s.status}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                                            {new Date(s.createdAt).toLocaleDateString('fr-FR')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            ) : (
                /* Route Plans */
                <div>
                    {/* Plan status filter */}
                    <div className="filter-bar" style={{ marginBottom: '1rem' }}>
                        <div className="filter-group">
                            <label>Statut</label>
                            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                <option value="">Tous</option>
                                <option value="DRAFT">Brouillon</option>
                                <option value="APPROVED">Approuvé</option>
                                <option value="IN_PROGRESS">En cours</option>
                                <option value="COMPLETED">Terminé</option>
                                <option value="CANCELLED">Annulé</option>
                            </select>
                        </div>
                    </div>

                    <div className="data-table-container">
                        {plans.length === 0 ? (
                            <div className="empty-state">Aucun plan de tournée</div>
                        ) : (
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Route</th>
                                        <th>Hub</th>
                                        <th>Chauffeur</th>
                                        <th>Date</th>
                                        <th>Tâches</th>
                                        <th>Statut</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {plans.map(plan => (
                                        <tr key={plan.id}>
                                            <td>{plan.route?.name || '—'}</td>
                                            <td>{plan.hub?.code || '—'}</td>
                                            <td>
                                                {plan.driver
                                                    ? `${plan.driver.firstName} ${plan.driver.lastName}`
                                                    : '—'}
                                            </td>
                                            <td style={{ fontSize: '0.8rem' }}>
                                                {new Date(plan.scheduledDate).toLocaleDateString('fr-FR')}
                                            </td>
                                            <td>{plan.totalTasks}</td>
                                            <td>
                                                <span style={{
                                                    background: `${STATUS_COLORS[plan.status] || '#94a3b8'}20`,
                                                    color: STATUS_COLORS[plan.status] || '#94a3b8',
                                                    border: `1px solid ${STATUS_COLORS[plan.status] || '#94a3b8'}40`,
                                                    padding: '0.2rem 0.5rem',
                                                    borderRadius: '6px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                }}>
                                                    {plan.status}
                                                </span>
                                            </td>
                                            <td style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                                                {(PLAN_TRANSITIONS[plan.status] || []).map(next => (
                                                    <button
                                                        key={next}
                                                        className="action-btn primary"
                                                        onClick={() => handlePlanTransition(plan, next)}
                                                        style={{
                                                            fontSize: '0.65rem',
                                                            padding: '0.2rem 0.4rem',
                                                            background: `${STATUS_COLORS[next] || '#3b82f6'}25`,
                                                            color: STATUS_COLORS[next] || '#3b82f6',
                                                            border: `1px solid ${STATUS_COLORS[next] || '#3b82f6'}40`,
                                                        }}
                                                    >
                                                        → {next}
                                                    </button>
                                                ))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {/* Drivers sidebar */}
            <div style={{ marginTop: '2rem' }}>
                <h2 style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>🚗 Chauffeurs disponibles ({drivers.length})</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                    {drivers.map(d => (
                        <div key={d.id} style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '10px',
                            padding: '0.875rem 1rem',
                        }}>
                            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>
                                {d.firstName} {d.lastName}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                📞 {d.phone} • {d._count.dispatchTasks} tâches actives
                            </div>
                        </div>
                    ))}
                    {drivers.length === 0 && (
                        <div style={{ color: '#64748b', fontSize: '0.875rem' }}>Aucun chauffeur disponible</div>
                    )}
                </div>
            </div>
        </div>
    );
}
