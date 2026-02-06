/**
 * Scans List Page
 * 
 * Manage scan results with validate/override actions.
 */
'use client';

import { useState, useEffect } from 'react';

const API_URL = 'http://localhost:3001';

interface Scan {
    id: string;
    status: string;
    source: string;
    detectedLengthCm: number;
    detectedWidthCm: number;
    detectedHeightCm: number;
    confidenceScore: number;
    overrideReason: string | null;
    createdAt: string;
    shipment: {
        trackingCode: string;
        route: {
            originHub: { code: string };
            destinationHub: { code: string };
        };
    } | null;
}

const STATUSES = ['PENDING', 'VALIDATED', 'REJECTED', 'OVERRIDDEN'];

export default function ScansPage() {
    const [scans, setScans] = useState<Scan[]>([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        status: '',
        startDate: '',
        endDate: '',
    });
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0 });
    const [overrideDialog, setOverrideDialog] = useState<Scan | null>(null);
    const [overrideData, setOverrideData] = useState({
        lengthCm: 0,
        widthCm: 0,
        heightCm: 0,
        reason: '',
    });

    const fetchScans = () => {
        setLoading(true);
        const params = new URLSearchParams();
        if (filters.status) params.append('status', filters.status);
        if (filters.startDate) params.append('startDate', filters.startDate);
        if (filters.endDate) params.append('endDate', filters.endDate);
        params.append('page', pagination.page.toString());
        params.append('limit', pagination.limit.toString());

        fetch(`${API_URL}/api/admin/scans?${params}`)
            .then(res => res.json())
            .then(data => {
                setScans(data.data || []);
                if (data.meta?.pagination) {
                    setPagination(prev => ({ ...prev, total: data.meta.pagination.total }));
                }
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchScans();
    }, [filters, pagination.page]);

    const handleValidate = async (scanId: string) => {
        if (!confirm('Valider ce scan ?')) return;

        try {
            const res = await fetch(`${API_URL}/api/admin/scans/${scanId}/validate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-role': 'OPERATOR'
                },
            });
            if (res.ok) fetchScans();
        } catch (error) {
            console.error(error);
        }
    };

    const handleOverride = async () => {
        if (!overrideDialog || !overrideData.reason) {
            alert('La raison est obligatoire');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/admin/scans/${overrideDialog.id}/override`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-role': 'ADMIN'
                },
                body: JSON.stringify(overrideData),
            });

            if (res.ok) {
                setOverrideDialog(null);
                setOverrideData({ lengthCm: 0, widthCm: 0, heightCm: 0, reason: '' });
                fetchScans();
            }
        } catch (error) {
            console.error(error);
        }
    };

    const openOverrideDialog = (scan: Scan) => {
        setOverrideDialog(scan);
        setOverrideData({
            lengthCm: scan.detectedLengthCm,
            widthCm: scan.detectedWidthCm,
            heightCm: scan.detectedHeightCm,
            reason: '',
        });
    };

    return (
        <div>
            <div className="admin-header">
                <h1>Scans IA</h1>
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
                ) : scans.length === 0 ? (
                    <div className="empty-state">Aucun scan trouvé</div>
                ) : (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Expédition</th>
                                    <th>Route</th>
                                    <th>Statut</th>
                                    <th>Source</th>
                                    <th>Dimensions</th>
                                    <th>Confiance</th>
                                    <th>Date</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {scans.map(scan => (
                                    <tr key={scan.id}>
                                        <td>
                                            <strong>{scan.shipment?.trackingCode || '-'}</strong>
                                        </td>
                                        <td>
                                            {scan.shipment?.route
                                                ? `${scan.shipment.route.originHub.code} → ${scan.shipment.route.destinationHub.code}`
                                                : '-'
                                            }
                                        </td>
                                        <td>
                                            <span className={`status-badge ${scan.status.toLowerCase()}`}>
                                                {scan.status}
                                            </span>
                                            {scan.overrideReason && (
                                                <small title={scan.overrideReason}> ⓘ</small>
                                            )}
                                        </td>
                                        <td>{scan.source}</td>
                                        <td>
                                            {scan.detectedLengthCm} × {scan.detectedWidthCm} × {scan.detectedHeightCm} cm
                                        </td>
                                        <td>
                                            {(scan.confidenceScore * 100).toFixed(0)}%
                                        </td>
                                        <td>{new Date(scan.createdAt).toLocaleDateString('fr-FR')}</td>
                                        <td style={{ display: 'flex', gap: '0.5rem' }}>
                                            {scan.status === 'PENDING' && (
                                                <>
                                                    <button
                                                        className="action-btn primary"
                                                        onClick={() => handleValidate(scan.id)}
                                                    >
                                                        Valider
                                                    </button>
                                                    <button
                                                        className="action-btn danger"
                                                        onClick={() => openOverrideDialog(scan)}
                                                    >
                                                        Override
                                                    </button>
                                                </>
                                            )}
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

            {/* Override Dialog */}
            {overrideDialog && (
                <div className="confirm-overlay" onClick={() => setOverrideDialog(null)}>
                    <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
                        <h3>Override manuel (Admin)</h3>
                        <p>Corriger les dimensions détectées pour: {overrideDialog.shipment?.trackingCode}</p>

                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                            <div className="filter-group">
                                <label>Longueur (cm)</label>
                                <input
                                    type="number"
                                    value={overrideData.lengthCm}
                                    onChange={e => setOverrideData(prev => ({ ...prev, lengthCm: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="filter-group">
                                <label>Largeur (cm)</label>
                                <input
                                    type="number"
                                    value={overrideData.widthCm}
                                    onChange={e => setOverrideData(prev => ({ ...prev, widthCm: Number(e.target.value) }))}
                                />
                            </div>
                            <div className="filter-group">
                                <label>Hauteur (cm)</label>
                                <input
                                    type="number"
                                    value={overrideData.heightCm}
                                    onChange={e => setOverrideData(prev => ({ ...prev, heightCm: Number(e.target.value) }))}
                                />
                            </div>
                        </div>

                        <textarea
                            placeholder="Raison du changement (OBLIGATOIRE)"
                            value={overrideData.reason}
                            onChange={e => setOverrideData(prev => ({ ...prev, reason: e.target.value }))}
                            required
                        />
                        <div className="confirm-actions">
                            <button className="action-btn secondary" onClick={() => setOverrideDialog(null)}>
                                Annuler
                            </button>
                            <button className="action-btn danger" onClick={handleOverride}>
                                Confirmer Override
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
