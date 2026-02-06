/**
 * Domain Error Base Classes
 * 
 * Framework-agnostic error types for domain services.
 * These errors are translated to HTTP/protocol errors at the API layer.
 */

// ==================================================
// BASE ERROR CLASSES
// ==================================================

export abstract class DomainError extends Error {
    abstract readonly code: string;
    abstract readonly httpStatus: number;

    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

export class NotFoundError extends DomainError {
    readonly code = 'NOT_FOUND';
    readonly httpStatus = 404;

    constructor(
        public readonly entityType: string,
        public readonly entityId: string
    ) {
        super(`${entityType} with ID ${entityId} not found`);
    }
}

export class ValidationError extends DomainError {
    readonly code = 'VALIDATION_ERROR';
    readonly httpStatus = 400;

    constructor(
        message: string,
        public readonly field?: string,
        public readonly details?: Record<string, unknown>
    ) {
        super(message);
    }
}

export class ConflictError extends DomainError {
    readonly code = 'CONFLICT';
    readonly httpStatus = 409;

    constructor(message: string) {
        super(message);
    }
}

export class InvalidStateError extends DomainError {
    readonly code = 'INVALID_STATE';
    readonly httpStatus = 422;

    constructor(
        public readonly currentState: string,
        public readonly attemptedAction: string,
        public readonly allowedStates?: string[]
    ) {
        super(
            `Cannot ${attemptedAction} when in state ${currentState}` +
            (allowedStates ? `. Allowed states: ${allowedStates.join(', ')}` : '')
        );
    }
}

export class ExpiredError extends DomainError {
    readonly code = 'EXPIRED';
    readonly httpStatus = 410;

    constructor(
        public readonly entityType: string,
        public readonly expiredAt: Date
    ) {
        super(`${entityType} expired at ${expiredAt.toISOString()}`);
    }
}

export class ExternalServiceError extends DomainError {
    readonly code = 'EXTERNAL_SERVICE_ERROR';
    readonly httpStatus = 502;

    constructor(
        public readonly serviceName: string,
        public readonly originalError?: Error
    ) {
        super(`External service error: ${serviceName}`);
    }
}

// ==================================================
// DOMAIN-SPECIFIC ERRORS
// ==================================================

export class ShipmentNotFoundError extends NotFoundError {
    constructor(id: string) {
        super('Shipment', id);
    }
}

export class QuoteNotFoundError extends NotFoundError {
    constructor(id: string) {
        super('Quote', id);
    }
}

export class RouteNotFoundError extends NotFoundError {
    constructor(id: string) {
        super('Route', id);
    }
}

export class PricingRuleNotFoundError extends NotFoundError {
    constructor(id: string) {
        super('PricingRule', id);
    }
}

export class QuoteExpiredError extends ExpiredError {
    constructor(expiredAt: Date) {
        super('Quote', expiredAt);
    }
}

export class QuoteAlreadyAcceptedError extends ConflictError {
    constructor(quoteId: string) {
        super(`Quote ${quoteId} has already been accepted`);
    }
}

export class InvalidShipmentStateError extends InvalidStateError {
    constructor(currentState: string, attemptedAction: string) {
        super(currentState, attemptedAction);
    }
}

export class NoPricingRuleError extends ValidationError {
    constructor(routeId: string) {
        super(`No active pricing rule for route ${routeId}`, 'routeId');
    }
}

export class LowConfidenceScanError extends ValidationError {
    constructor(
        public readonly confidence: number,
        public readonly threshold: number
    ) {
        super(
            `Scan confidence ${confidence} is below threshold ${threshold}`,
            'confidence',
            { confidence, threshold }
        );
    }
}

export class PaymentAmountMismatchError extends ValidationError {
    constructor(expected: number, received: number) {
        super(
            `Payment amount ${received} does not match quote amount ${expected}`,
            'amount',
            { expected, received }
        );
    }
}

export class PaymentGatewayError extends ExternalServiceError {
    constructor(
        public readonly provider: string,
        public readonly gatewayCode?: string,
        originalError?: Error
    ) {
        super(`PaymentGateway:${provider}`, originalError);
    }
}

export class AIEngineError extends ExternalServiceError {
    constructor(originalError?: Error) {
        super('AIEngine', originalError);
    }
}
