/**
 * Admin Login Page
 * 
 * Premium login form for the TransLogistics operations dashboard.
 * Authenticates via JWT and redirects to admin panel.
 */
'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { setTokens } from '@/lib/api-client';

const API_BASE =
    typeof window !== 'undefined'
        ? (window as unknown as { ENV?: { API_URL?: string } }).ENV?.API_URL ?? 'http://localhost:3001'
        : 'http://localhost:3001';

export default function AdminLoginPage() {
    const router = useRouter();
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/api/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password }),
            });

            const result = await response.json();

            if (!response.ok) {
                setError(result.error?.message || 'Erreur de connexion');
                setLoading(false);
                return;
            }

            // Store tokens
            setTokens(result.data.accessToken, result.data.refreshToken);

            // Redirect to admin dashboard
            router.push('/admin');
        } catch {
            setError('Impossible de se connecter au serveur');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                {/* Logo */}
                <div style={styles.logoSection}>
                    <div style={styles.logoIcon}>🚀</div>
                    <h1 style={styles.title}>TransLogistics</h1>
                    <p style={styles.subtitle}>Portail d&apos;administration</p>
                </div>

                {/* Error message */}
                {error && (
                    <div style={styles.errorBanner}>
                        <span style={styles.errorIcon}>⚠️</span>
                        {error}
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleSubmit} style={styles.form}>
                    <div style={styles.field}>
                        <label htmlFor="phone" style={styles.label}>
                            Numéro de téléphone
                        </label>
                        <input
                            id="phone"
                            type="tel"
                            placeholder="+225 XX XX XX XX XX"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            required
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.field}>
                        <label htmlFor="password" style={styles.label}>
                            Mot de passe
                        </label>
                        <input
                            id="password"
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={8}
                            style={styles.input}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            ...styles.button,
                            ...(loading ? styles.buttonDisabled : {}),
                        }}
                    >
                        {loading ? (
                            <span style={styles.spinner}>⟳</span>
                        ) : (
                            'Se connecter'
                        )}
                    </button>
                </form>

                <p style={styles.footer}>
                    © {new Date().getFullYear()} TransLogistics — Accès réservé
                </p>
            </div>
        </div>
    );
}

// ==================================================
// INLINE STYLES — Premium dark glassmorphism
// ==================================================

const styles: Record<string, React.CSSProperties> = {
    page: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    },
    card: {
        width: '100%',
        maxWidth: '420px',
        margin: '1rem',
        padding: '2.5rem',
        background: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(20px)',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        borderRadius: '20px',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
    },
    logoSection: {
        textAlign: 'center' as const,
        marginBottom: '2rem',
    },
    logoIcon: {
        fontSize: '3rem',
        marginBottom: '0.5rem',
    },
    title: {
        fontSize: '1.75rem',
        fontWeight: 700,
        color: '#f8fafc',
        margin: '0 0 0.25rem',
        letterSpacing: '-0.02em',
    },
    subtitle: {
        fontSize: '0.875rem',
        color: '#94a3b8',
        margin: 0,
    },
    errorBanner: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.75rem 1rem',
        background: 'rgba(239, 68, 68, 0.15)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '10px',
        color: '#fca5a5',
        fontSize: '0.875rem',
        marginBottom: '1.5rem',
    },
    errorIcon: {
        fontSize: '1rem',
        flexShrink: 0,
    },
    form: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '1.25rem',
    },
    field: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.5rem',
    },
    label: {
        fontSize: '0.8125rem',
        fontWeight: 500,
        color: '#cbd5e1',
        letterSpacing: '0.02em',
    },
    input: {
        padding: '0.75rem 1rem',
        background: 'rgba(15, 23, 42, 0.6)',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        borderRadius: '10px',
        color: '#f8fafc',
        fontSize: '0.9375rem',
        outline: 'none',
        transition: 'border-color 0.2s, box-shadow 0.2s',
    },
    button: {
        padding: '0.875rem',
        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
        border: 'none',
        borderRadius: '10px',
        color: '#fff',
        fontSize: '0.9375rem',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'opacity 0.2s, transform 0.15s',
        marginTop: '0.5rem',
    },
    buttonDisabled: {
        opacity: 0.6,
        cursor: 'not-allowed',
    },
    spinner: {
        display: 'inline-block',
        animation: 'spin 1s linear infinite',
    },
    footer: {
        textAlign: 'center' as const,
        fontSize: '0.75rem',
        color: '#64748b',
        margin: '1.5rem 0 0',
    },
};
