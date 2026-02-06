'use client';

/**
 * Cost Breakdown Component
 * 
 * Displays the pricing breakdown for a purchase request.
 * Shows product cost, service fee, and transport estimate.
 */

interface PricingSnapshot {
    productCostXof: number;
    serviceFeeXof: number;
    estimatedLogisticsXof: number;
    totalXof: number;
}

interface CostBreakdownProps {
    pricing: PricingSnapshot | null;
    loading?: boolean;
}

export function CostBreakdown({ pricing, loading }: CostBreakdownProps) {
    if (loading) {
        return (
            <div className="cost-breakdown">
                <h3>💰 Estimation des coûts</h3>
                <div style={{ textAlign: 'center', padding: 'var(--spacing-md)', color: 'var(--color-text-secondary)' }}>
                    Calcul en cours...
                </div>
            </div>
        );
    }

    if (!pricing) {
        return (
            <div className="cost-breakdown">
                <h3>💰 Estimation des coûts</h3>
                <div style={{ textAlign: 'center', padding: 'var(--spacing-md)', color: 'var(--color-text-secondary)' }}>
                    Le devis sera disponible après validation par notre équipe.
                </div>
            </div>
        );
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('fr-FR', {
            style: 'decimal',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount) + ' FCFA';
    };

    return (
        <div className="cost-breakdown">
            <h3>💰 Détail des coûts</h3>

            <div className="cost-item">
                <span className="cost-label">Coût produit</span>
                <span className="cost-value">{formatCurrency(pricing.productCostXof)}</span>
            </div>

            <div className="cost-item">
                <span className="cost-label">Frais de service (10%)</span>
                <span className="cost-value">{formatCurrency(pricing.serviceFeeXof)}</span>
            </div>

            <div className="cost-item">
                <span className="cost-label">Transport estimé</span>
                <span className="cost-value">{formatCurrency(pricing.estimatedLogisticsXof)}</span>
            </div>

            <div className="cost-item total">
                <span className="cost-label">Total estimé</span>
                <span className="cost-value">{formatCurrency(pricing.totalXof)}</span>
            </div>
        </div>
    );
}
