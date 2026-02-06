/**
 * Shipments List Page
 */
'use client';

import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:3001';

interface Shipment {
    id: string;
    trackingCode: string;
    status: string;
    createdAt: string;
    customer: { firstName: string; lastName: string; phone: string };
    route: {
        originHub: { code: string; name: string };
        destinationHub: { code: string; name: string };
    };
    quote: { totalPriceXof: number; status: string } | null;
    payment: { status: string; amountXof: number } | null;
}

interface Hub {
    id: string;
    code: string;
    name: string;
    city: string;
}

const STATUSES = [
    'DRAFT', 'PENDING_QUOTE', 'QUOTED', 'CONFIRMED',
    'PICKED_UP', 'IN_TRANSIT', 'AT_DESTINATION', 'DELIVERED', 'CANCELLED'
];

export default function ShipmentsPage() {
    const [shipments, setShipments] = useState<Shipment[]>([]);
    const [hubs, setHubs] = useState<Hub[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        hubId: '',
        status: '',
        startDate: '',
        endDate: '',
    });
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
    const [updateDialog, setUpdateDialog] = useState<{ shipmentId: string; currentStatus: string } | null>(null);
    const [newStatus, setNewStatus] = useState('');
    const [statusReason, setStatusReason] = useState('');

    // Fetch hubs for filter
    useEffect(() => {
        fetch(`${API_URL}/api/admin/hubs`)
            .then(res => res.json())
            .then(data => setHubs(data.data || []))
            .catch(console.error);
    }, []);

    // Fetch shipments
    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters.hubId) params.append('hubId', filters.hubId);
        if (filters.status) params.append('status', filters.status);
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        params.append('page', pagination.page.toString());
        params.append('limit', pagination.limit.toString());

        fetch(`${API_URL}/api/admin/shipments?${params}`)
            .then(res => res.json())
            .then(data => {
                setShipments(data.data || []);
                if (data.meta?.pagination) {
                    setPagination(prev => ({ ...prev, total: data.meta.pagination.total }));
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, [filters, pagination.page]);

    const handleStatusUpdate = async () => {
        if (!updateDialog || !newStatus) return;

        try {
            const res = await fetch(`${API_URL}/api/admin/shipments/${updateDialog.shipmentId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-role': 'OPERATOR'
                },
                body: JSON.stringify({ status: newStatus, reason: statusReason }),
            });

            if (res.ok) {
                // Refresh list
                setFilters(prev => ({ ...prev }));
                setUpdateDialog(null);
                setNewStatus('');
                setStatusReason('');
            }
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div>
            <div className="admin-header">
                <h1>Expéditions</h1>
            </div>

            {/* Filters */}
            <div className="filter-bar">
                <div className="filter-group">
                    <label>Hub</label>
                    <select
                        value={filters.hubId}
                        onChange={e => setFilters(prev => ({ ...prev, hubId: e.target.value }))}
                    >
                        <option value="">Tous les hubs</option>
                        {hubs.map(hub => (
                            <option key={hub.id} value={hub.id}>{hub.code} - {hub.name}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label>Statut</label>
                    <select
                        value={filters.status}
                        onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                    >
                        <option value="">Tous</option>
                        {STATUSES.map(s => (
                            <option key={s} value={s}>{s}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label>Date début</label>
                    <input
                        type="date"
                        value={filters.startDate}
                        onChange={e => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                    />
                </div>
                <div className="filter-group">
                    <label>Date fin</label>
                    <input
                        type="date"
                        value={filters.endDate}
                        onChange={e => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="data-table-container">
                {loading ? (
                    <div className="loading">Chargement...</div>
                ) : shipments.length === 0 ? (
                    <div className="empty-state">Aucune expédition trouvée</div>
                ) : (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Tracking</th>
                                    <th>Client</th>
                                    <th>Route</th>
                                    <th>Statut</th>
                                    <th>Montant</th>
                                    <th>Paiement</th>
                                    <th>Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shipments.map(shipment => (
                                    <tr key={shipment.id}>
                                        <td><strong>{shipment.trackingCode}</strong></td>
                                        <td>
                                            {shipment.customer.firstName} {shipment.customer.lastName}
                                            <br />
                                            <small>{shipment.customer.phone}</small>
                                        </td>
                                        <td>
                                            {shipment.route.originHub.code} → {shipment.route.destinationHub.code}
                                        </td>
                                        <td>
                                            <span className={`status-badge ${shipment.status.toLowerCase()}`}>
                                                {shipment.status}
                                            </span>
                                        </td>
                                        <td>
                                            {shipment.quote
                                                ? `${shipment.quote.totalPriceXof.toLocaleString()} XOF`
                                                : '-'
                                            }
                                        </td>
                                        <td>
                                            {shipment.payment ? (
                                                <span className={`status-badge ${shipment.payment.status.toLowerCase()}`}>
                                                    {shipment.payment.status}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td>{new Date(shipment.createdAt).toLocaleDateString('fr-FR')}</td>
                                        <td>
                                            <button
                                                className="action-btn primary"
                                                onClick={() => {
                                                    setUpdateDialog({ shipmentId: shipment.id, currentStatus: shipment.status });
                                                    setNewStatus(shipment.status);
                                                }}
                                            >
                                                Modifier statut
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <div className="pagination">
                            <button
                                disabled={pagination.page <= 1}
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                            >
                                Précédent
                            </button>
                            <span>Page {pagination.page} / {Math.ceil(pagination.total / pagination.limit) || 1}</span>
                            <button
                                disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
                                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                            >
                                Suivant
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Status Update Dialog */}
            {updateDialog && (
                <div className="confirm-overlay" onClick={() => setUpdateDialog(null)}>
                    <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
                        <h3>Modifier le statut</h3>
                        <p>Statut actuel: {updateDialog.currentStatus}</p>
                        <div className="filter-group">
                            <label>Nouveau statut</label>
                            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}>
                                {STATUSES.map(s => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <textarea
                            placeholder="Raison du changement (optionnel)"
                            value={statusReason}
                            onChange={e => setStatusReason(e.target.value)}
                        />
                        <div className="confirm-actions">
                            <button className="action-btn secondary" onClick={() => setUpdateDialog(null)}>
                                Annuler
                            </button>
                            <button className="action-btn primary" onClick={handleStatusUpdate}>
                                Confirmer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
