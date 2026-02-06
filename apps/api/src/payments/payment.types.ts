/**
 * Payment Types
 * 
 * TypeScript types for the payment system.
 */

import type { PaymentStatus, PaymentMethod, PaymentProvider, Payment, PaymentEvent } from '@prisma/client';

// ==================================================
// RE-EXPORTS
// ==================================================

export type { PaymentStatus, PaymentMethod, PaymentProvider, Payment, PaymentEvent };

// ==================================================
// INPUT TYPES
// ==================================================

export interface InitiatePaymentInput {
    shipmentId: string;
    quoteId: string;
    amountXof: number;
    currencyCode?: string;
    method: PaymentMethod;
    provider: PaymentProvider;
    returnUrl?: string;
    cancelUrl?: string;
}

export interface WebhookPayload {
    provider: PaymentProvider;
    rawBody: string;
    signature: string;
    headers: Record<string, string>;
}

// ==================================================
// OUTPUT TYPES
// ==================================================

export interface PaymentResult {
    payment: Payment;
    paymentUrl: string | null;
    expiresAt: Date | null;
}

export interface WebhookResult {
    success: boolean;
    paymentId: string | null;
    newStatus: PaymentStatus | null;
    error?: string;
}

// ==================================================
// ADAPTER INTERFACE
// ==================================================

export interface PaymentAdapterConfig {
    apiKey: string;
    secretKey: string;
    webhookSecret?: string;
    baseUrl?: string;
    sandbox?: boolean;
}

export interface PaymentInitiateRequest {
    paymentId: string;
    amount: number;
    currency: string;
    description: string;
    customerPhone?: string;
    customerEmail?: string;
    returnUrl: string;
    cancelUrl: string;
    metadata?: Record<string, string>;
}

export interface PaymentInitiateResponse {
    success: boolean;
    providerPaymentId: string;
    paymentUrl: string;
    expiresAt?: Date;
    error?: string;
}

export interface WebhookVerifyResult {
    valid: boolean;
    paymentId: string | null;
    providerPaymentId: string | null;
    status: 'success' | 'failed' | 'pending' | 'expired';
    rawData: Record<string, unknown>;
    error?: string;
}

export interface PaymentAdapter {
    provider: PaymentProvider;
    initiate(request: PaymentInitiateRequest): Promise<PaymentInitiateResponse>;
    verifyWebhook(payload: WebhookPayload): Promise<WebhookVerifyResult>;
    getPaymentStatus(providerPaymentId: string): Promise<PaymentStatus>;
}

// ==================================================
// CONSTANTS
// ==================================================

export const PAYMENT_LINK_EXPIRY_HOURS = 24;

export const PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
    INITIATED: ['PENDING', 'FAILED', 'EXPIRED'],
    PENDING: ['PROCESSING', 'CONFIRMED', 'FAILED', 'EXPIRED'],
    PROCESSING: ['CONFIRMED', 'FAILED'],
    CONFIRMED: ['REFUNDED'], // Final state, only refund allowed
    FAILED: [], // Terminal state
    EXPIRED: [], // Terminal state
    REFUNDED: [], // Terminal state
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
    return PAYMENT_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
