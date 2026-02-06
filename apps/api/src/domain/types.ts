/**
 * Shared Domain Types
 * 
 * Framework-agnostic types used across domain services.
 * These are value objects and DTOs, not database entities.
 */

// ==================================================
// VALUE OBJECTS
// ==================================================

export interface Dimensions {
    lengthCm: number;
    widthCm: number;
    heightCm: number;
}

export interface Address {
    line1: string;
    line2?: string;
    city: string;
    phone: string;
    contactName: string;
}

export interface GeoCoordinates {
    latitude: number;
    longitude: number;
}

export interface Money {
    amount: number;
    currency: 'XOF' | 'EUR' | 'USD';
}

export interface PriceBreakdown {
    basePriceXof: number;
    weightPriceXof: number;
    volumePriceXof: number;
    totalPriceXof: number;
}

// ==================================================
// ENUMS (mirroring Prisma but framework-agnostic)
// ==================================================

export type ShipmentStatus =
    | 'DRAFT'
    | 'QUOTED'
    | 'CONFIRMED'
    | 'PICKED_UP'
    | 'IN_TRANSIT'
    | 'OUT_FOR_DELIVERY'
    | 'DELIVERED'
    | 'CANCELLED';

export type QuoteStatus =
    | 'PENDING'
    | 'ACCEPTED'
    | 'REJECTED'
    | 'EXPIRED';

export type PaymentStatus =
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'REFUNDED';

export type PaymentMethod =
    | 'MOBILE_MONEY'
    | 'CASH'
    | 'CARD';

export type ScanStatus =
    | 'PROCESSING'
    | 'COMPLETED'
    | 'VALIDATED'
    | 'REJECTED';

// ==================================================
// COMMON RESULT TYPES
// ==================================================

export interface PaginationParams {
    page: number;
    limit: number;
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

export interface ServiceResult<T> {
    success: true;
    data: T;
}

export interface ServiceError {
    success: false;
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
}

export type ServiceResponse<T> = ServiceResult<T> | ServiceError;

// ==================================================
// CONTEXT (passed to all service methods)
// ==================================================

export interface ServiceContext {
    userId?: string;
    userRole?: string;
    hubId?: string;
    requestId: string;
    timestamp: Date;
}
