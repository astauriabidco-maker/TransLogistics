/**
 * SUIVI State Handler
 * 
 * Handles tracking lookups.
 * Calls ShipmentService to get tracking info.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage } from '../types';
import { getTemplates, format, shipmentStatusLabels } from '../templates';

export class SuiviHandler {
    readonly state = 'SUIVI' as const;

    async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const templates = getTemplates('fr');
        const { message, phoneNumber, session } = ctx;

        // Check if we already have a tracking code from the flow
        let trackingCode = session.stateData.trackingCode;

        // If not, try to extract from user message
        if (!trackingCode && message.type === 'text') {
            trackingCode = this.extractTrackingCode(message.text?.body ?? '');
        }

        if (!trackingCode) {
            return this.requestTrackingCode(phoneNumber, templates);
        }

        // TODO: Call ShipmentService.getShipmentByTrackingCode(trackingCode)
        // For now, use mock data

        const mockShipment = this.getMockShipment(trackingCode);

        if (!mockShipment) {
            return this.handleNotFound(phoneNumber, templates);
        }

        return this.displayTracking(phoneNumber, mockShipment, templates);
    }

    private extractTrackingCode(text: string): string | null {
        // Match pattern: TL-XXXXXX or similar
        const match = text.match(/TL-?[A-Z0-9]{6,12}/i);
        return match ? match[0].toUpperCase() : null;
    }

    private getMockShipment(trackingCode: string): MockShipment | null {
        // Simulate found shipment for demo
        if (trackingCode.startsWith('TL')) {
            return {
                trackingCode,
                status: 'IN_TRANSIT',
                lastUpdate: new Date(),
                origin: 'Abidjan',
                destination: 'Bouaké',
                estimatedDelivery: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            };
        }
        return null;
    }

    private displayTracking(
        phoneNumber: string,
        shipment: MockShipment,
        templates: ReturnType<typeof getTemplates>
    ): HandlerResult {
        const statusLabel = shipmentStatusLabels['fr'][shipment.status] ?? shipment.status;
        const lastUpdateStr = shipment.lastUpdate.toLocaleString('fr-FR', {
            dateStyle: 'short',
            timeStyle: 'short',
        });

        const statusDetails = this.getStatusDetails(shipment);

        const trackingText = format(templates.trackingInfo, {
            trackingCode: shipment.trackingCode,
            status: statusLabel,
            lastUpdate: lastUpdateStr,
            statusDetails,
        });

        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: trackingText },
            },
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: 'Que souhaitez-vous faire ?' },
                    action: {
                        buttons: [
                            { type: 'reply', reply: { id: 'SERVICE_ENVOI', title: '📦 Nouvel envoi' } },
                            { type: 'reply', reply: { id: 'SERVICE_SUIVI', title: '📍 Autre suivi' } },
                        ],
                    },
                },
            },
        ];

        return {
            nextState: 'INIT', // Reset to allow new interaction
            stateData: {},
            responses,
        };
    }

    private getStatusDetails(shipment: MockShipment): string {
        switch (shipment.status) {
            case 'DRAFT':
            case 'QUOTED':
                return '📝 Votre colis est en attente de confirmation.';
            case 'CONFIRMED':
                return '✅ Commande confirmée. Collecte prévue bientôt.';
            case 'PICKED_UP':
                return '📦 Votre colis a été collecté.';
            case 'IN_TRANSIT':
                return `🚚 En route vers ${shipment.destination}.`;
            case 'OUT_FOR_DELIVERY':
                return '🏃 Votre colis est en livraison !';
            case 'DELIVERED':
                return '✅ Livré avec succès !';
            case 'CANCELLED':
                return '❌ Cet envoi a été annulé.';
            default:
                return '';
        }
    }

    private requestTrackingCode(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): HandlerResult {
        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.requestTrackingCode },
            },
        ];

        return {
            nextState: 'SUIVI', // Stay in same state
            stateData: {},
            responses,
        };
    }

    private handleNotFound(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): HandlerResult {
        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.trackingNotFound },
            },
        ];

        return {
            nextState: 'SUIVI', // Stay in same state for retry
            stateData: {},
            responses,
        };
    }

    canHandle(): boolean {
        return true;
    }
}

interface MockShipment {
    trackingCode: string;
    status: string;
    lastUpdate: Date;
    origin: string;
    destination: string;
    estimatedDelivery: Date;
}
