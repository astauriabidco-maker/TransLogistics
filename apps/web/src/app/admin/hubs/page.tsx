/**
 * Hub Management Page
 *
 * Full CRUD: list with search/status filters, create/edit modal, status transitions.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';

interface Hub {
    id: string;
    code: string;
    name: string;
    status: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    region: string;
    country: string;
    postalCode?: string;
    latitude: number;
    longitude: number;
    timezone: string;
    openingTime: string;
    closingTime: string;
    maxDailyCapacity: number;
    createdAt: string;
    activatedAt?: string;
    closedAt?: string;
    _count: {
        users: number;
        drivers: number;
        routesAsOrigin: number;
        vehicles: number;
    };
}

interface HubFormData {
    code: string;
    name: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    region: string;
    country: string;
    postalCode: string;
    latitude: string;
    longitude: string;
    timezone: string;
    openingTime: string;
    closingTime: string;
    maxDailyCapacity: string;
}

const emptyForm: HubFormData = {
    code: '', name: '', addressLine1: '', addressLine2: '', city: '', region: '',
    country: 'CI', postalCode: '', latitude: '', longitude: '', timezone: 'Africa/Abidjan',
    openingTime: '08:00', closingTime: '18:00', maxDailyCapacity: '100',
};

const STATUS_COLORS: Record<string, string> = {
    DRAFT: '#94a3b8',
    ACTIVE: '#22c55e',
    SUSPENDED: '#f59e0b',
    CLOSED: '#ef4444',
};

const STATUS_TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['ACTIVE'],
    ACTIVE: ['SUSPENDED', 'CLOSED'],
    SUSPENDED: ['ACTIVE', 'CLOSED'],
    CLOSED: [],
};

export default function HubsPage() {
    const [hubs, setHubs] = useState<Hub[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, pages: 0 });
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Hub | null>(null);
    const [form, setForm] = useState<HubFormData>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const fetchHubs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.append('search', search);
            if (statusFilter) params.append('status', statusFilter);
            params.append('page', pagination.page.toString());
            params.append('limit', pagination.limit.toString());

            const res = await apiClient(`/api/admin/hubs?${params}`);
            const data = await res.json();
            setHubs(data.data || []);
            if (data.pagination) {
                setPagination(prev => ({ ...prev, ...data.pagination }));
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [search, statusFilter, pagination.page, pagination.limit]);

    useEffect(() => { fetchHubs(); }, [fetchHubs]);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setError('');
        setModalOpen(true);
    };

    const openEdit = (hub: Hub) => {
        setEditing(hub);
        setForm({
            code: hub.code,
            name: hub.name,
            addressLine1: hub.addressLine1,
            addressLine2: hub.addressLine2 || '',
            city: hub.city,
            region: hub.region,
            country: hub.country,
            postalCode: hub.postalCode || '',
            latitude: hub.latitude.toString(),
            longitude: hub.longitude.toString(),
            timezone: hub.timezone,
            openingTime: hub.openingTime,
            closingTime: hub.closingTime,
            maxDailyCapacity: hub.maxDailyCapacity.toString(),
        });
        setError('');
        setModalOpen(true);
    };

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            const body = {
                ...form,
                latitude: parseFloat(form.latitude),
                longitude: parseFloat(form.longitude),
                maxDailyCapacity: parseInt(form.maxDailyCapacity),
            };

            if (editing) {
                const res = await apiClient(`/api/admin/hubs/${editing.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error?.message || 'Erreur de mise à jour');
                }
            } else {
                const res = await apiClient('/api/admin/hubs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error?.message || 'Erreur de création');
                }
            }

            setModalOpen(false);
            fetchHubs();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Une erreur est survenue');
        } finally {
            setSaving(false);
        }
    };

    const handleStatusTransition = async (hub: Hub, newStatus: string) => {
        try {
            const res = await apiClient(`/api/admin/hubs/${hub.id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (res.ok) fetchHubs();
        } catch (err) {
            console.error(err);
        }
    };

    const updateField = (field: keyof HubFormData, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div>
            <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>🏢 Gestion des Hubs</h1>
                <button className="action-btn primary" onClick={openCreate} style={{ fontSize: '0.875rem', padding: '0.5rem 1.25rem' }}>
                    + Nouveau Hub
                </button>
            </div>

            {/* Filters */}
            <div className="filter-bar">
                <div className="filter-group" style={{ flex: 2 }}>
                    <label>Recherche</label>
                    <input
                        type="text"
                        placeholder="Nom, code ou ville..."
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}
                    />
                </div>
                <div className="filter-group">
                    <label>Statut</label>
                    <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPagination(p => ({ ...p, page: 1 })); }}>
                        <option value="">Tous</option>
                        <option value="DRAFT">Brouillon</option>
                        <option value="ACTIVE">Actif</option>
                        <option value="SUSPENDED">Suspendu</option>
                        <option value="CLOSED">Fermé</option>
                    </select>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {(['ACTIVE', 'DRAFT', 'SUSPENDED', 'CLOSED'] as const).map(s => {
                    const count = hubs.filter(h => h.status === s).length;
                    return (
                        <div key={s} style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '12px',
                            padding: '1rem 1.25rem',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <span style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>{s}</span>
                            <span style={{ color: STATUS_COLORS[s], fontWeight: 700, fontSize: '1.5rem' }}>{count}</span>
                        </div>
                    );
                })}
            </div>

            {/* Table */}
            <div className="data-table-container">
                {loading ? (
                    <div className="loading">Chargement...</div>
                ) : hubs.length === 0 ? (
                    <div className="empty-state">Aucun hub trouvé</div>
                ) : (
                    <>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Code</th>
                                    <th>Nom</th>
                                    <th>Ville</th>
                                    <th>Statut</th>
                                    <th>Capacité</th>
                                    <th>Horaires</th>
                                    <th>Chauffeurs</th>
                                    <th>Routes</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {hubs.map(hub => (
                                    <tr key={hub.id}>
                                        <td><strong>{hub.code}</strong></td>
                                        <td>{hub.name}</td>
                                        <td>{hub.city}, {hub.region}</td>
                                        <td>
                                            <span className={`status-badge`} style={{
                                                background: `${STATUS_COLORS[hub.status]}20`,
                                                color: STATUS_COLORS[hub.status],
                                                border: `1px solid ${STATUS_COLORS[hub.status]}40`,
                                                padding: '0.25rem 0.625rem',
                                                borderRadius: '6px',
                                                fontSize: '0.75rem',
                                                fontWeight: 600,
                                            }}>
                                                {hub.status}
                                            </span>
                                        </td>
                                        <td>{hub.maxDailyCapacity}/jour</td>
                                        <td>{hub.openingTime} – {hub.closingTime}</td>
                                        <td>{hub._count.drivers}</td>
                                        <td>{hub._count.routesAsOrigin}</td>
                                        <td style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
                                            <button className="action-btn secondary" onClick={() => openEdit(hub)} style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                                                ✏️
                                            </button>
                                            {(STATUS_TRANSITIONS[hub.status] || []).map(next => (
                                                <button
                                                    key={next}
                                                    className="action-btn primary"
                                                    onClick={() => handleStatusTransition(hub, next)}
                                                    style={{
                                                        fontSize: '0.7rem',
                                                        padding: '0.25rem 0.5rem',
                                                        background: `${STATUS_COLORS[next]}25`,
                                                        color: STATUS_COLORS[next],
                                                        border: `1px solid ${STATUS_COLORS[next]}40`,
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
                        <div className="pagination">
                            <button disabled={pagination.page <= 1} onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}>
                                Précédent
                            </button>
                            <span>Page {pagination.page} / {pagination.pages || 1}</span>
                            <button disabled={pagination.page >= pagination.pages} onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}>
                                Suivant
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Create/Edit Modal */}
            {modalOpen && (
                <div className="confirm-overlay" onClick={() => setModalOpen(false)}>
                    <div className="confirm-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', width: '90%' }}>
                        <h3>{editing ? `Modifier ${editing.code}` : 'Nouveau Hub'}</h3>

                        {error && (
                            <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', color: '#fca5a5', fontSize: '0.8125rem' }}>
                                {error}
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                            <div className="filter-group">
                                <label>Code *</label>
                                <input value={form.code} onChange={e => updateField('code', e.target.value)} disabled={!!editing} placeholder="ABJ-01" />
                            </div>
                            <div className="filter-group">
                                <label>Nom *</label>
                                <input value={form.name} onChange={e => updateField('name', e.target.value)} placeholder="Hub Abidjan Centre" />
                            </div>
                            <div className="filter-group" style={{ gridColumn: 'span 2' }}>
                                <label>Adresse *</label>
                                <input value={form.addressLine1} onChange={e => updateField('addressLine1', e.target.value)} placeholder="123 Boulevard de la République" />
                            </div>
                            <div className="filter-group">
                                <label>Ville *</label>
                                <input value={form.city} onChange={e => updateField('city', e.target.value)} placeholder="Abidjan" />
                            </div>
                            <div className="filter-group">
                                <label>Région *</label>
                                <input value={form.region} onChange={e => updateField('region', e.target.value)} placeholder="Lagunes" />
                            </div>
                            <div className="filter-group">
                                <label>Latitude *</label>
                                <input type="number" step="0.00000001" value={form.latitude} onChange={e => updateField('latitude', e.target.value)} placeholder="5.316667" />
                            </div>
                            <div className="filter-group">
                                <label>Longitude *</label>
                                <input type="number" step="0.00000001" value={form.longitude} onChange={e => updateField('longitude', e.target.value)} placeholder="-4.033333" />
                            </div>
                            <div className="filter-group">
                                <label>Ouverture</label>
                                <input type="time" value={form.openingTime} onChange={e => updateField('openingTime', e.target.value)} />
                            </div>
                            <div className="filter-group">
                                <label>Fermeture</label>
                                <input type="time" value={form.closingTime} onChange={e => updateField('closingTime', e.target.value)} />
                            </div>
                            <div className="filter-group">
                                <label>Capacité / jour</label>
                                <input type="number" value={form.maxDailyCapacity} onChange={e => updateField('maxDailyCapacity', e.target.value)} />
                            </div>
                            <div className="filter-group">
                                <label>Pays</label>
                                <input value={form.country} onChange={e => updateField('country', e.target.value)} />
                            </div>
                        </div>

                        <div className="confirm-actions" style={{ marginTop: '1.5rem' }}>
                            <button className="action-btn secondary" onClick={() => setModalOpen(false)}>
                                Annuler
                            </button>
                            <button className="action-btn primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Sauvegarde...' : editing ? 'Mettre à jour' : 'Créer le Hub'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
