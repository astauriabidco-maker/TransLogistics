/**
 * Message Processor
 * 
 * Routes incoming messages to appropriate state handlers
 * and manages state transitions.
 */

import type { HandlerContext, HandlerResult, WhatsAppState } from './types';
import { SessionRepository } from './session.repository';
import { attemptTransition } from './state-machine';
import { getMessageSender } from './message.sender';
import { getTemplates } from './templates';
import { logger } from '../lib/logger';

// Import handlers
import { InitHandler } from './handlers/init.handler';
import { ChoixServiceHandler } from './handlers/choix-service.handler';
import { ScanPhotoHandler } from './handlers/scan-photo.handler';
import { CalculPrixHandler } from './handlers/calcul-prix.handler';
import { ConfirmationHandler } from './handlers/confirmation.handler';
import { PaiementHandler } from './handlers/paiement.handler';
import { SuiviHandler } from './handlers/suivi.handler';

import { ServiceRegistry } from './service-registry';

// ==================================================
// HANDLER REGISTRY
// ==================================================

const handlers: Record<WhatsAppState, { handle: (ctx: HandlerContext) => Promise<HandlerResult> }> = {
    INIT: new InitHandler(),
    CHOIX_SERVICE: new ChoixServiceHandler(),
    SCAN_PHOTO: new ScanPhotoHandler(),
    CALCUL_PRIX: new CalculPrixHandler(),
    CONFIRMATION: new ConfirmationHandler(),
    PAIEMENT: new PaiementHandler(),
    SUIVI: new SuiviHandler(),
};

// ==================================================
// MESSAGE PROCESSING
// ==================================================

export async function processMessage(
    ctx: Omit<HandlerContext, 'services'>,
    services: ServiceRegistry,
    sessionRepo: SessionRepository
): Promise<void> {
    const { session, message } = ctx;
    const fullCtx: HandlerContext = { ...ctx, services };
    const sender = getMessageSender();
    const templates = getTemplates('fr');

    try {
        // Mark as read
        await sender.markAsRead(message.id);

        // Get handler for current state
        const handler = handlers[session.state];
        if (!handler) {
            logger.error({ state: session.state }, 'No handler for state');
            await sender.sendText(ctx.phoneNumber, templates.errorGeneric);
            return;
        }

        // Execute handler
        const result = await handler.handle(fullCtx);

        // Validate transition
        const transitionResult = attemptTransition(
            session.state,
            result.nextState,
            { ...session.stateData, ...result.stateData }
        );

        if (!transitionResult.success) {
            logger.warn({
                from: session.state,
                to: result.nextState,
                error: transitionResult.error,
            }, 'Invalid state transition');
            // Stay in current state but still send responses
        }

        // Update session state
        if (transitionResult.success && result.nextState !== session.state) {
            await sessionRepo.transitionState(
                session.id,
                result.nextState,
                result.stateData
            );
            logger.info({
                from: session.state,
                to: result.nextState,
                phoneNumber: ctx.phoneNumber,
            }, 'State transition');
        } else {
            // Just update state data
            await sessionRepo.updateSession(session.id, {
                stateData: { ...session.stateData, ...result.stateData },
            });
        }

        // Send responses
        for (const response of result.responses) {
            const sendResult = await sender.send(response);
            if (!sendResult.success) {
                logger.error({
                    error: sendResult.error,
                    phoneNumber: ctx.phoneNumber,
                }, 'Failed to send message');
            }
        }
    } catch (error) {
        logger.error({
            error,
            phoneNumber: ctx.phoneNumber,
            state: session.state,
        }, 'Message processing error');

        // Send error message
        await sender.sendText(ctx.phoneNumber, templates.errorGeneric);
    }
}
