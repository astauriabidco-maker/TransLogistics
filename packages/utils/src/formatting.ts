/**
 * Formatting Utilities
 * 
 * Pure formatting functions for display.
 */

/**
 * Formats currency with locale support.
 */
export function formatCurrency(
    amount: number,
    currency: string = 'XOF',
    locale: string = 'fr-FR'
): string {
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

/**
 * Formats dimensions as LxWxH string.
 */
export function formatDimensions(
    length: number,
    width: number,
    height: number,
    unit: string = 'cm'
): string {
    return `${length} × ${width} × ${height} ${unit}`;
}

/**
 * Formats weight with appropriate unit.
 */
export function formatWeight(weightKg: number): string {
    if (weightKg >= 1000) {
        return `${(weightKg / 1000).toFixed(1)} t`;
    }
    if (weightKg >= 1) {
        return `${weightKg.toFixed(1)} kg`;
    }
    return `${(weightKg * 1000).toFixed(0)} g`;
}

/**
 * Formats a date in ISO format to a human-readable string.
 */
export function formatDate(
    date: Date | string,
    locale: string = 'fr-FR'
): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(d);
}

/**
 * Generates a tracking code.
 */
export function generateTrackingCode(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `TL-${timestamp}-${random}`;
}
