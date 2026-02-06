'use client';

/**
 * Status Tracker Component
 * 
 * Visual timeline showing the progress of a purchase request
 * through all stages: request → order → reception → consolidation → shipment
 */

interface StatusStep {
    id: string;
    label: string;
    description: string;
    status: 'pending' | 'active' | 'complete';
    timestamp?: string;
}

interface StatusTrackerProps {
    currentStatus: string;
    requestId: string;
    createdAt: string;
    events?: Array<{
        status: string;
        timestamp: string;
        description?: string;
    }>;
}

// Map backend status to UI steps
function getStatusSteps(currentStatus: string, events: StatusTrackerProps['events'] = []): StatusStep[] {
    const statusOrder = [
        { id: 'SUBMITTED', label: 'Demande soumise', description: 'Votre demande a été reçue' },
        { id: 'QUOTED', label: 'Devis établi', description: 'Notre équipe a calculé le coût total' },
        { id: 'APPROVED', label: 'Confirmé', description: 'Paiement reçu, commande validée' },
        { id: 'ORDERING', label: 'Commande en cours', description: 'Achat auprès du fournisseur' },
        { id: 'ORDERED', label: 'Commandé', description: 'Commande passée, en attente de livraison' },
        { id: 'RECEIVED_AT_HUB', label: 'Reçu au hub', description: 'Colis arrivé à notre entrepôt' },
        { id: 'CONSOLIDATING', label: 'Consolidation', description: 'Préparation pour expédition' },
        { id: 'SHIPPED', label: 'Expédié', description: 'En route vers votre destination' },
        { id: 'COMPLETED', label: 'Livré', description: 'Disponible au point de retrait' },
    ];

    const currentIndex = statusOrder.findIndex(s => s.id === currentStatus);
    const eventMap = new Map(events?.map(e => [e.status, e.timestamp]) || []);

    return statusOrder.map((step, index) => {
        let status: 'pending' | 'active' | 'complete' = 'pending';

        if (index < currentIndex) {
            status = 'complete';
        } else if (index === currentIndex) {
            status = 'active';
        }

        return {
            ...step,
            status,
            timestamp: eventMap.get(step.id),
        };
    });
}

function formatDate(dateString: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(dateString));
}

function getStatusBadgeClass(status: string): string {
    if (['COMPLETED', 'DELIVERED'].includes(status)) return 'complete';
    if (['EXCEPTION', 'CANCELLED'].includes(status)) return 'error';
    if (['SUBMITTED', 'QUOTED'].includes(status)) return 'pending';
    return 'active';
}

function getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
        SUBMITTED: 'En attente',
        QUOTED: 'Devis prêt',
        APPROVED: 'Confirmé',
        ORDERING: 'En commande',
        ORDERED: 'Commandé',
        RECEIVED_AT_HUB: 'Réceptionné',
        CONSOLIDATING: 'En préparation',
        SHIPPED: 'Expédié',
        COMPLETED: 'Livré',
        EXCEPTION: 'Exception',
        CANCELLED: 'Annulé',
    };
    return labels[status] || status;
}

export function StatusTracker({ currentStatus, requestId, createdAt, events }: StatusTrackerProps) {
    const steps = getStatusSteps(currentStatus, events);

    return (
        <div className="status-tracker">
            <div className="status-header">
                <div>
                    <h2>Suivi de commande</h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        Demande #{requestId.slice(-8).toUpperCase()}
                    </p>
                </div>
                <span className={`status-badge ${getStatusBadgeClass(currentStatus)}`}>
                    {getStatusLabel(currentStatus)}
                </span>
            </div>

            <div className="status-timeline">
                {steps.map((step) => (
                    <div key={step.id} className="status-step">
                        <div className={`status-dot ${step.status}`}>
                            {step.status === 'complete' && (
                                <svg viewBox="0 0 24 24">
                                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                                </svg>
                            )}
                        </div>
                        <div className="status-content">
                            <h4 style={{ opacity: step.status === 'pending' ? 0.5 : 1 }}>
                                {step.label}
                            </h4>
                            <p style={{ opacity: step.status === 'pending' ? 0.5 : 1 }}>
                                {step.description}
                            </p>
                            {step.timestamp && (
                                <div className="timestamp">
                                    {formatDate(step.timestamp)}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
