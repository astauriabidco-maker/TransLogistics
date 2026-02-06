/**
 * Payment Module
 * 
 * Barrel export for the payment system.
 */

// Service
export { PaymentService, PaymentError, getPaymentService } from './payment.service';

// Types
export * from './payment.types';

// Adapters
export { BasePaymentAdapter } from './adapters/adapter.interface';
export { CinetPayAdapter, createCinetPayAdapter } from './adapters/cinetpay.adapter';
export { StripeAdapter, createStripeAdapter } from './adapters/stripe.adapter';

// Webhooks
export { webhookRouter, rawBodyMiddleware } from './webhooks/webhook.controller';
