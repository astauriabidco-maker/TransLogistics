/**
 * CinetPay Payment Adapter
 * 
 * Integration with CinetPay for Mobile Money payments in West Africa.
 * https://cinetpay.com/documentation
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

const CINETPAY_API_URL = 'https://api-checkout.cinetpay.com/v2';
const CINETPAY_SANDBOX_URL = 'https://api-checkout.cinetpay.com/v2';

// ==================================================
// ADAPTER
// ==================================================

export class CinetPayAdapter extends BasePaymentAdapter {
    readonly provider = 'CINETPAY' as PaymentProvider;

    private get baseUrl(): string {
        return this.config.sandbox ? CINETPAY_SANDBOX_URL : CINETPAY_API_URL;
    }

    /**
     * Initiate a payment with CinetPay.
     */
    async initiate(request: PaymentInitiateRequest): Promise<PaymentInitiateResponse> {
        try {
            const transactionId = `TL_${request.paymentId}_${Date.now()}`;

            const payload = {
                apikey: this.config.apiKey,
                site_id: this.config.secretKey,
                transaction_id: transactionId,
                amount: request.amount,
                currency: request.currency,
                description: request.description,
                return_url: request.returnUrl,
                cancel_url: request.cancelUrl,
                notify_url: `${process.env['API_BASE_URL']}/webhooks/cinetpay`,
                channels: 'ALL',
                metadata: JSON.stringify(request.metadata ?? {}),
                customer_phone_number: request.customerPhone,
                customer_email: request.customerEmail,
            };

            const response = await fetch(`${this.baseUrl}/payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            const data = await response.json() as CinetPayInitResponse;

            if (data.code === '201' && data.data?.payment_url) {
                logger.info({ transactionId, paymentId: request.paymentId }, 'CinetPay payment initiated');

                return {
                    success: true,
                    providerPaymentId: transactionId,
                    paymentUrl: data.data.payment_url,
                    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
                };
            }

            logger.error({ data }, 'CinetPay initiation failed');
            return {
                success: false,
                providerPaymentId: '',
                paymentUrl: '',
                error: data.message ?? 'Failed to initiate payment',
            };

        } catch (error) {
            logger.error({ error }, 'CinetPay initiation error');
            return {
                success: false,
                providerPaymentId: '',
                paymentUrl: '',
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }

    /**
     * Verify webhook signature and parse data.
     */
    async verifyWebhook(payload: WebhookPayload): Promise<WebhookVerifyResult> {
        try {
            const body = JSON.parse(payload.rawBody) as CinetPayWebhookPayload;

            // CinetPay uses HMAC-SHA256 for signature
            if (this.config.webhookSecret) {
                const expectedSignature = crypto
                    .createHmac('sha256', this.config.webhookSecret)
                    .update(payload.rawBody)
                    .digest('hex');

                const receivedSignature = payload.headers['x-cinetpay-signature'] ?? '';

                if (!crypto.timingSafeEqual(
                    Buffer.from(expectedSignature),
                    Buffer.from(receivedSignature)
                )) {
                    return {
                        valid: false,
                        paymentId: null,
                        providerPaymentId: null,
                        status: 'failed',
                        rawData: body as unknown as Record<string, unknown>,
                        error: 'Invalid signature',
                    };
                }
            }

            // Extract payment ID from transaction_id (format: TL_{paymentId}_{timestamp})
            const parts = body.cpm_trans_id?.split('_');
            const paymentId = parts && parts.length >= 2 ? parts[1] ?? null : null;

            // Map CinetPay status
            let status: WebhookVerifyResult['status'];
            switch (body.cpm_result) {
                case '00':
                    status = 'success';
                    break;
                case 'PENDING':
                    status = 'pending';
                    break;
                default:
                    status = 'failed';
            }

            return {
                valid: true,
                paymentId,
                providerPaymentId: body.cpm_trans_id,
                status,
                rawData: body as unknown as Record<string, unknown>,
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
     * Get payment status from CinetPay.
     */
    async getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus> {
        try {
            const response = await fetch(`${this.baseUrl}/payment/check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    apikey: this.config.apiKey,
                    site_id: this.config.secretKey,
                    transaction_id: providerPaymentId,
                }),
            });

            const data = await response.json() as CinetPayCheckResponse;

            switch (data.data?.status) {
                case 'ACCEPTED':
                    return 'CONFIRMED';
                case 'PENDING':
                    return 'PENDING';
                case 'REFUSED':
                case 'CANCELLED':
                    return 'FAILED';
                default:
                    return 'PENDING';
            }

        } catch (error) {
            logger.error({ error, providerPaymentId }, 'CinetPay status check failed');
            return 'PENDING';
        }
    }
}

// ==================================================
// TYPES
// ==================================================

interface CinetPayInitResponse {
    code: string;
    message: string;
    data?: {
        payment_url: string;
        payment_token: string;
    };
}

interface CinetPayWebhookPayload {
    cpm_trans_id: string;
    cpm_result: string;
    cpm_amount: string;
    cpm_currency: string;
    cpm_site_id: string;
    signature?: string;
}

interface CinetPayCheckResponse {
    code: string;
    message: string;
    data?: {
        status: 'ACCEPTED' | 'PENDING' | 'REFUSED' | 'CANCELLED';
        amount: number;
        currency: string;
    };
}

// ==================================================
// FACTORY
// ==================================================

export function createCinetPayAdapter(config?: Partial<PaymentAdapterConfig>): CinetPayAdapter {
    return new CinetPayAdapter({
        apiKey: config?.apiKey ?? process.env['CINETPAY_API_KEY'] ?? '',
        secretKey: config?.secretKey ?? process.env['CINETPAY_SITE_ID'] ?? '',
        webhookSecret: config?.webhookSecret ?? process.env['CINETPAY_WEBHOOK_SECRET'],
        sandbox: config?.sandbox ?? process.env['NODE_ENV'] !== 'production',
    });
}
