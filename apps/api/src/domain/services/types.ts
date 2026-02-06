/**
 * Domain Services - Shared Types
 * 
 * Common types used across domain services.
 */

// ==================================================
// CONTEXT
// ==================================================

export interface ServiceContext {
    userId: string;
    hubId?: string;
    role?: string;
    correlationId?: string;
}

// ==================================================
// COMMON ENUMS
// ==================================================

export type PaymentStatus =
    | 'PENDING'
    | 'PROCESSING'
    | 'CONFIRMED'
    | 'FAILED'
    | 'EXPIRED'
    | 'REFUNDED';

export type PaymentMethod =
    | 'CASH'
    | 'MOBILE_MONEY_OM'
    | 'MOBILE_MONEY_MOMO'
    | 'MOBILE_MONEY_WAVE'
    | 'CARD';

// ==================================================
// MONEY
// ==================================================

export interface Money {
    amount: number;
    currency: 'XOF' | 'XAF' | 'EUR' | 'USD';
}

// ==================================================
// SCAN TYPES
// ==================================================

export type ScanStatus =
    | 'PROCESSING'
    | 'COMPLETED'
    | 'VALIDATED'
    | 'REJECTED';

// ==================================================
// QUOTE TYPES
// ==================================================

export type QuoteStatus =
    | 'PENDING'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'EXPIRED';

// ==================================================
// SHIPMENT TYPES (re-exported from schema)
// ==================================================

export type ShipmentStatus =
    | 'DRAFT'
    | 'CREATED'
    | 'RECEIVED_AT_HUB'
    | 'IN_TRANSIT'
    | 'ARRIVED'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'EXCEPTION'
    | 'CANCELLED';

// ==================================================
// DIMENSIONS
// ==================================================

export interface Dimensions {
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    weightKg: number;
}

// ==================================================
// PAGINATION
// ==================================================

export interface PaginationParams {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

// ==================================================
// PRICING
// ==================================================

export interface PriceBreakdown {
    basePrice: Money;
    distanceFee?: Money;
    weightFee?: Money;
    volumeFee?: Money;
    expressMultiplier?: number;
    discounts?: Array<{ code: string; amount: Money }>;
    taxes?: Money;
    total: Money;
}

// ==================================================
// ADDRESS
// ==================================================

export interface Address {
    line1: string;
    line2?: string;
    city: string;
    postalCode?: string;
    country: string;
    lat?: number;
    lng?: number;
}
