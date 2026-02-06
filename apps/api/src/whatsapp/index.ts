/**
 * WhatsApp Module Index
 * 
 * Re-exports all WhatsApp integration components.
 */

// Core
export * from './types';
export * from './config';
export * from './state-machine';

// Infrastructure
export { SessionRepository } from './session.repository';
export { IdempotencyService } from './idempotency.service';
export { WhatsAppAuditLogger } from './audit.logger';
export { MessageSender, getMessageSender } from './message.sender';
export { createWhatsAppRouter } from './webhook.handler';
export { processMessage } from './message.processor';

// Templates
export * from './templates';

// Handlers
export { InitHandler } from './handlers/init.handler';
export { ChoixServiceHandler } from './handlers/choix-service.handler';
export { ScanPhotoHandler } from './handlers/scan-photo.handler';
export { CalculPrixHandler } from './handlers/calcul-prix.handler';
export { ConfirmationHandler } from './handlers/confirmation.handler';
export { PaiementHandler } from './handlers/paiement.handler';
export { SuiviHandler } from './handlers/suivi.handler';
