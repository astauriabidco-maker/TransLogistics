/**
 * Automation Control Panel
 *
 * Admin page for monitoring and controlling all automation modules.
 * Displays module status, recent automated actions, and fraud alerts.
 */
'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiClient } from '@/lib/api-client';
import './automation.css';

// ==================================================
// TYPES
// ==================================================

interface ModuleConfig {
    total: number;
    enabled: number;
    entityType: string;
}

interface AutomationModule {
    id: string;
    name: string;
    contract: string;
    zone: string;
    globalEnabled: boolean;
    envVar: string;
    configs: ModuleConfig;
}

interface StatusResponse {
    modules: AutomationModule[];
    fraudAlerts: Record<string, number>;
}

interface AuditAction {
    id: string;
    entityType: string;
    entityId: string;
    action: string;
    performedById: string | null;
    performedByRole: string | null;
    changes: Record<string, unknown> | null;
    timestamp: string;
}

interface FraudAlert {
    id: string;
    status: string;
    entityType: string;
    entityId: string;
    signalType: string;
    severity: string;
    reasoning: string;
    actionsTaken: unknown[];
    resolvedById: string | null;
    resolvedAt: string | null;
    resolution: string | null;
    createdAt: string;
}

// ==================================================
// COMPONENT
// ==================================================

