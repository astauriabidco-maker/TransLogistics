/**
 * Payments List Page
 */
'use client';

import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:3001';

interface Payment {
    id: string;
    status: string;
    method: string;
    provider: string;
    amountXof: number;
    currencyCode: string;
    gatewayReference: string | null;
    createdAt: string;
    confirmedAt: string | null;
    shipment: { trackingCode: string } | null;
}

const STATUSES = ['PENDING', 'INITIATED', 'PROCESSING', 'CONFIRMED', 'FAILED', 'EXPIRED', 'REFUNDED'];

export default function PaymentsPage() {
    const [payments, setPayments] = useState<Payment[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: '',
        startDate: '',
        endDate: '',
    });
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });

    useEffect(() => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        params.append('page', pagination.page.toString());
        params.append('limit', pagination.limit.toString());

        fetch(`${API_URL}/api/admin/payments?${params}`)
            .then(res => res.json())
            .then(data => {
                setPayments(data.data || []);
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

    const getProviderColor = (provider: string) => {
        switch (provider) {
            case 'CINETPAY': return '#00a0dc';
            case 'STRIPE': return '#635bff';
            default: return '#6b7280';
        }
    };

    return (
        <div>
            <div className="admin-header">
                <h1>Paiements</h1>
            </div>

            {/* Filters */}
            <div className="filter-bar">
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
                ) : payments.length === 0 ? (
                    <div className="empty-state">Aucun paiement trouvé</div>
                ) : (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Expédition</th>
                                    <th>Statut</th>
                                    <th>Montant</th>
                                    <th>Méthode</th>
                                    <th>Provider</th>
                                    <th>Référence</th>
                                    <th>Créé le</th>
                                    <th>Confirmé le</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payments.map(payment => (
                                    <tr key={payment.id}>
                                        <td>
                                            <strong>{payment.shipment?.trackingCode || '-'}</strong>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${payment.status.toLowerCase()}`}>
                                                {payment.status}
                                            </span>
                                        </td>
                                        <td>
                                            <strong>{Number(payment.amountXof).toLocaleString()}</strong> {payment.currencyCode}
                                        </td>
                                        <td>{payment.method}</td>
                                        <td>
                                            <span style={{
                                                color: getProviderColor(payment.provider),
                                                fontWeight: 500
                                            }}>
                                                {payment.provider}
                                            </span>
                                        </td>
                                        <td>
                                            <code style={{ fontSize: '0.75rem' }}>
                                                {payment.gatewayReference || '-'}
                                            </code>
                                        </td>
                                        <td>{new Date(payment.createdAt).toLocaleDateString('fr-FR')}</td>
                                        <td>
                                            {payment.confirmedAt
                                                ? new Date(payment.confirmedAt).toLocaleDateString('fr-FR')
                                                : '-'
                                            }
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
        </div>
    );
}
