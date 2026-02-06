'use client';

/**
 * Shop & Ship - New Request Page
 * 
 * Form for creating a new purchase request.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PurchaseRequestForm, type PurchaseRequestData } from '@/components/shop-ship';
import './shop-ship.css';

interface Hub {
    id: string;
    name: string;
    country: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function NewRequestPage() {
    const router = useRouter();
    const [hubs, setHubs] = useState<Hub[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchHubs();
    }, []);

    async function fetchHubs() {
        try {
            // Fetch active hubs for destination selection
            const res = await fetch(`${API_BASE}/api/admin/hubs?status=ACTIVE`);
            if (res.ok) {
                const data = await res.json();
                setHubs(data);
            }
        } catch (err) {
            console.error('Failed to fetch hubs:', err);
            // Fallback hubs for demo
            setHubs([
                { id: 'hub-abj', name: 'Abidjan Centre', country: 'CI' },
                { id: 'hub-dakar', name: 'Dakar Plateau', country: 'SN' },
            ]);
        } finally {
            setLoading(false);
        }
    }

    async function handleSubmit(data: PurchaseRequestData) {
        // TODO: Get userId from auth context
        const userId = 'demo-user-id';

        const res = await fetch(`${API_BASE}/api/shop-ship/requests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...data,
                userId,
            }),
        });

        if (!res.ok) {
            const error = await res.json();
            throw new Error(error.error || 'Erreur lors de la création');
        }

        const created = await res.json();
        router.push(`/shop-ship/${created.id}` as any);
    }

    if (loading) {
        return (
            <div className="shop-ship-container">
                <div className="shop-ship-header">
                    <h1>Nouvelle demande</h1>
                    <p>Chargement...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="shop-ship-container">
            <div className="shop-ship-header">
                <h1>Nouvelle demande d'achat</h1>
                <p>Indiquez-nous le produit que vous souhaitez commander</p>
            </div>

            <PurchaseRequestForm
                onSubmit={handleSubmit}
                destinationHubs={hubs}
            />

            <div style={{
                marginTop: 'var(--spacing-xl)',
                padding: 'var(--spacing-md)',
                background: '#f0f9ff',
                borderRadius: 'var(--border-radius)',
                fontSize: '0.875rem',
                color: 'var(--color-text-secondary)'
            }}>
                <strong>Comment ça marche ?</strong>
                <ol style={{ marginTop: 'var(--spacing-sm)', paddingLeft: 'var(--spacing-lg)' }}>
                    <li>Soumettez votre demande avec le lien du produit</li>
                    <li>Notre équipe vérifie et calcule le coût total</li>
                    <li>Vous confirmez et payez</li>
                    <li>Nous commandons et livrons à votre point de retrait</li>
                </ol>
            </div>
        </div>
    );
}
