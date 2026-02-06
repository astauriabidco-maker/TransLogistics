/**
 * INIT State Handler
 * 
 * Entry point for new and returning users.
 * Shows welcome message and transitions to CHOIX_SERVICE.
 */

import type { HandlerContext, HandlerResult, OutgoingMessage } from '../types';
import { getTemplates } from '../templates';

export class InitHandler {
    readonly state = 'INIT' as const;

    async handle(ctx: HandlerContext): Promise<HandlerResult> {
        const templates = getTemplates('fr');
        const { phoneNumber, userName, session } = ctx;

        // Determine if returning user
        const isReturning = session.userId !== null;
        const welcomeText = isReturning
            ? templates.welcomeReturning
            : templates.welcome;

        // Build response with service menu
        const responses: OutgoingMessage[] = [
            {
                messaging_product: 'whatsapp',
                recipient_type: 'individual',
                to: phoneNumber,
                type: 'interactive',
                interactive: {
                    type: 'button',
                    body: { text: `${welcomeText}\n\n${templates.serviceMenu}` },
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
            nextState: 'CHOIX_SERVICE',
            stateData: {},
            responses,
        };
    }

    canHandle(): boolean {
        return true; // INIT always handles any message
    }
}
