/**
 * Stripe Payment Adapter
 * 
 * Integration with Stripe for international card payments.
 * https://stripe.com/docs/api
 */

import crypto from 'crypto';
import { PaymentProvider, PaymentStatus } from '@prisma/client';
import { BasePaymentAdapter } from './adapter.interface';
import type {
    PaymentInitiateRequest,
    PaymentInitiateResponse,
    WebhookPayload,
    WebhookVerifyResult,
    PaymentAdapterConfig,
} from '../payment.types';
import { logger } from '../../lib/logger';

// ==================================================
// CONSTANTS
// ==================================================

const STRIPE_API_URL = 'https://api.stripe.com/v1';

// ==================================================
// ADAPTER
// ==================================================

export class StripeAdapter extends BasePaymentAdapter {
    readonly provider = 'STRIPE' as PaymentProvider;

    /**
     * Initiate a Stripe Checkout Session.
     */
    async initiate(request: PaymentInitiateRequest): Promise<PaymentInitiateResponse> {
        try {
            // Convert XOF to cents (Stripe uses smallest currency unit)
            // Note: XOF doesn't have decimals, so amount is already in smallest unit
            const amountInCents = Math.round(request.amount);

            const params = new URLSearchParams({
                'payment_method_types[]': 'card',
                'mode': 'payment',
                'success_url': `${request.returnUrl}?session_id={CHECKOUT_SESSION_ID}`,
                'cancel_url': request.cancelUrl,
                'line_items[0][price_data][currency]': request.currency.toLowerCase(),
                'line_items[0][price_data][product_data][name]': request.description,
                'line_items[0][price_data][unit_amount]': amountInCents.toString(),
                'line_items[0][quantity]': '1',
                'metadata[paymentId]': request.paymentId,
                'metadata[shipmentId]': request.metadata?.['shipmentId'] ?? '',
                'metadata[quoteId]': request.metadata?.['quoteId'] ?? '',
            });

            if (request.customerEmail) {
                params.append('customer_email', request.customerEmail);
            }

            const response = await fetch(`${STRIPE_API_URL}/checkout/sessions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString(),
            });

            const data = await response.json() as StripeCheckoutSession;

            if (data.id && data.url) {
                logger.info({ sessionId: data.id, paymentId: request.paymentId }, 'Stripe session created');

                return {
                    success: true,
                    providerPaymentId: data.id,
                    paymentUrl: data.url,
                    expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : undefined,
                };
            }

            logger.error({ data }, 'Stripe session creation failed');
            return {
                success: false,
                providerPaymentId: '',
                paymentUrl: '',
                error: (data as StripeError).error?.message ?? 'Failed to create checkout session',
            };

        } catch (error) {
            logger.error({ error }, 'Stripe initiation error');
            return {
                success: false,
                providerPaymentId: '',
                paymentUrl: '',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Verify Stripe webhook signature.
     */
    async verifyWebhook(payload: WebhookPayload): Promise<WebhookVerifyResult> {
        try {
            const signature = payload.headers['stripe-signature'];
            if (!signature || !this.config.webhookSecret) {
                return {
                    valid: false,
                    paymentId: null,
                    providerPaymentId: null,
                    status: 'failed',
                    rawData: {},
                    error: 'Missing signature or webhook secret',
                };
            }

            // Parse signature header
            const signatureParts = signature.split(',').reduce((acc, part) => {
                const [key, value] = part.split('=');
                if (key && value) {
                    acc[key] = value;
                }
                return acc;
            }, {} as Record<string, string>);

            const timestamp = signatureParts['t'] ?? '';
            const v1Signature = signatureParts['v1'] ?? '';

            if (!timestamp || !v1Signature) {
                return {
                    valid: false,
                    paymentId: null,
                    providerPaymentId: null,
                    status: 'failed',
                    rawData: {},
                    error: 'Invalid signature format',
                };
            }

            // Verify signature
            const signedPayload = `${timestamp}.${payload.rawBody}`;
            const expectedSignature = crypto
                .createHmac('sha256', this.config.webhookSecret)
                .update(signedPayload)
                .digest('hex');

            if (!crypto.timingSafeEqual(
                Buffer.from(v1Signature),
                Buffer.from(expectedSignature)
            )) {
                return {
                    valid: false,
                    paymentId: null,
                    providerPaymentId: null,
                    status: 'failed',
                    rawData: {},
                    error: 'Invalid signature',
                };
            }

            // Parse event
            const event = JSON.parse(payload.rawBody) as StripeWebhookEvent;
            const session = event.data.object as StripeCheckoutSession;

            // Map status
            let status: WebhookVerifyResult['status'];
            switch (event.type) {
                case 'checkout.session.completed':
                    status = session.payment_status === 'paid' ? 'success' : 'pending';
                    break;
                case 'checkout.session.expired':
                    status = 'expired';
                    break;
                case 'payment_intent.payment_failed':
                    status = 'failed';
                    break;
                default:
                    status = 'pending';
            }

            return {
                valid: true,
                paymentId: session.metadata?.paymentId ?? null,
                providerPaymentId: session.id,
                status,
                rawData: event as unknown as Record<string, unknown>,
            };

        } catch (error) {
            return {
                valid: false,
                paymentId: null,
                providerPaymentId: null,
                status: 'failed',
                rawData: {},
                error: error instanceof Error ? error.message : 'Parse error',
            };
        }
    }

    /**
     * Get payment status from Stripe.
     */
    async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus> {
        try {
            const response = await fetch(`${STRIPE_API_URL}/checkout/sessions/${providerPaymentId}`, {
                headers: {
                    'Authorization': `Bearer ${this.config.secretKey}`,
                },
            });

            const session = await response.json() as StripeCheckoutSession;

            switch (session.payment_status) {
                case 'paid':
                    return 'CONFIRMED';
                case 'unpaid':
                    return session.status === 'expired' ? 'EXPIRED' : 'PENDING';
                default:
                    return 'PENDING';
            }

        } catch (error) {
            logger.error({ error, providerPaymentId }, 'Stripe status check failed');
            return 'PENDING';
        }
    }
}

// ==================================================
// TYPES
// ==================================================

interface StripeCheckoutSession {
    id: string;
    url: string;
    status: string;
    payment_status: 'paid' | 'unpaid' | 'no_payment_required';
    expires_at?: number;
    metadata?: {
        paymentId?: string;
        shipmentId?: string;
        quoteId?: string;
    };
}

interface StripeWebhookEvent {
    id: string;
    type: string;
    data: {
        object: unknown;
    };
}

interface StripeError {
    error?: {
        message: string;
        type: string;
    };
}

// ==================================================
// FACTORY
// ==================================================

export function createStripeAdapter(config?: Partial<PaymentAdapterConfig>): StripeAdapter {
    return new StripeAdapter({
        apiKey: config?.apiKey ?? process.env['STRIPE_PUBLISHABLE_KEY'] ?? '',
        secretKey: config?.secretKey ?? process.env['STRIPE_SECRET_KEY'] ?? '',
        webhookSecret: config?.webhookSecret ?? process.env['STRIPE_WEBHOOK_SECRET'],
        sandbox: config?.sandbox ?? process.env['NODE_ENV'] !== 'production',
    });
}
