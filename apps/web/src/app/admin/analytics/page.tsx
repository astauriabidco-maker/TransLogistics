/**
 * Internal Analytics Dashboard
 * 
 * Decision-oriented dashboard for CEO, Ops, Finance.
 * Answers: "Where do we make or lose money?"
 */
'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api-client';
import './analytics.css';

// ==================================================
// TYPES
// ==================================================

interface RouteSummary {
    routeId: string;
    code: string;
    origin: string;
    destination: string;
    totalRevenue: number;
    totalCost: number;
    totalMargin: number;
    marginPercent: string;
    shipmentCount: number;
    isComplete: boolean;
}

interface HubSummary {
    hubId: string;
    code: string;
    name: string;
    city: string;
    totalOriginated: number;
    totalReceived: number;
    throughput: number;
    avgScanQuality: string;
    drivers: number;
}

interface LeadSummary {
    source: string;
    shipments: number;
    quotes: number;
    payments: number;
    revenue: number;
    conversionRate: string;
    avgOrderValue: string;
}

interface VolumeScanImpact {
    totalQuotes: number;
    volumetricWins: number;
    volumetricWinRate: string;
    avgWeightDelta: string;
    totalRevenueUplift: string;
}

interface ExecutiveSummary {
    period: string;
    financials: {
        totalRevenue: string;
        totalCost: string;
        grossMargin: string;
        marginPercent: string;
        dataQuality: {
            totalSnapshots: number;
            incompleteMargins: number;
            completenessRate: string;
        };
    };
    operations: {
        totalShipments: number;
        volumeScanUplift: string;
        volumetricWins: number;
    };
    acquisition: {
        topSources: { source: string; revenue: number }[];
    };
}

interface FiltersState {
    startDate: string;
    endDate: string;
    routeId: string;
    hubId: string;
}

interface RouteOption {
    id: string;
    code: string;
    originHub: { code: string };
    destinationHub: { code: string };
}

interface HubOption {
    id: string;
    code: string;
    name: string;
}

// ==================================================
// COMPONENT
// ==================================================

