/**
 * Shared Constants
 * 
 * Domain constants used across the platform.
 */

/**
 * WhatsApp conversation states (strict FSM).
 */
export const WHATSAPP_STATES = [
    'INIT',
    'CHOIX_SERVICE',
    'SCAN_PHOTO',
    'CALCUL_PRIX',
    'CONFIRMATION',
    'PAIEMENT',
    'SUIVI',
] as const;

export type WhatsAppState = (typeof WHATSAPP_STATES)[number];

/**
 * Valid state transitions for WhatsApp FSM.
 */
export const WHATSAPP_TRANSITIONS: Record<WhatsAppState, WhatsAppState[]> = {
    INIT: ['CHOIX_SERVICE'],
    CHOIX_SERVICE: ['SCAN_PHOTO'],
    SCAN_PHOTO: ['CALCUL_PRIX'],
    CALCUL_PRIX: ['CONFIRMATION'],
    CONFIRMATION: ['PAIEMENT'],
    PAIEMENT: ['SUIVI'],
    SUIVI: ['INIT'], // Can restart
};

/**
 * A4 reference dimensions (mm).
 */
export const A4_DIMENSIONS = {
    WIDTH_MM: 210,
    HEIGHT_MM: 297,
} as const;

/**
 * VolumeScan confidence thresholds.
 */
export const VOLUMESCAN_THRESHOLDS = {
    AUTO_ACCEPT: 0.85,
    MANUAL_VALIDATION: 0.6,
    TOLERANCE_PERCENT: 10,
} as const;

/**
 * Shipment status values.
 */
export const SHIPMENT_STATUSES = [
    'DRAFT',
    'QUOTED',
    'CONFIRMED',
    'PICKED_UP',
    'IN_TRANSIT',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/**
 * Payment status values.
 */
export const PAYMENT_STATUSES = [
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED',
    'REFUNDED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
