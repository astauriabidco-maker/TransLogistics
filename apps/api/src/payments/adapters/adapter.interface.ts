/**
 * Payment Adapter Interface
 * 
 * Abstract interface for payment providers.
 */

import type { PaymentProvider } from '@prisma/client';
import type {
    PaymentAdapter,
    PaymentInitiateRequest,
    PaymentInitiateResponse,
    WebhookPayload,
    WebhookVerifyResult,
    PaymentAdapterConfig,
} from '../payment.types';

export abstract class BasePaymentAdapter implements PaymentAdapter {
    abstract readonly provider: PaymentProvider;
    protected readonly config: PaymentAdapterConfig;

    constructor(config: PaymentAdapterConfig) {
        this.config = config;
    }

    abstract initiate(request: PaymentInitiateRequest): Promise<PaymentInitiateResponse>;
    abstract verifyWebhook(payload: WebhookPayload): Promise<WebhookVerifyResult>;
    abstract getPaymentStatus(providerPaymentId: string): Promise<import('@prisma/client').PaymentStatus>;
}