export default function AutomationControlPanel() {
    const [activeTab, setActiveTab] = useState<'status' | 'actions' | 'alerts'>('status');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [toggling, setToggling] = useState<string | null>(null);

    // Data
    const [modules, setModules] = useState<AutomationModule[]>([]);
    const [fraudAlertSummary, setFraudAlertSummary] = useState<Record<string, number>>({});
    const [actions, setActions] = useState<AuditAction[]>([]);
    const [alerts, setAlerts] = useState<FraudAlert[]>([]);

    // ── Load status ──
    const loadStatus = useCallback(async () => {
        try {
            const data = await apiClient.get<StatusResponse>('/api/admin/automation/status');
            setModules(data.modules);
            setFraudAlertSummary(data.fraudAlerts);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load status');
        }
    }, []);

    // ── Load actions ──
    const loadActions = useCallback(async () => {
        try {
            const data = await apiClient.get<AuditAction[]>('/api/admin/automation/actions');
            setActions(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load actions');
        }
    }, []);

    // ── Load fraud alerts ──
    const loadAlerts = useCallback(async () => {
        try {
            const data = await apiClient.get<FraudAlert[]>('/api/admin/automation/fraud-alerts');
            setAlerts(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load alerts');
        }
    }, []);

    // ── Initial load ──
    useEffect(() => {
        async function init() {
            setLoading(true);
            setError(null);
            await loadStatus();
            setLoading(false);
        }
        init();
    }, [loadStatus]);

    // ── Tab change load ──
    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            if (activeTab === 'status') await loadStatus();
            else if (activeTab === 'actions') await loadActions();
            else if (activeTab === 'alerts') { await loadStatus(); await loadAlerts(); }
            setLoading(false);
        }
        load();
    }, [activeTab, loadStatus, loadActions, loadAlerts]);

    // ── Toggle module ──
    const handleToggle = async (moduleId: string, currentEnabled: boolean) => {
        setToggling(moduleId);
        try {
            await apiClient.post('/api/admin/automation/toggle', {
                moduleId,
                enabled: !currentEnabled,
            });
            await loadStatus();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to toggle module');
        } finally {
            setToggling(null);
        }
    };

    // ── Kill all switch ──
    const allEnabled = modules.some(m => m.globalEnabled);
    const handleKillAll = async () => {
        setToggling('all');
        try {
            for (const m of modules) {
                if (m.globalEnabled) {
                    await apiClient.post('/api/admin/automation/toggle', {
                        moduleId: m.id,
                        enabled: false,
                    });
                }
            }
            await loadStatus();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to kill all modules');
        } finally {
            setToggling(null);
        }
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const zoneClass = (zone: string) => {
        if (zone === 'SAFE') return 'safe';
        if (zone === 'GUARDED') return 'guarded';
        return 'restricted';
    };

    return (
        <div className="auto-panel">
            <header className="auto-header">
                <h1>⚙️ Automation Control Panel</h1>
                <p className="auto-subtitle">Surveillance et contrôle des modules d&apos;automatisation</p>
            </header>

            {/* ── Kill Switch ── */}
            <div className="auto-killswitch">
                <div className="auto-killswitch-info">
                    <p className="auto-killswitch-label">🛑 Arrêt d&apos;urgence — Kill Switch</p>
                    <p className="auto-killswitch-desc">
                        Désactive tous les modules d&apos;automatisation instantanément
                    </p>
                </div>
                <button
                    className={`auto-killswitch-btn ${allEnabled ? 'active' : 'inactive'}`}
                    onClick={handleKillAll}
                    disabled={toggling === 'all' || !allEnabled}
                >
                    {toggling === 'all' ? '...' : allEnabled ? 'Tout arrêter' : 'Tout arrêté'}
                </button>
            </div>

            {/* ── Tabs ── */}
            <nav className="auto-tabs">
                {[
                    { key: 'status', label: 'Status des modules' },
                    { key: 'actions', label: 'Actions automatisées' },
                    { key: 'alerts', label: 'Alertes fraude' },
                ].map(tab => (
                    <button
                        key={tab.key}
                        className={`auto-tab ${activeTab === tab.key ? 'active' : ''}`}
                        onClick={() => setActiveTab(tab.key as typeof activeTab)}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>

            {/* ── Content ── */}
            {error && <div className="auto-error">Erreur: {error}</div>}
            {loading && <div className="auto-loading">Chargement...</div>}

            {!loading && !error && activeTab === 'status' && (
                <ModuleStatusView
                    modules={modules}
                    toggling={toggling}
                    onToggle={handleToggle}
                    zoneClass={zoneClass}
                />
            )}

            {!loading && !error && activeTab === 'actions' && (
                <ActionsLogView actions={actions} formatDate={formatDate} />
            )}

            {!loading && !error && activeTab === 'alerts' && (
                <FraudAlertsView
                    alerts={alerts}
                    summary={fraudAlertSummary}
                    formatDate={formatDate}
                />
            )}
        </div>
    );
}

// ==================================================
// SUB-COMPONENTS
// ==================================================

function ModuleStatusView({
    modules,
    toggling,
    onToggle,
    zoneClass,
}: {
    modules: AutomationModule[];
    toggling: string | null;
    onToggle: (id: string, enabled: boolean) => void;
    zoneClass: (zone: string) => string;
}) {
    return (
        <>
            <h2 className="auto-section-title">Modules d&apos;automatisation</h2>
            <div className="auto-modules">
                {modules.map(m => (
                    <div key={m.id} className={`auto-module-card zone-${zoneClass(m.zone)}`}>
                        <div className="auto-module-header">
                            <h3 className="auto-module-title">{m.name}</h3>
                            <span className={`auto-module-contract ${zoneClass(m.zone)}`}>
                                {m.contract}
                            </span>
                        </div>

                        <div className="auto-module-status">
                            <span className={`auto-status-dot ${m.globalEnabled ? 'on' : 'off'}`} />
                            <span className="auto-status-label">
                                {m.globalEnabled ? 'Actif' : 'Désactivé'}
                            </span>
                        </div>

                        <p className="auto-module-meta">
                            {m.configs.entityType !== 'global'
                                ? `${m.configs.enabled}/${m.configs.total} ${m.configs.entityType}${m.configs.total !== 1 ? 's' : ''} activé${m.configs.enabled !== 1 ? 's' : ''}`
                                : 'Configuration globale'
                            }
                        </p>

                        <div className="auto-module-toggle">
                            <button
                                className={`auto-toggle-btn ${m.globalEnabled ? 'stop' : 'start'}`}
                                onClick={() => onToggle(m.id, m.globalEnabled)}
                                disabled={toggling === m.id}
                            >
                                {toggling === m.id
                                    ? '...'
                                    : m.globalEnabled
                                        ? '⏹ Désactiver'
                                        : '▶ Activer'
                                }
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

function ActionsLogView({
    actions,
    formatDate,
}: {
    actions: AuditAction[];
    formatDate: (iso: string) => string;
}) {
    if (actions.length === 0) {
        return (
            <div className="auto-table-container">
                <h2 className="auto-section-title">Actions automatisées récentes</h2>
                <div className="auto-empty">Aucune action automatisée enregistrée</div>
            </div>
        );
    }

    const actorLabels: Record<string, string> = {
        'ai-auto-validation': 'S1',
        'pricing-auto-application': 'G4/R1',
        'dispatch-auto-execution': 'G3',
        'fraud-auto-response': 'R2',
    };

    return (
        <>
            <h2 className="auto-section-title">Actions automatisées récentes</h2>
            <div className="auto-table-container">
                <table className="auto-table">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Contrat</th>
                            <th>Action</th>
                            <th>Type entité</th>
                            <th>ID entité</th>
                            <th>Détails</th>
                        </tr>
                    </thead>
                    <tbody>
                        {actions.map(a => (
                            <tr key={a.id}>
                                <td>{formatDate(a.timestamp)}</td>
                                <td>
                                    <span className="auto-badge guarded">
                                        {actorLabels[a.performedById || ''] || a.performedById}
                                    </span>
                                </td>
                                <td><strong>{a.action}</strong></td>
                                <td>{a.entityType}</td>
                                <td className="mono">{a.entityId?.substring(0, 12)}…</td>
                                <td className="mono">
                                    {a.changes ? JSON.stringify(a.changes).substring(0, 60) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}

function FraudAlertsView({
    alerts,
    summary,
    formatDate,
}: {
    alerts: FraudAlert[];
    summary: Record<string, number>;
    formatDate: (iso: string) => string;
}) {
    return (
        <>
            <h2 className="auto-section-title">Alertes fraude</h2>

            {/* Summary counters */}
            <div className="auto-alert-summary">
                <div className="auto-alert-stat">
                    <span className="count">{summary['OPEN'] || 0}</span>
                    <span className="label">Ouvertes</span>
                </div>
                <div className="auto-alert-stat">
                    <span className="count">{summary['UNDER_REVIEW'] || 0}</span>
                    <span className="label">En revue</span>
                </div>
                <div className="auto-alert-stat">
                    <span className="count">{summary['RESOLVED'] || 0}</span>
                    <span className="label">Résolues</span>
                </div>
            </div>

            {alerts.length === 0 ? (
                <div className="auto-table-container">
                    <div className="auto-empty">Aucune alerte fraude enregistrée</div>
                </div>
            ) : (
                <div className="auto-table-container">
                    <table className="auto-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Status</th>
                                <th>Sévérité</th>
                                <th>Signal</th>
                                <th>Entité</th>
                                <th>Raison</th>
                                <th>Résolution</th>
                            </tr>
                        </thead>
                        <tbody>
                            {alerts.map(a => (
                                <tr key={a.id}>
                                    <td>{formatDate(a.createdAt)}</td>
                                    <td>
                                        <span className={`auto-badge ${a.status === 'OPEN' ? 'open' : a.status === 'UNDER_REVIEW' ? 'under-review' : 'resolved'}`}>
                                            {a.status}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`auto-badge ${a.severity.toLowerCase()}`}>
                                            {a.severity}
                                        </span>
                                    </td>
                                    <td>{a.signalType}</td>
                                    <td className="mono">{a.entityType}:{a.entityId?.substring(0, 8)}</td>
                                    <td>{a.reasoning?.substring(0, 50)}{a.reasoning?.length > 50 ? '…' : ''}</td>
                                    <td>{a.resolution || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
}