export default function AnalyticsDashboard() {
    const [activeTab, setActiveTab] = useState<'overview' | 'margins' | 'hubs' | 'volume' | 'leads'>('overview');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filter state
    const [filters, setFilters] = useState<FiltersState>({
        startDate: '',
        endDate: '',
        routeId: '',
        hubId: '',
    });

    // Dropdown options
    const [routes, setRoutes] = useState<RouteOption[]>([]);
    const [hubs, setHubs] = useState<HubOption[]>([]);

    // Data
    const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
    const [routeMargins, setRouteMargins] = useState<RouteSummary[]>([]);
    const [hubPerformance, setHubPerformance] = useState<HubSummary[]>([]);
    const [volumeImpact, setVolumeImpact] = useState<VolumeScanImpact | null>(null);
    const [leadSources, setLeadSources] = useState<LeadSummary[]>([]);

    // Load dropdown options on mount
    useEffect(() => {
        async function loadOptions() {
            try {
                const [routesData, hubsData] = await Promise.all([
                    apiClient.get<RouteOption[]>('/api/analytics/routes'),
                    apiClient.get<HubOption[]>('/api/admin/hubs'),
                ]);
                setRoutes(routesData);
                setHubs(hubsData);
            } catch (e) {
                console.error('Failed to load filter options:', e);
            }
        }
        loadOptions();
    }, []);

    // Load data based on active tab
    useEffect(() => {
        async function loadData() {
            setLoading(true);
            setError(null);

            try {
                const params = new URLSearchParams();
                if (filters.startDate) params.set('startDate', filters.startDate);
                if (filters.endDate) params.set('endDate', filters.endDate);
                if (filters.routeId) params.set('routeId', filters.routeId);
                if (filters.hubId) params.set('hubId', filters.hubId);
                const qs = params.toString() ? `?${params.toString()}` : '';

                switch (activeTab) {
                    case 'overview': {
                        const data = await apiClient.get<ExecutiveSummary>('/api/analytics/summary');
                        setSummary(data);
                        break;
                    }
                    case 'margins': {
                        const data = await apiClient.get<{ summary: RouteSummary[] }>(`/api/analytics/route-margins${qs}`);
                        setRouteMargins(data.summary);
                        break;
                    }
                    case 'hubs': {
                        const data = await apiClient.get<{ summary: HubSummary[] }>(`/api/analytics/hub-performance${qs}`);
                        setHubPerformance(data.summary);
                        break;
                    }
                    case 'volume': {
                        const data = await apiClient.get<{ volumeScanImpact: VolumeScanImpact }>(`/api/analytics/volume-metrics${qs}`);
                        setVolumeImpact(data.volumeScanImpact);
                        break;
                    }
                    case 'leads': {
                        const data = await apiClient.get<{ summary: LeadSummary[] }>(`/api/analytics/lead-sources${qs}`);
                        setLeadSources(data.summary);
                        break;
                    }
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed to load data');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, [activeTab, filters]);

    const formatCurrency = (value: number | string) => {
        const num = typeof value === 'string' ? parseFloat(value) : value;
        return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'XOF',
            maximumFractionDigits: 0,
        }).format(num);
    };

    return (
        <div className="analytics-dashboard">
            <header className="analytics-header">
                <h1>📊 Analytics Dashboard</h1>
                <p className="analytics-subtitle">Décisions basées sur les données</p>
            </header>

            {/* Tab Navigation */}
            <nav className="analytics-tabs">
                {[
                    { key: 'overview', label: 'Vue d\'ensemble' },
                    { key: 'margins', label: 'Marges par route' },
                    { key: 'hubs', label: 'Performance hubs' },
                    { key: 'volume', label: 'Volume / Poids' },
                    { key: 'leads', label: 'Sources leads' },
                ].map(tab => (
                    <button
                        key={tab.key}
                        className={`analytics-tab ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.key as typeof activeTab)}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* Filters */}
            {activeTab !== 'overview' && (
                <div className="analytics-filters">
                    <div className="filter-group">
                        <label>Date début</label>
                        <input
                            type="date"
                            value={filters.startDate}
                            onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
                        />
                    </div>
                    <div className="filter-group">
                        <label>Date fin</label>
                        <input
                            type="date"
                            value={filters.endDate}
                            onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
                        />
                    </div>
                    {(activeTab === 'margins' || activeTab === 'volume') && (
                        <div className="filter-group">
                            <label>Route</label>
                            <select
                                value={filters.routeId}
                                onChange={(e) => setFilters(f => ({ ...f, routeId: e.target.value }))}
                            >
                                <option value="">Toutes les routes</option>
                                {routes.map(r => (
                                    <option key={r.id} value={r.id}>
                                        {r.code} ({r.originHub.code} → {r.destinationHub.code})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {activeTab === 'hubs' && (
                        <div className="filter-group">
                            <label>Hub</label>
                            <select
                                value={filters.hubId}
                                onChange={(e) => setFilters(f => ({ ...f, hubId: e.target.value }))}
                            >
                                <option value="">Tous les hubs</option>
                                {hubs.map(h => (
                                    <option key={h.id} value={h.id}>
                                        {h.code} - {h.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    <button
                        className="filter-reset"
                        onClick={() => setFilters({ startDate: '', endDate: '', routeId: '', hubId: '' })}
                    >
                        Réinitialiser
                    </button>
                </div>
            )}

            {/* Content */}
            <div className="analytics-content">
                {loading && <div className="analytics-loading">Chargement...</div>}
                {error && <div className="analytics-error">Erreur: {error}</div>}

                {!loading && !error && activeTab === 'overview' && summary && (
                    <OverviewView summary={summary} formatCurrency={formatCurrency} />
                )}

                {!loading && !error && activeTab === 'margins' && (
                    <MarginsView data={routeMargins} formatCurrency={formatCurrency} />
                )}

                {!loading && !error && activeTab === 'hubs' && (
                    <HubsView data={hubPerformance} />
                )}

                {!loading && !error && activeTab === 'volume' && volumeImpact && (
                    <VolumeView data={volumeImpact} formatCurrency={formatCurrency} />
                )}

                {!loading && !error && activeTab === 'leads' && (
                    <LeadsView data={leadSources} formatCurrency={formatCurrency} />
                )}
            </div>
        </div>
    );
}

// ==================================================
// SUB-COMPONENTS
// ==================================================

function OverviewView({ summary, formatCurrency }: { summary: ExecutiveSummary; formatCurrency: (v: number | string) => string }) {
    const marginClass = parseFloat(summary.financials.marginPercent) >= 20 ? 'positive' :
        parseFloat(summary.financials.marginPercent) >= 10 ? 'neutral' : 'negative';

    return (
        <div className="overview-grid">
            <div className="overview-card financials">
                <h3>💰 Performance Financière</h3>
                <p className="period">{summary.period}</p>

                <div className="stats-grid">
                    <div className="stat">
                        <span className="stat-label">Revenu Net</span>
                        <span className="stat-value">{formatCurrency(summary.financials.totalRevenue)}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Coûts Totaux</span>
                        <span className="stat-value">{formatCurrency(summary.financials.totalCost)}</span>
                    </div>
                    <div className="stat highlight">
                        <span className="stat-label">Marge Brute</span>
                        <span className={`stat-value ${marginClass}`}>
                            {formatCurrency(summary.financials.grossMargin)}
                            <small> ({summary.financials.marginPercent}%)</small>
                        </span>
                    </div>
                </div>

                <div className="data-quality">
                    <span className="dq-label">Qualité données:</span>
                    <span className="dq-value">{summary.financials.dataQuality.completenessRate}% complet</span>
                    {summary.financials.dataQuality.incompleteMargins > 0 && (
                        <span className="dq-warning">
                            ⚠️ {summary.financials.dataQuality.incompleteMargins} snapshots sans coûts
                        </span>
                    )}
                </div>
            </div>

            <div className="overview-card operations">
                <h3>📦 Opérations</h3>
                <div className="stats-grid">
                    <div className="stat">
                        <span className="stat-label">Expéditions</span>
                        <span className="stat-value">{summary.operations.totalShipments}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Gains VolumeScan</span>
                        <span className="stat-value positive">{formatCurrency(summary.operations.volumeScanUplift)}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Facturation volumétrique</span>
                        <span className="stat-value">{summary.operations.volumetricWins} cas</span>
                    </div>
                </div>
            </div>

            <div className="overview-card acquisition">
                <h3>📈 Top Sources</h3>
                <table className="mini-table">
                    <thead>
                        <tr>
                            <th>Source</th>
                            <th>Revenu</th>
                        </tr>
                    </thead>
                    <tbody>
                        {summary.acquisition.topSources.map((s, i) => (
                            <tr key={i}>
                                <td>{s.source}</td>
                                <td>{formatCurrency(s.revenue)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

function MarginsView({ data, formatCurrency }: { data: RouteSummary[]; formatCurrency: (v: number | string) => string }) {
    if (data.length === 0) {
        return <div className="analytics-empty">Aucune donnée de marge disponible</div>;
    }

    return (
        <div className="analytics-table-container">
            <table className="analytics-table">
                <thead>
                    <tr>
                        <th>Route</th>
                        <th>Trajet</th>
                        <th className="num">Expéditions</th>
                        <th className="num">Revenu</th>
                        <th className="num">Coûts</th>
                        <th className="num">Marge</th>
                        <th className="num">%</th>
                        <th>Statut</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map(r => {
                        const marginClass = parseFloat(r.marginPercent) >= 20 ? 'positive' :
                            parseFloat(r.marginPercent) >= 10 ? 'neutral' : 'negative';
                        return (
                            <tr key={r.routeId}>
                                <td><strong>{r.code}</strong></td>
                                <td>{r.origin} → {r.destination}</td>
                                <td className="num">{r.shipmentCount}</td>
                                <td className="num">{formatCurrency(r.totalRevenue)}</td>
                                <td className="num">{formatCurrency(r.totalCost)}</td>
                                <td className={`num ${marginClass}`}>{formatCurrency(r.totalMargin)}</td>
                                <td className={`num ${marginClass}`}>{r.marginPercent}%</td>
                                <td>
                                    {r.isComplete ? (
                                        <span className="status-complete">✓ Complet</span>
                                    ) : (
                                        <span className="status-incomplete">⚠️ Coûts manquants</span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

function HubsView({ data }: { data: HubSummary[] }) {
    if (data.length === 0) {
        return <div className="analytics-empty">Aucune donnée hub disponible</div>;
    }

    return (
        <div className="analytics-table-container">
            <table className="analytics-table">
                <thead>
                    <tr>
                        <th>Hub</th>
                        <th>Ville</th>
                        <th className="num">Départs</th>
                        <th className="num">Arrivées</th>
                        <th className="num">Total</th>
                        <th className="num">Scans</th>
                        <th className="num">Qualité Scan</th>
                        <th className="num">Chauffeurs</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map(h => (
                        <tr key={h.hubId}>
                            <td><strong>{h.code}</strong></td>
                            <td>{h.city}</td>
                            <td className="num">{h.totalOriginated}</td>
                            <td className="num">{h.totalReceived}</td>
                            <td className="num"><strong>{h.throughput}</strong></td>
                            <td className="num">{h.avgScanQuality}%</td>
                            <td className="num">{h.drivers}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function VolumeView({ data, formatCurrency }: { data: VolumeScanImpact; formatCurrency: (v: number | string) => string }) {
    return (
        <div className="volume-grid">
            <div className="volume-card">
                <h3>📏 Impact VolumeScan AI</h3>
                <p className="volume-description">
                    Revenus supplémentaires générés par la facturation au poids volumétrique
                </p>

                <div className="stats-grid">
                    <div className="stat highlight">
                        <span className="stat-label">Revenu Additionnel</span>
                        <span className="stat-value positive">{formatCurrency(data.totalRevenueUplift)}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Devis Traités</span>
                        <span className="stat-value">{data.totalQuotes}</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Facturation Volumétrique</span>
                        <span className="stat-value">{data.volumetricWins} cas ({data.volumetricWinRate}%)</span>
                    </div>
                    <div className="stat">
                        <span className="stat-label">Delta Poids Moyen</span>
                        <span className="stat-value">+{data.avgWeightDelta} kg</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function LeadsView({ data, formatCurrency }: { data: LeadSummary[]; formatCurrency: (v: number | string) => string }) {
    if (data.length === 0) {
        return <div className="analytics-empty">Aucune donnée source disponible</div>;
    }

    return (
        <div className="analytics-table-container">
            <table className="analytics-table">
                <thead>
                    <tr>
                        <th>Source</th>
                        <th className="num">Leads</th>
                        <th className="num">Devis</th>
                        <th className="num">Paiements</th>
                        <th className="num">Conversion</th>
                        <th className="num">Panier Moyen</th>
                        <th className="num">Revenu Total</th>
                    </tr>
                </thead>
                <tbody>
                    {data.map(s => (
                        <tr key={s.source}>
                            <td><strong>{s.source}</strong></td>
                            <td className="num">{s.shipments}</td>
                            <td className="num">{s.quotes}</td>
                            <td className="num">{s.payments}</td>
                            <td className="num">{s.conversionRate}%</td>
                            <td className="num">{formatCurrency(s.avgOrderValue)}</td>
                            <td className="num"><strong>{formatCurrency(s.revenue)}</strong></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
