/**
 * Quotes List Page
 */
'use client';

import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:3001';

interface Quote {
    id: string;
    status: string;
    totalPriceXof: number;
    weightKg: number;
    volumeCm3: number;
    createdAt: string;
    validUntil: string;
    shipment: { trackingCode: string; customerId: string } | null;
    pricingRule: { id: string; version: number } | null;
}

const STATUSES = ['PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED'];

export default function QuotesPage() {
    const [quotes, setQuotes] = useState<Quote[]>([]);
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

        fetch(`${API_URL}/api/admin/quotes?${params}`)
            .then(res => res.json())
            .then(data => {
                setQuotes(data.data || []);
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

    return (
        <div>
            <div className="admin-header">
                <h1>Devis</h1>
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
                ) : quotes.length === 0 ? (
                    <div className="empty-state">Aucun devis trouvé</div>
                ) : (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Expédition</th>
                                    <th>Statut</th>
                                    <th>Montant</th>
                                    <th>Poids</th>
                                    <th>Volume</th>
                                    <th>Règle prix</th>
                                    <th>Valide jusqu&apos;au</th>
                                    <th>Créé le</th>
                                </tr>
                            </thead>
                            <tbody>
                                {quotes.map(quote => (
                                    <tr key={quote.id}>
                                        <td>
                                            <strong>{quote.shipment?.trackingCode || '-'}</strong>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${quote.status.toLowerCase()}`}>
                                                {quote.status}
                                            </span>
                                        </td>
                                        <td>{Number(quote.totalPriceXof).toLocaleString()} XOF</td>
                                        <td>{quote.weightKg} kg</td>
                                        <td>{Number(quote.volumeCm3).toLocaleString()} cm³</td>
                                        <td>
                                            {quote.pricingRule
                                                ? `v${quote.pricingRule.version}`
                                                : '-'
                                            }
                                        </td>
                                        <td>{new Date(quote.validUntil).toLocaleDateString('fr-FR')}</td>
                                        <td>{new Date(quote.createdAt).toLocaleDateString('fr-FR')}</td>
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
