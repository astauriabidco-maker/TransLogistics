'use client';

import { useState, FormEvent } from 'react';

interface TrackingEvent {
    label: string;
    timestamp: string;
}

interface TrackingData {
    trackingCode: string;
    status: string;
    statusCode: string;
    origin: string | null;
    destination: string | null;
    createdAt: string;
    estimatedDelivery: string | null;
    lastUpdate: string;
    timeline: TrackingEvent[];
}

const STATUS_ICONS: Record<string, string> = {
    'DRAFT': '📝',
    'REGISTERED': '📋',
    'PENDING_PICKUP': '📦',
    'PICKED_UP': '🚛',
    'IN_TRANSIT': '✈️',
    'AT_HUB': '🏢',
    'OUT_FOR_DELIVERY': '🛵',
    'DELIVERED': '✅',
    'CANCELLED': '❌',
    'RETURNED': '↩️',
};

export default function TrackingPage() {
    const [trackingCode, setTrackingCode] = useState('');
    const [data, setData] = useState<TrackingData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSearch = async (e: FormEvent) => {
        e.preventDefault();
        if (!trackingCode.trim() || trackingCode.length < 5) {
            setError('Veuillez entrer un numéro de suivi valide (minimum 5 caractères)');
            return;
        }

        setLoading(true);
        setError(null);
        setData(null);

        try {
            const res = await fetch(`/api/tracking/${encodeURIComponent(trackingCode.trim())}`);
            const json = await res.json();

            if (!res.ok) {
                setError(json.error?.message || 'Numéro de suivi non trouvé');
                return;
            }

            setData(json.data);
        } catch {
            setError('Erreur de connexion au serveur');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return d.toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'linear-gradient(135deg, #0f3460 0%, #16213e 40%, #1a1a2e 100%)',
            fontFamily: "'Inter', 'Segoe UI', sans-serif",
        }}>
            {/* Header */}
            <header style={{
                padding: '2rem',
                textAlign: 'center',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
                <h1 style={{
                    color: '#fff',
                    fontSize: '1.8rem',
                    fontWeight: 700,
                    letterSpacing: '-0.02em',
                }}>
                    📦 TransLogistics Tracking
                </h1>
                <p style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '0.95rem',
                    marginTop: '0.5rem',
                }}>
                    Suivez votre envoi en temps réel
                </p>
            </header>

            {/* Search */}
            <section style={{
                maxWidth: '600px',
                margin: '2rem auto',
                padding: '0 1.5rem',
            }}>
                <form onSubmit={handleSearch} style={{
                    display: 'flex',
                    gap: '0.75rem',
                }}>
                    <input
                        type="text"
                        placeholder="Ex: TL-ABJ-DKR-2024001"
                        value={trackingCode}
                        onChange={(e) => setTrackingCode(e.target.value)}
                        style={{
                            flex: 1,
                            padding: '0.875rem 1.25rem',
                            borderRadius: '12px',
                            border: '1px solid rgba(255,255,255,0.15)',
                            background: 'rgba(255,255,255,0.08)',
                            color: '#fff',
                            fontSize: '1rem',
                            outline: 'none',
                            transition: 'border-color 0.2s',
                        }}
                        onFocus={(e) => e.currentTarget.style.borderColor = '#4cc9f0'}
                        onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
                    />
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            padding: '0.875rem 1.75rem',
                            borderRadius: '12px',
                            border: 'none',
                            background: 'linear-gradient(135deg, #4cc9f0, #4361ee)',
                            color: '#fff',
                            fontSize: '1rem',
                            fontWeight: 600,
                            cursor: loading ? 'wait' : 'pointer',
                            opacity: loading ? 0.7 : 1,
                            transition: 'opacity 0.2s, transform 0.1s',
                        }}
                    >
                        {loading ? '⏳' : '🔍 Rechercher'}
                    </button>
                </form>

                {error && (
                    <div style={{
                        marginTop: '1rem',
                        padding: '0.875rem 1.25rem',
                        borderRadius: '10px',
                        background: 'rgba(239, 68, 68, 0.15)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        color: '#fca5a5',
                        fontSize: '0.9rem',
                    }}>
                        {error}
                    </div>
                )}
            </section>

            {/* Results */}
            {data && (
                <section style={{
                    maxWidth: '700px',
                    margin: '0 auto 3rem',
                    padding: '0 1.5rem',
                }}>
                    {/* Status Card */}
                    <div style={{
                        background: 'rgba(255,255,255,0.06)',
                        backdropFilter: 'blur(20px)',
                        borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        padding: '2rem',
                        marginBottom: '1.5rem',
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '1.5rem',
                        }}>
                            <div>
                                <span style={{
                                    color: 'rgba(255,255,255,0.5)',
                                    fontSize: '0.8rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.1em',
                                }}>
                                    Numéro de suivi
                                </span>
                                <div style={{
                                    color: '#4cc9f0',
                                    fontSize: '1.2rem',
                                    fontWeight: 700,
                                    fontFamily: 'monospace',
                                    marginTop: '0.25rem',
                                }}>
                                    {data.trackingCode}
                                </div>
                            </div>
                            <div style={{
                                padding: '0.5rem 1rem',
                                borderRadius: '8px',
                                background: data.statusCode === 'DELIVERED' ? 'rgba(34,197,94,0.2)' : 'rgba(76,201,240,0.15)',
                                color: data.statusCode === 'DELIVERED' ? '#4ade80' : '#4cc9f0',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                            }}>
                                {STATUS_ICONS[data.statusCode] || '📦'} {data.status}
                            </div>
                        </div>

                        {/* Route */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto 1fr',
                            gap: '1rem',
                            alignItems: 'center',
                            marginBottom: '1.5rem',
                            padding: '1.25rem',
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: '12px',
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>ORIGINE</div>
                                <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, marginTop: '0.25rem' }}>
                                    {data.origin || '—'}
                                </div>
                            </div>
                            <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: '1.5rem' }}>→</div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem' }}>DESTINATION</div>
                                <div style={{ color: '#fff', fontSize: '1rem', fontWeight: 600, marginTop: '0.25rem' }}>
                                    {data.destination || '—'}
                                </div>
                            </div>
                        </div>

                        {/* Dates */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '1rem',
                        }}>
                            <div>
                                <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Date d&apos;envoi</div>
                                <div style={{ color: '#fff', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                    {formatDate(data.createdAt)}
                                </div>
                            </div>
                            {data.estimatedDelivery && (
                                <div>
                                    <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>Livraison estimée</div>
                                    <div style={{ color: '#4ade80', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                                        {formatDate(data.estimatedDelivery)}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Timeline */}
                    {data.timeline.length > 0 && (
                        <div style={{
                            background: 'rgba(255,255,255,0.06)',
                            backdropFilter: 'blur(20px)',
                            borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.1)',
                            padding: '2rem',
                        }}>
                            <h3 style={{
                                color: '#fff',
                                fontSize: '1.1rem',
                                fontWeight: 600,
                                marginBottom: '1.5rem',
                            }}>
                                📋 Historique
                            </h3>
                            <div style={{ position: 'relative', paddingLeft: '2rem' }}>
                                {/* Timeline line */}
                                <div style={{
                                    position: 'absolute',
                                    left: '7px',
                                    top: '4px',
                                    bottom: '4px',
                                    width: '2px',
                                    background: 'rgba(76,201,240,0.2)',
                                }} />

                                {data.timeline.map((event, i) => (
                                    <div key={i} style={{
                                        position: 'relative',
                                        marginBottom: '1.25rem',
                                    }}>
                                        {/* Dot */}
                                        <div style={{
                                            position: 'absolute',
                                            left: '-2rem',
                                            top: '4px',
                                            width: '14px',
                                            height: '14px',
                                            borderRadius: '50%',
                                            background: i === data!.timeline.length - 1
                                                ? '#4cc9f0'
                                                : 'rgba(76,201,240,0.3)',
                                            border: `2px solid ${i === data!.timeline.length - 1 ? '#4cc9f0' : 'rgba(76,201,240,0.15)'}`,
                                        }} />
                                        <div style={{ color: '#fff', fontSize: '0.9rem', fontWeight: 500 }}>
                                            {event.label}
                                        </div>
                                        <div style={{
                                            color: 'rgba(255,255,255,0.4)',
                                            fontSize: '0.8rem',
                                            marginTop: '0.15rem',
                                        }}>
                                            {formatDate(event.timestamp)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
