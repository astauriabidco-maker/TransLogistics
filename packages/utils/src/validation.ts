/**
 * Validation Utilities
 * 
 * Pure validation functions for common data types.
 */

/**
 * Validates a phone number format.
 * Supports international format with country code.
 */
export function isValidPhoneNumber(phone: string): boolean {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
}

/**
 * Validates an email address format.
 */
export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Validates that dimensions are positive numbers.
 */
export function isValidDimensions(
    length: number,
    width: number,
    height: number
): boolean {
    return length > 0 && width > 0 && height > 0;
}

/**
 * Validates a shipment weight in kg.
 */
export function isValidWeight(weight: number): boolean {
    return weight > 0 && weight <= 10000; // Max 10 tons
}
