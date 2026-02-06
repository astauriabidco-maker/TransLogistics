/**
 * WhatsApp Configuration
 * 
 * Environment-based configuration for WhatsApp Cloud API.
 */

export interface WhatsAppConfig {
    // API credentials
    apiVersion: string;
    phoneNumberId: string;
    accessToken: string;

    // Webhook
    verifyToken: string;
    webhookSecret: string;

    // URLs
    apiBaseUrl: string;
    mediaBaseUrl: string;

    // Business
    businessAccountId: string;

    // Session
    sessionExpiryMinutes: number;

    // Retry
    maxRetries: number;
    retryDelayMs: number;
}

function getEnvOrThrow(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}

function getEnvOrDefault(key: string, defaultValue: string): string {
    return process.env[key] ?? defaultValue;
}

export function loadWhatsAppConfig(): WhatsAppConfig {
    return {
        apiVersion: getEnvOrDefault('WHATSAPP_API_VERSION', 'v18.0'),
        phoneNumberId: getEnvOrThrow('WHATSAPP_PHONE_NUMBER_ID'),
        accessToken: getEnvOrThrow('WHATSAPP_ACCESS_TOKEN'),
        verifyToken: getEnvOrThrow('WHATSAPP_VERIFY_TOKEN'),
        webhookSecret: getEnvOrThrow('WHATSAPP_WEBHOOK_SECRET'),
        apiBaseUrl: getEnvOrDefault(
            'WHATSAPP_API_BASE_URL',
            'https://graph.facebook.com'
        ),
        mediaBaseUrl: getEnvOrDefault(
            'WHATSAPP_MEDIA_BASE_URL',
            'https://graph.facebook.com'
        ),
        businessAccountId: getEnvOrThrow('WHATSAPP_BUSINESS_ACCOUNT_ID'),
        sessionExpiryMinutes: parseInt(
            getEnvOrDefault('WHATSAPP_SESSION_EXPIRY_MINUTES', '30'),
            10
        ),
        maxRetries: parseInt(getEnvOrDefault('WHATSAPP_MAX_RETRIES', '3'), 10),
        retryDelayMs: parseInt(
            getEnvOrDefault('WHATSAPP_RETRY_DELAY_MS', '1000'),
            10
        ),
    };
}

// Lazy singleton
let config: WhatsAppConfig | null = null;

export function getWhatsAppConfig(): WhatsAppConfig {
    if (!config) {
        config = loadWhatsAppConfig();
    }
    return config;
}

// For testing
export function resetWhatsAppConfig(): void {
    config = null;
}
