/**
 * Admin Layout
 * 
 * Sidebar navigation for ops dashboard.
 */
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './admin.css';

const navItems = [
    { href: '/admin/analytics', label: 'Analytics', icon: '📊' },
    { href: '/admin/shipments', label: 'Expéditions', icon: '📦' },
    { href: '/admin/quotes', label: 'Devis', icon: '💰' },
    { href: '/admin/scans', label: 'Scans', icon: '📷' },
    { href: '/admin/payments', label: 'Paiements', icon: '💳' },
];

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

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
            </aside>
            <main className="admin-main">
                {children}
            </main>
        </div>
    );
}
