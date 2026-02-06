/**
 * Domain Services Index
 * 
 * Re-exports all service interfaces for convenient importing.
 */

// Types and Errors
export * from './types';
export * from './errors';

// Service Interfaces
export type { IPricingService } from './services/pricing.service';
export type { IQuoteService } from './services/quote.service';
export type { IScanService } from './services/scan.service';
export type { IPaymentService } from './services/payment.service';
export type { IShipmentService } from './services/shipment.service';

// DTOs
export type {
    PricingRuleDTO,
    PriceCalculationResult,
    CreatePricingRuleInput,
    CalculatePriceInput,
} from './services/pricing.service';

export type {
    QuoteDTO,
    CreateQuoteInput,
    CreateQuoteFromScanInput,
} from './services/quote.service';

export type {
    ScanResultDTO,
    ScanProcessingResult,
    RequestScanInput,
    ValidateScanInput,
} from './services/scan.service';

export type {
    PaymentDTO,
    PaymentInitiationResult,
    InitiatePaymentInput,
    RefundPaymentInput,
} from './services/payment.service';

export type {
    ShipmentDTO,
    ShipmentDetailDTO,
    ShipmentTimelineEvent,
    CreateShipmentInput,
    UpdateShipmentInput,
    CancelShipmentInput,
    ShipmentFilter,
} from './services/shipment.service';

// Constants
export { SCAN_CONFIDENCE_THRESHOLDS, REFERENCE_OBJECTS } from './services/scan.service';
