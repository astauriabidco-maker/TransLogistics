/**
 * CHOIX_SERVICE State Handler
 * 
 * Handles service selection (send or track).
 * Creates draft shipment for ENVOI flow.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage, IncomingMessage } from '../types';
import { getTemplates } from '../templates';

export class ChoixServiceHandler {
    readonly state = 'CHOIX_SERVICE' as const;

    async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const templates = getTemplates('fr');
        const { message, phoneNumber } = ctx;

        // Get selected service from button reply
        const selectedId = this.getSelectedButtonId(message);

        if (selectedId === 'SERVICE_ENVOI') {
            return this.handleEnvoi(phoneNumber, templates, ctx);
        }

        if (selectedId === 'SERVICE_SUIVI') {
            return this.handleSuivi(phoneNumber, templates);
        }

        // Invalid input - resend menu
        return this.resendMenu(phoneNumber, templates);
    }

    private getSelectedButtonId(message: IncomingMessage): string | null {
        if (message.type === 'interactive') {
            return message.interactive?.button_reply?.id ?? null;
        }
        if (message.type === 'button') {
            return message.button?.payload ?? null;
        }
        // Allow text fallback
        if (message.type === 'text') {
            const text = message.text?.body?.toLowerCase() ?? '';
            if (text.includes('envoi') || text.includes('send') || text === '1') {
                return 'SERVICE_ENVOI';
            }
            if (text.includes('suivi') || text.includes('track') || text === '2') {
                return 'SERVICE_SUIVI';
            }
        }
        return null;
    }

    private async handleEnvoi(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>,
        ctx: HandlerContext
    ): Promise<HandlerResult> {
        const { services, userName } = ctx;
        const prisma = services.prisma;

        // 1. Find or create customer by phone number
        let user = await prisma.user.findUnique({
            where: { phone: phoneNumber },
        });

        if (!user) {
            // Create a minimal placeholder user
            user = await prisma.user.create({
                data: {
                    phone: phoneNumber,
                    firstName: userName?.split(' ')[0] || 'Client',
                    lastName: userName?.split(' ').slice(1).join(' ') || 'WhatsApp',
                    passwordHash: 'PBKDF2$WHATSAPP$PLACEHOLDER', // Bot-created
                    role: 'CUSTOMER',
                },
            });
        }

        // 2. Get a default active route (Abidjan -> Bouaké typically)
        const route = await prisma.route.findFirst({
            where: { status: 'ACTIVE' },
        }) || await prisma.route.findFirst();

        if (!route) {
            throw new Error('No routes available in system');
        }

        // 3. Create Draft Shipment
        const shipment = await services.shipment.createDraft({
            customerId: user.id,
            routeId: route.id,
            packageDescription: 'Envoi via WhatsApp',
            originPhone: phoneNumber,
            originContactName: user.firstName + ' ' + user.lastName,
            destPhone: phoneNumber, // To be updated
            destContactName: 'Destinataire',
        });

        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'text',
                text: { body: templates.requestPhoto },
            },
        ];

        return {
            nextState: 'SCAN_PHOTO',
            stateData: {
                selectedService: 'ENVOI',
                shipmentId: shipment.id,
            },
            responses,
        };
    }

    private async handleSuivi(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): Promise<HandlerResult> {
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
            nextState: 'SUIVI',
            stateData: {
                selectedService: 'SUIVI',
            },
            responses,
        };
    }

    private resendMenu(
        phoneNumber: string,
        templates: ReturnType<typeof getTemplates>
    ): HandlerResult {
        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: templates.serviceMenu },
                    action: {
                        buttons: [
                            { type: 'reply', reply: { id: 'SERVICE_ENVOI', title: templates.serviceEnvoi } },
                            { type: 'reply', reply: { id: 'SERVICE_SUIVI', title: templates.serviceSuivi } },
                        ],
                    },
                },
            },
        ];

        return {
            nextState: 'CHOIX_SERVICE', // Stay in same state
            stateData: {},
            responses,
        };
    }

    canHandle(ctx: HandlerContext): boolean {
        const { message } = ctx;
        return (
            message.type === 'interactive' ||
            message.type === 'button' ||
            message.type === 'text'
        );
    }
}
