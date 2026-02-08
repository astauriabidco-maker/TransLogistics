/**
 * Autonomy Transparency Dashboard
 *
 * Admin-only page for monitoring autonomy levels, reviewing autonomous actions
 * with confidence/trust scores, and controlling autonomy (downgrade, force-manual, acknowledge).
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import './autonomy.css';

// ==================================================
// TYPES
// ==================================================

type AutonomyLevel = 'AUTONOMOUS' | 'SUPERVISED' | 'ASSISTED' | 'MANUAL';

interface AutonomyEntry {
    moduleId: string;
    moduleName: string;
    contract: string;
    zone: string;
    scopeType: 'hub' | 'route' | 'global';
    scopeId: string;
    scopeLabel: string;
    level: AutonomyLevel;
    enabled: boolean;
    globalEnabled: boolean;
    updatedAt: string | null;
}

interface PromotionStatus {
    moduleId: string;
    moduleName: string;
    currentLevel: AutonomyLevel;
    targetLevel: AutonomyLevel | null;
    progress: {
        decisions: { current: number; required: number; pct: number };
        accuracy: { current: number; required: number; pct: number };
        errorRate: { current: number; max: number; pct: number };
    } | null;
    eligible: boolean;
}

interface ModuleDef {
    id: string;
    name: string;
    contract: string;
    zone: string;
    scopeType: string;
    globalEnabled: boolean;
}

interface OverviewData {
    entries: AutonomyEntry[];
    summary: Record<AutonomyLevel, number>;
    moduleDefs: ModuleDef[];
    promotionStatuses?: PromotionStatus[];
}

interface EnrichedAction {
    id: string;
    timestamp: string;
    moduleId: string;
    contract: string;
    action: string;
    entityType: string;
    entityId: string;
    confidenceScore: number;
    trustScore: number;
    allowedBecause: string;
    details: Record<string, unknown> | null;
}

type TabKey = 'status' | 'actions' | 'controls';

// ==================================================
// COMPONENT
// ==================================================

export default function AutonomyDashboard() {
    const [activeTab, setActiveTab] = useState<TabKey>('status');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [overview, setOverview] = useState<OverviewData | null>(null);
    const [actions, setActions] = useState<EnrichedAction[]>({ length: 0 } as unknown as EnrichedAction[]);
    const [actionsPagination, setActionsPagination] = useState({ page: 1, limit: 30, total: 0 });
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Filters
    const [statusModuleFilter, setStatusModuleFilter] = useState<string>('');
    const [actionsModuleFilter, setActionsModuleFilter] = useState<string>('');

    // Initialize actions as empty array
    useEffect(() => {
        setActions([]);
    }, []);

    const loadOverview = useCallback(async () => {
        try {
            const data = await apiClient.get<OverviewData>('/api/admin/autonomy/overview');
            setOverview(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load autonomy overview');
        }
    }, []);

    const loadActions = useCallback(async (page = 1) => {
        try {
            const params = new URLSearchParams({ page: String(page), limit: '30' });
            if (actionsModuleFilter) params.set('module', actionsModuleFilter);

            const res = await apiClient.get<EnrichedAction[]>(`/api/admin/autonomy/actions?${params.toString()}`);

            // The API wraps pagination in meta
            setActions(Array.isArray(res) ? res : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load actions');
        }
    }, [actionsModuleFilter]);

    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            if (activeTab === 'status' || activeTab === 'controls') {
                await loadOverview();
            } else if (activeTab === 'actions') {
                await loadActions();
            }
            setLoading(false);
        }
        load();
    }, [activeTab, loadOverview, loadActions]);

    const showFeedback = (type: 'success' | 'error', message: string) => {
        setFeedback({ type, message });
        setTimeout(() => setFeedback(null), 4000);
    };

    // Filter entries
    const filteredEntries = overview?.entries.filter(e =>
        !statusModuleFilter || e.moduleId === statusModuleFilter
    ) || [];

    return (
        <div className="autonomy-dashboard">
            <header className="autonomy-header">
                <h1>🛡️ Autonomy Transparency Dashboard</h1>
                <p className="autonomy-subtitle">Visibilité complète sur les niveaux d&apos;autonomie, les actions autonomes et les contrôles</p>
            </header>

            {/* Summary Bar */}
            {overview && (
                <div className="autonomy-summary-bar">
                    {(['AUTONOMOUS', 'SUPERVISED', 'ASSISTED', 'MANUAL'] as AutonomyLevel[]).map(level => (
                        <div key={level} className={`autonomy-summary-pill level-${level.toLowerCase()}`}>
                            <span className="pill-dot" />
                            <span className="pill-count">{overview.summary[level]}</span>
                            <span className="pill-label">{level}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Tab Navigation */}
            <nav className="autonomy-tabs">
                {([
                    { key: 'status' as TabKey, label: 'Statut Autonomie', icon: '📊' },
                    { key: 'actions' as TabKey, label: 'Actions Autonomes', icon: '⚡' },
                    { key: 'controls' as TabKey, label: 'Contrôles', icon: '🎛️' },
                ]).map(tab => (
                    <button
                        key={tab.key}
                        className={`autonomy-tab ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                    >
                        {tab.icon} {tab.label}
                    </button>
                ))}
            </nav>

            {/* Feedback Banner */}
            {feedback && (
                <div className={`autonomy-feedback feedback-${feedback.type}`}>
                    {feedback.type === 'success' ? '✅' : '❌'} {feedback.message}
                </div>
            )}

            {/* Content */}
            {loading && <div className="autonomy-loading">Chargement des données d&apos;autonomie...</div>}
            {error && <div className="autonomy-error">Erreur: {error}</div>}

            {!loading && !error && activeTab === 'status' && overview && (
                <StatusTab
                    entries={filteredEntries}
                    moduleDefs={overview.moduleDefs}
                    moduleFilter={statusModuleFilter}
                    onModuleFilterChange={setStatusModuleFilter}
                    promotionStatuses={overview.promotionStatuses}
                />
            )}

            {!loading && !error && activeTab === 'actions' && (
                <ActionsTab
                    actions={actions}
                    pagination={actionsPagination}
                    moduleFilter={actionsModuleFilter}
                    onModuleFilterChange={(v) => { setActionsModuleFilter(v); }}
                    onAcknowledge={async (actionId) => {
                        try {
                            await apiClient.post('/api/admin/autonomy/acknowledge', { actionId });
                            showFeedback('success', `Action ${actionId.slice(0, 8)}… acquittée`);
                        } catch (e) {
                            showFeedback('error', e instanceof Error ? e.message : 'Échec');
                        }
                    }}
                />
            )}

            {!loading && !error && activeTab === 'controls' && overview && (
                <ControlsTab
                    overview={overview}
                    onDowngrade={async (moduleId, scopeId, reason) => {
                        try {
                            await apiClient.post('/api/admin/autonomy/downgrade', { moduleId, scopeId, reason });
                            showFeedback('success', `Module ${moduleId} rétrogradé pour ${scopeId.slice(0, 8)}…`);
                            await loadOverview();
                        } catch (e) {
                            showFeedback('error', e instanceof Error ? e.message : 'Échec de la rétrogradation');
                        }
                    }}
                    onForceManual={async (moduleId, reason) => {
                        try {
                            await apiClient.post('/api/admin/autonomy/force-manual', { moduleId, reason });
                            showFeedback('success', `Module ${moduleId} forcé en mode MANUEL`);
                            await loadOverview();
                        } catch (e) {
                            showFeedback('error', e instanceof Error ? e.message : 'Échec du passage en mode manuel');
                        }
                    }}
                />
            )}
        </div>
    );
}

// ==================================================
// TAB: STATUS
// ==================================================

function StatusTab({
    entries,
    moduleDefs,
    moduleFilter,
    onModuleFilterChange,
    promotionStatuses,
}: {
    entries: AutonomyEntry[];
    moduleDefs: ModuleDef[];
    moduleFilter: string;
    onModuleFilterChange: (v: string) => void;
    promotionStatuses?: PromotionStatus[];
}) {
    if (entries.length === 0) {
        return <div className="autonomy-empty">Aucune configuration d&apos;autonomie trouvée</div>;
    }
    return (
        <div>
            <div className="autonomy-filter-bar">
                <select value={moduleFilter} onChange={(e) => onModuleFilterChange(e.target.value)}>
                    <option value="">Tous les modules</option>
                    {moduleDefs.map(m => (
                        <option key={m.id} value={m.id}>{m.contract} — {m.name}</option>
                    ))}
                </select>
            </div>

            {/* Promotion Progress Section */}
            {promotionStatuses && promotionStatuses.length > 0 && (
                <div className="promotion-section">
                    <h3 className="promotion-title">🚀 Progression vers la Promotion</h3>
                    <div className="promotion-grid">
                        {promotionStatuses.map(ps => (
                            <div key={ps.moduleId} className={`promotion-card ${ps.eligible ? 'promotion-eligible' : ''}`}>
                                <div className="promotion-card-header">
                                    <span className="promotion-module-name">{ps.moduleName}</span>
                                    <span className={`level-badge level-badge-${ps.currentLevel.toLowerCase()}`}>
                                        {ps.currentLevel}
                                    </span>
                                    {ps.targetLevel && (
                                        <>
                                            <span className="promotion-arrow">→</span>
                                            <span className={`level-badge level-badge-${ps.targetLevel.toLowerCase()}`}>
                                                {ps.targetLevel}
                                            </span>
                                        </>
                                    )}
                                </div>
                                {ps.progress ? (
                                    <div className="promotion-metrics">
                                        <div className="promotion-metric">
                                            <div className="metric-header">
                                                <span className="metric-label">Décisions</span>
                                                <span className="metric-value">
                                                    {ps.progress.decisions.current}/{ps.progress.decisions.required}
                                                </span>
                                            </div>
                                            <div className="progress-track">
                                                <div
                                                    className="progress-fill progress-decisions"
                                                    style={{ width: `${Math.min(ps.progress.decisions.pct, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="promotion-metric">
                                            <div className="metric-header">
                                                <span className="metric-label">Précision</span>
                                                <span className="metric-value">
                                                    {(ps.progress.accuracy.current * 100).toFixed(1)}% / {(ps.progress.accuracy.required * 100).toFixed(1)}%
                                                </span>
                                            </div>
                                            <div className="progress-track">
                                                <div
                                                    className={`progress-fill ${ps.progress.accuracy.pct >= 100 ? 'progress-success' : 'progress-accuracy'}`}
                                                    style={{ width: `${Math.min(ps.progress.accuracy.pct, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                        <div className="promotion-metric">
                                            <div className="metric-header">
                                                <span className="metric-label">Taux d’erreur</span>
                                                <span className="metric-value">
                                                    {(ps.progress.errorRate.current * 100).toFixed(2)}% (max {(ps.progress.errorRate.max * 100).toFixed(2)}%)
                                                </span>
                                            </div>
                                            <div className="progress-track">
                                                <div
                                                    className={`progress-fill ${ps.progress.errorRate.pct <= 100 ? 'progress-success' : 'progress-error'}`}
                                                    style={{ width: `${Math.min(ps.progress.errorRate.pct, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                        {ps.eligible && (
                                            <div className="promotion-eligible-badge">
                                                ✅ Eligible pour promotion automatique
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="promotion-no-data">
                                        Niveau maximum atteint ou aucune règle définie
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="autonomy-status-grid">
                {entries.map((entry) => (
                    <div key={`${entry.moduleId}-${entry.scopeId}`} className={`autonomy-status-card card-${entry.level.toLowerCase()}`}>
                        <div className="autonomy-card-top">
                            <h4 className="autonomy-card-module">{entry.moduleName}</h4>
                            <span className={`autonomy-card-contract zone-${entry.zone.toLowerCase()}`}>
                                {entry.contract}
                            </span>
                        </div>

                        <p className="autonomy-card-scope">
                            <span className="scope-type">{entry.scopeType}:</span>
                            {entry.scopeLabel}
                        </p>

                        <div className="autonomy-level-indicator">
                            <div className="level-bar-track">
                                <div className={`level-bar-fill fill-${entry.level.toLowerCase()}`} />
                            </div>
                            <span className={`level-label label-${entry.level.toLowerCase()}`}>
                                {entry.level}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ==================================================
// TAB: ACTIONS
// ==================================================

function ActionsTab({
    actions,
    pagination,
    moduleFilter,
    onModuleFilterChange,
    onAcknowledge,
}: {
    actions: EnrichedAction[];
    pagination: { page: number; limit: number; total: number };
    moduleFilter: string;
    onModuleFilterChange: (v: string) => void;
    onAcknowledge: (actionId: string) => Promise<void>;
}) {
    const [acknowledging, setAcknowledging] = useState<string | null>(null);

    const getConfidenceClass = (score: number) => {
        if (score >= 0.85) return 'conf-high';
        if (score >= 0.65) return 'conf-medium';
        return 'conf-low';
    };

    const getTrustClass = (score: number) => {
        if (score >= 0.85) return 'trust-high';
        if (score >= 0.70) return 'trust-moderate';
        if (score >= 0.55) return 'trust-low';
        return 'trust-minimal';
    };

    const getContractClass = (contract: string) => {
        if (contract === 'S1') return 'contract-s1';
        if (contract === 'G3') return 'contract-g3';
        if (contract === 'G4/R1') return 'contract-g4r1';
        if (contract === 'R2') return 'contract-r2';
        return 'contract-unknown';
    };

    const handleAcknowledge = async (actionId: string) => {
        setAcknowledging(actionId);
        await onAcknowledge(actionId);
        setAcknowledging(null);
    };

    if (!actions || actions.length === 0) {
        return (
            <div>
                <div className="autonomy-filter-bar">
                    <select value={moduleFilter} onChange={(e) => onModuleFilterChange(e.target.value)}>
                        <option value="">Tous les modules</option>
                        <option value="ai-auto-validation">S1 — Scan Auto-Validation</option>
                        <option value="pricing-auto-application">G4/R1 — Pricing Auto-Application</option>
                        <option value="dispatch-auto-execution">G3 — Dispatch Auto-Execution</option>
                        <option value="fraud-auto-response">R2 — Fraud Auto-Response</option>
                    </select>
                </div>
                <div className="autonomy-empty">Aucune action autonome enregistrée</div>
            </div>
        );
    }

    return (
        <div>
            <div className="autonomy-filter-bar">
                <select value={moduleFilter} onChange={(e) => onModuleFilterChange(e.target.value)}>
                    <option value="">Tous les modules</option>
                    <option value="ai-auto-validation">S1 — Scan Auto-Validation</option>
                    <option value="pricing-auto-application">G4/R1 — Pricing Auto-Application</option>
                    <option value="dispatch-auto-execution">G3 — Dispatch Auto-Execution</option>
                    <option value="fraud-auto-response">R2 — Fraud Auto-Response</option>
                </select>
            </div>

            <div className="autonomy-table-container">
                <table className="autonomy-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Contrat</th>
                            <th>Action</th>
                            <th>Entité</th>
                            <th>Confiance</th>
                            <th>Trust</th>
                            <th>Raison</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {actions.map(a => {
                            const confClass = getConfidenceClass(a.confidenceScore);
                            const trustClass = getTrustClass(a.trustScore);

                            return (
                                <tr key={a.id}>
                                    <td className="mono">
                                        {new Date(a.timestamp).toLocaleString('fr-FR', {
                                            day: '2-digit',
                                            month: '2-digit',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </td>
                                    <td>
                                        <span className={`contract-badge ${getContractClass(a.contract)}`}>
                                            {a.contract}
                                        </span>
                                    </td>
                                    <td>{a.action}</td>
                                    <td className="mono">{a.entityType} {a.entityId.slice(0, 8)}…</td>
                                    <td>
                                        <div className="confidence-cell">
                                            <div className="confidence-bar-track">
                                                <div
                                                    className={`confidence-bar-fill ${confClass}`}
                                                    style={{ width: `${a.confidenceScore * 100}%` }}
                                                />
                                            </div>
                                            <span className={`confidence-value ${confClass}`}>
                                                {Math.round(a.confidenceScore * 100)}%
                                            </span>
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`trust-badge ${trustClass}`}>
                                            {Math.round(a.trustScore * 100)}%
                                        </span>
                                    </td>
                                    <td className="reasoning-cell">
                                        <span className="reasoning-text">{a.allowedBecause}</span>
                                    </td>
                                    <td>
                                        <button
                                            className="ack-btn"
                                            disabled={acknowledging === a.id}
                                            onClick={() => handleAcknowledge(a.id)}
                                        >
                                            {acknowledging === a.id ? '…' : '✓ ACK'}
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ==================================================
// TAB: CONTROLS
// ==================================================

function ControlsTab({
    overview,
    onDowngrade,
    onForceManual,
}: {
    overview: OverviewData;
    onDowngrade: (moduleId: string, scopeId: string, reason: string) => Promise<void>;
    onForceManual: (moduleId: string, reason: string) => Promise<void>;
}) {
    const [downgradeModule, setDowngradeModule] = useState('');
    const [downgradeScope, setDowngradeScope] = useState('');
    const [downgradeReason, setDowngradeReason] = useState('');
    const [downgrading, setDowngrading] = useState(false);

    const [forceModule, setForceModule] = useState('');
    const [forceReason, setForceReason] = useState('');
    const [forcing, setForcing] = useState(false);

    // Get relevant scopes for selected module
    const downgradeScopeOptions = overview.entries.filter(e =>
        e.moduleId === downgradeModule && (e.level === 'AUTONOMOUS' || e.level === 'SUPERVISED')
    );

    const handleDowngrade = async () => {
        if (!downgradeModule || !downgradeScope) return;
        setDowngrading(true);
        await onDowngrade(downgradeModule, downgradeScope, downgradeReason);
        setDowngrading(false);
        setDowngradeScope('');
        setDowngradeReason('');
    };

    const handleForceManual = async () => {
        if (!forceModule) return;
        setForcing(true);
        await onForceManual(forceModule, forceReason);
        setForcing(false);
        setForceReason('');
    };

    // Module options that can be downgraded (not fraud-auto-response which is global-only)
    const downgradableModules = overview.moduleDefs.filter(m => m.scopeType !== 'global');

    return (
        <div className="autonomy-controls-grid">
            {/* Downgrade Panel */}
            <div className="control-panel">
                <h3>⬇️ Rétrograder l&apos;autonomie</h3>
                <p className="control-desc">
                    Désactiver l&apos;autonomie pour un module sur un hub ou une route spécifique.
                    Le module passe de AUTONOMOUS → SUPERVISED.
                </p>

                <div className="control-form">
                    <select value={downgradeModule} onChange={(e) => { setDowngradeModule(e.target.value); setDowngradeScope(''); }}>
                        <option value="">Sélectionner un module…</option>
                        {downgradableModules.map(m => (
                            <option key={m.id} value={m.id}>{m.contract} — {m.name}</option>
                        ))}
                    </select>

                    {downgradeModule && (
                        <select value={downgradeScope} onChange={(e) => setDowngradeScope(e.target.value)}>
                            <option value="">Sélectionner le périmètre…</option>
                            {downgradeScopeOptions.map(e => (
                                <option key={e.scopeId} value={e.scopeId}>
                                    {e.scopeLabel} ({e.level})
                                </option>
                            ))}
                        </select>
                    )}

                    <textarea
                        placeholder="Raison de la rétrogradation (optionnel)…"
                        value={downgradeReason}
                        onChange={(e) => setDowngradeReason(e.target.value)}
                    />

                    <button
                        className="control-btn btn-downgrade"
                        disabled={!downgradeModule || !downgradeScope || downgrading}
                        onClick={handleDowngrade}
                    >
                        {downgrading ? 'En cours…' : '⬇️ Rétrograder'}
                    </button>
                </div>
            </div>

            {/* Force Manual Panel */}
            <div className="control-panel">
                <h3>🛑 Forcer le mode MANUEL</h3>
                <p className="control-desc">
                    Désactive le flag global ET toutes les configurations par entité.
                    Action d&apos;urgence — tout repasse en mode humain.
                </p>

                <div className="control-form">
                    <select value={forceModule} onChange={(e) => setForceModule(e.target.value)}>
                        <option value="">Sélectionner un module…</option>
                        {overview.moduleDefs.map(m => (
                            <option key={m.id} value={m.id}>{m.contract} — {m.name}</option>
                        ))}
                    </select>

                    <textarea
                        placeholder="Raison du passage en mode MANUEL (optionnel)…"
                        value={forceReason}
                        onChange={(e) => setForceReason(e.target.value)}
                    />

                    <button
                        className="control-btn btn-force-manual"
                        disabled={!forceModule || forcing}
                        onClick={handleForceManual}
                    >
                        {forcing ? 'En cours…' : '🛑 Forcer MANUEL'}
                    </button>
                </div>
            </div>
        </div>
    );
}
