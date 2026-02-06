/**
 * PaymentService Interface
 * 
 * Manages payment processing and lifecycle.
 * Integrates with external payment gateways.
 */

import type { ServiceContext, PaymentStatus, PaymentMethod, Money } from './types';

// ==================================================
// INPUT TYPES
// ==================================================

export interface InitiatePaymentInput {
    shipmentId: string;
    method: PaymentMethod;
    returnUrl?: string;
    metadata?: Record<string, string>;
}

export interface ProcessGatewayCallbackInput {
    gatewayProvider: string;
    gatewayReference: string;
    status: 'SUCCESS' | 'FAILED' | 'PENDING';
    gatewayResponse: Record<string, unknown>;
}

export interface RefundPaymentInput {
    paymentId: string;
    reason: string;
}

// ==================================================
// OUTPUT TYPES
// ==================================================

export interface PaymentDTO {
    id: string;
    shipmentId: string;
    status: PaymentStatus;
    method: PaymentMethod;

    // Amount
    amount: Money;

    // Gateway
    gatewayProvider: string | null;
    gatewayReference: string | null;

    // Timestamps
    createdAt: Date;
    processingAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    failureReason: string | null;
    refundedAt: Date | null;
    refundReason: string | null;
}

export interface PaymentInitiationResult {
    payment: PaymentDTO;
    redirectUrl?: string;
    ussdCode?: string;
    instructions?: string;
}

// ==================================================
// SERVICE INTERFACE
// ==================================================

export interface IPaymentService {
    /**
     * Initiate a payment for a shipment.
     * Creates a Payment in PENDING state and prepares gateway request.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @throws InvalidStateError - Shipment not in QUOTED state
     * @throws ConflictError - Shipment already has a payment
     * @throws QuoteNotFoundError - Shipment has no quote
     */
    initiatePayment(
        input: InitiatePaymentInput,
        ctx: ServiceContext
    ): Promise<PaymentInitiationResult>;

    /**
     * Process a callback from the payment gateway.
     * Updates payment status based on gateway response.
     * 
     * @throws NotFoundError - Payment with gateway reference not found
     * @throws InvalidStateError - Payment not in PENDING or PROCESSING state
     */
    processGatewayCallback(
        input: ProcessGatewayCallbackInput,
        ctx: ServiceContext
    ): Promise<PaymentDTO>;

    /**
     * Mark a payment as completed (for manual/cash payments).
     * 
     * @throws NotFoundError - Payment does not exist
     * @throws InvalidStateError - Payment not in PENDING or PROCESSING state
     * @throws PaymentAmountMismatchError - Received amount doesn't match
     */
    confirmManualPayment(
        paymentId: string,
        confirmedBy: string,
        ctx: ServiceContext
    ): Promise<PaymentDTO>;

    /**
     * Mark a payment as failed.
     * 
     * @throws NotFoundError - Payment does not exist
     * @throws InvalidStateError - Payment not in PENDING or PROCESSING state
     */
    failPayment(
        paymentId: string,
        reason: string,
        ctx: ServiceContext
    ): Promise<PaymentDTO>;

    /**
     * Refund a completed payment.
     * 
     * @throws NotFoundError - Payment does not exist
     * @throws InvalidStateError - Payment not in COMPLETED state
     * @throws PaymentGatewayError - Gateway refund failed
     */
    refundPayment(
        input: RefundPaymentInput,
        ctx: ServiceContext
    ): Promise<PaymentDTO>;

    /**
     * Get a payment by ID.
     * 
     * @throws NotFoundError - Payment does not exist
     */
    getPaymentById(paymentId: string): Promise<PaymentDTO>;

    /**
     * Get the payment for a shipment.
     * 
     * @throws ShipmentNotFoundError - Shipment does not exist
     * @returns null if shipment has no payment
     */
    getPaymentByShipmentId(shipmentId: string): Promise<PaymentDTO | null>;

    /**
     * Check if a shipment has a completed payment.
     */
    isShipmentPaid(shipmentId: string): Promise<boolean>;

    /**
     * Retry a failed payment.
     * Creates a new payment attempt.
     * 
     * @throws NotFoundError - Payment does not exist
     * @throws InvalidStateError - Payment not in FAILED state
     */
    retryPayment(
        paymentId: string,
        ctx: ServiceContext
    ): Promise<PaymentInitiationResult>;
}
