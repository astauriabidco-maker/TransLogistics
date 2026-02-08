/**
 * Admin Layout
 * 
 * Sidebar navigation for ops dashboard.
 * Protected by JWT auth guard — redirects to login if not authenticated.
 */
'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { isAuthenticated, clearTokens } from '@/lib/api-client';
import './admin.css';

const navItems = [
    { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
    { href: '/admin/shipments', label: 'Expéditions', icon: '📦' },
    { href: '/admin/quotes', label: 'Devis', icon: '💰' },
    { href: '/admin/scans', label: 'Scans', icon: '📷' },
    { href: '/admin/hubs', label: 'Hubs', icon: '🏢' },
    { href: '/admin/dispatch', label: 'Dispatch', icon: '🚛' },
    { href: '/admin/shop-ship', label: 'Shop & Ship', icon: '🛍️' },
    { href: '/admin/payments', label: 'Paiements', icon: '💳' },
    { href: '/admin/automation', label: 'Automation', icon: '⚙️' },
    { href: '/admin/autonomy', label: 'Autonomie', icon: '🛡️' },
];

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const [authChecked, setAuthChecked] = useState(false);

    // Auth guard — skip for login page
    useEffect(() => {
        if (pathname === '/admin/login') {
            setAuthChecked(true);
            return;
        }

        if (!isAuthenticated()) {
            router.replace('/admin/login');
            return;
        }

        setAuthChecked(true);
    }, [pathname, router]);

    // Login page renders without sidebar
    if (pathname === '/admin/login') {
        return <>{children}</>;
    }

    // Wait for auth check before rendering admin UI
    if (!authChecked) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a', color: '#94a3b8' }}>
                Chargement...
            </div>
        );
    }

    const handleLogout = () => {
        clearTokens();
        router.push('/admin/login');
    };

    return (
        <div className="admin-layout">
            <aside className="admin-sidebar">
                <div className="admin-logo">
                    <h2>TransLogistics</h2>
                    <span className="admin-badge">Admin</span>
                </div>
                <nav className="admin-nav">
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href as never}
                            className={`admin-nav-item ${pathname === item.href ? 'active' : ''}`}
                        >
                            <span className="admin-nav-icon">{item.icon}</span>
                            {item.label}
                        </Link>
                    ))}
                </nav>
                <button onClick={handleLogout} className="admin-logout-btn" style={{
                    margin: '1rem',
                    padding: '0.625rem 1rem',
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#fca5a5',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    fontWeight: 500,
                    transition: 'opacity 0.2s',
                }}>
                    🚪 Déconnexion
                </button>
            </aside>
            <main className="admin-main">
                {children}
            </main>
        </div>
    );
}

