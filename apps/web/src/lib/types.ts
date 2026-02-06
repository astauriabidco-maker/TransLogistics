/**
 * Quote Types
 * 
 * Frontend types for the quote flow.
 * Mirrors backend DTOs for type safety.
 */

// ==================================================
// VALUE OBJECTS
// ==================================================

export interface Dimensions {
    lengthCm: number;
    widthCm: number;
    heightCm: number;
}

export interface PriceBreakdown {
    basePriceXof: number;
    weightPriceXof: number;
    volumePriceXof: number;
    totalPriceXof: number;
}

// ==================================================
// API RESPONSE TYPES
// ==================================================

export interface Hub {
    id: string;
    name: string;
    city: string;
    isActive: boolean;
}

export interface Route {
    id: string;
    originHubId: string;
    destinationHubId: string;
    originHub: Hub;
    destinationHub: Hub;
    estimatedDays: number;
    isActive: boolean;
}

export interface Quote {
    id: string;
    shipmentId: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
    dimensions: Dimensions;
    volumeCm3: number;
    weightKg: number;
    pricingRuleId: string;
    breakdown: PriceBreakdown;
    validUntil: string;
    acceptedAt: string | null;
    createdAt: string;
}

export interface Shipment {
    id: string;
    trackingCode: string;
    status: string;
    routeId: string;
    quote?: Quote;
}

// ==================================================
// REQUEST TYPES
// ==================================================

export interface CreateShipmentRequest {
    routeId: string;
    senderName: string;
    senderPhone: string;
    senderAddress: string;
    recipientName: string;
    recipientPhone: string;
    recipientAddress: string;
}

export interface CreateQuoteRequest {
    shipmentId: string;
    dimensions: Dimensions;
    weightKg: number;
}

export interface DeclareManualDimensionsRequest {
    shipmentId: string;
    dimensions: Dimensions;
    weightKg: number;
    declaredBy: 'USER' | 'OPERATOR';
    notes?: string;
}
