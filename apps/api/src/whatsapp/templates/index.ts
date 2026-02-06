/**
 * Message Templates
 * 
 * Localization-ready templates for each WhatsApp state.
 * All text is defined here for easy translation.
 */

// ==================================================
// LANGUAGE
// ==================================================

export type Language = 'fr' | 'en';

const DEFAULT_LANGUAGE: Language = 'fr';

// ==================================================
// TEMPLATE DEFINITIONS
// ==================================================

export interface MessageTemplates {
    // INIT
    welcome: string;
    welcomeReturning: string;

    // CHOIX_SERVICE
    serviceMenu: string;
    serviceEnvoi: string;
    serviceSuivi: string;

    // SCAN_PHOTO
    requestPhoto: string;
    photoReceived: string;
    photoProcessing: string;
    photoError: string;

    // CALCUL_PRIX
    calculatingPrice: string;
    priceResult: string;
    priceLowConfidence: string;

    // CONFIRMATION
    confirmPrompt: string;
    confirmYes: string;
    confirmNo: string;
    quoteAccepted: string;
    quoteRejected: string;

    // PAIEMENT
    paymentMethodPrompt: string;
    paymentMobileMoney: string;
    paymentCash: string;
    paymentInitiated: string;
    paymentInstructions: string;
    paymentConfirmed: string;
    paymentFailed: string;

    // SUIVI
    trackingInfo: string;
    trackingNotFound: string;
    requestTrackingCode: string;

    // ERRORS
    errorGeneric: string;
    errorInvalidInput: string;
    errorSessionExpired: string;
    errorRetry: string;
}

// ==================================================
// FRENCH TEMPLATES
// ==================================================

const frenchTemplates: MessageTemplates = {
    // INIT
    welcome: `🚚 *Bienvenue sur TransLogistics !*

Je suis votre assistant d'expédition. Comment puis-je vous aider ?`,

    welcomeReturning: `👋 *Bonjour !*

Content de vous revoir. Que souhaitez-vous faire ?`,

    // CHOIX_SERVICE
    serviceMenu: `Choisissez un service :`,
    serviceEnvoi: `📦 Envoyer un colis`,
    serviceSuivi: `📍 Suivre un colis`,

    // SCAN_PHOTO
    requestPhoto: `📸 *Photo du colis*

Posez votre colis à côté d'une feuille A4 (format standard) et prenez une photo.

La feuille doit être visible pour estimer les dimensions.`,

    photoReceived: `✅ Photo reçue ! Analyse en cours...`,
    photoProcessing: `⏳ Calcul des dimensions...`,
    photoError: `❌ Impossible d'analyser cette photo. Veuillez réessayer avec une meilleure qualité.`,

    // CALCUL_PRIX
    calculatingPrice: `⏳ Calcul du prix en cours...`,

    priceResult: `💰 *Devis TransLogistics*

📦 Dimensions : {length} × {width} × {height} cm
⚖️ Poids estimé : {weight} kg
📍 Trajet : {origin} → {destination}

*Prix : {price} FCFA*

Ce devis est valable 24 heures.`,

    priceLowConfidence: `⚠️ Les dimensions ont été estimées avec une précision limitée.

Un opérateur vérifiera les mesures lors de la collecte.`,

    // CONFIRMATION
    confirmPrompt: `Confirmez-vous cet envoi ?`,
    confirmYes: `✅ Oui, confirmer`,
    confirmNo: `❌ Non, annuler`,
    quoteAccepted: `✅ *Envoi confirmé !*

Passons au paiement.`,
    quoteRejected: `❌ Envoi annulé.

Vous pouvez recommencer quand vous voulez.`,

    // PAIEMENT
    paymentMethodPrompt: `💳 *Mode de paiement*

Comment souhaitez-vous payer ?`,
    paymentMobileMoney: `📱 Mobile Money`,
    paymentCash: `💵 Espèces à la collecte`,
    paymentInitiated: `⏳ Paiement en cours...`,
    paymentInstructions: `📱 *Instructions Mobile Money*

Composez *#150# avec l'option « Payer »
Référence : {reference}
Montant : {amount} FCFA

Vous recevrez une confirmation automatique.`,
    paymentConfirmed: `✅ *Paiement confirmé !*

Votre code de suivi : *{trackingCode}*

Nous vous contacterons pour organiser la collecte.`,
    paymentFailed: `❌ Paiement échoué.

Veuillez réessayer ou choisir un autre mode de paiement.`,

    // SUIVI
    trackingInfo: `📍 *Suivi de votre colis*

Code : {trackingCode}
Statut : {status}
Dernière mise à jour : {lastUpdate}

{statusDetails}`,
    trackingNotFound: `❌ Code de suivi introuvable.

Vérifiez le code et réessayez.`,
    requestTrackingCode: `Entrez votre code de suivi (ex: TL-XXXXXX) :`,

    // ERRORS
    errorGeneric: `❌ Une erreur s'est produite. Veuillez réessayer.`,
    errorInvalidInput: `❌ Entrée non valide. {hint}`,
    errorSessionExpired: `⏰ Votre session a expiré.

Envoyez un message pour recommencer.`,
    errorRetry: `🔄 Réessayer`,
};

// ==================================================
// ENGLISH TEMPLATES
// ==================================================

const englishTemplates: MessageTemplates = {
    // INIT
    welcome: `🚚 *Welcome to TransLogistics!*

I'm your shipping assistant. How can I help you?`,

    welcomeReturning: `👋 *Hello!*

Good to see you again. What would you like to do?`,

    // CHOIX_SERVICE
    serviceMenu: `Choose a service:`,
    serviceEnvoi: `📦 Send a package`,
    serviceSuivi: `📍 Track a package`,

    // SCAN_PHOTO
    requestPhoto: `📸 *Package Photo*

Place your package next to an A4 sheet (standard size) and take a photo.

The sheet must be visible to estimate dimensions.`,

    photoReceived: `✅ Photo received! Analyzing...`,
    photoProcessing: `⏳ Calculating dimensions...`,
    photoError: `❌ Unable to analyze this photo. Please retry with better quality.`,

    // CALCUL_PRIX
    calculatingPrice: `⏳ Calculating price...`,

    priceResult: `💰 *TransLogistics Quote*

📦 Dimensions: {length} × {width} × {height} cm
⚖️ Estimated weight: {weight} kg
📍 Route: {origin} → {destination}

*Price: {price} XOF*

This quote is valid for 24 hours.`,

    priceLowConfidence: `⚠️ Dimensions were estimated with limited accuracy.

An operator will verify measurements during pickup.`,

    // CONFIRMATION
    confirmPrompt: `Do you confirm this shipment?`,
    confirmYes: `✅ Yes, confirm`,
    confirmNo: `❌ No, cancel`,
    quoteAccepted: `✅ *Shipment confirmed!*

Let's proceed to payment.`,
    quoteRejected: `❌ Shipment cancelled.

You can start over anytime.`,

    // PAIEMENT
    paymentMethodPrompt: `💳 *Payment Method*

How would you like to pay?`,
    paymentMobileMoney: `📱 Mobile Money`,
    paymentCash: `💵 Cash on pickup`,
    paymentInitiated: `⏳ Processing payment...`,
    paymentInstructions: `📱 *Mobile Money Instructions*

Dial *#150# and select "Pay"
Reference: {reference}
Amount: {amount} XOF

You will receive an automatic confirmation.`,
    paymentConfirmed: `✅ *Payment confirmed!*

Your tracking code: *{trackingCode}*

We will contact you to arrange pickup.`,
    paymentFailed: `❌ Payment failed.

Please retry or choose another payment method.`,

    // SUIVI
    trackingInfo: `📍 *Package Tracking*

Code: {trackingCode}
Status: {status}
Last update: {lastUpdate}

{statusDetails}`,
    trackingNotFound: `❌ Tracking code not found.

Please check and try again.`,
    requestTrackingCode: `Enter your tracking code (e.g., TL-XXXXXX):`,

    // ERRORS
    errorGeneric: `❌ An error occurred. Please try again.`,
    errorInvalidInput: `❌ Invalid input. {hint}`,
    errorSessionExpired: `⏰ Your session has expired.

Send a message to start over.`,
    errorRetry: `🔄 Retry`,
};

// ==================================================
// TEMPLATE ACCESS
// ==================================================

const templates: Record<Language, MessageTemplates> = {
    fr: frenchTemplates,
    en: englishTemplates,
};

export function getTemplates(language: Language = DEFAULT_LANGUAGE): MessageTemplates {
    return templates[language] ?? templates[DEFAULT_LANGUAGE];
}

/**
 * Format a template with variables.
 */
export function format(
    template: string,
    variables: Record<string, string | number>
): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }
    return result;
}

// ==================================================
// STATUS TRANSLATIONS
// ==================================================

export const shipmentStatusLabels: Record<Language, Record<string, string>> = {
    fr: {
        DRAFT: 'Brouillon',
        QUOTED: 'Devis envoyé',
        CONFIRMED: 'Confirmé',
        PICKED_UP: 'Collecté',
        IN_TRANSIT: 'En transit',
        OUT_FOR_DELIVERY: 'En livraison',
        DELIVERED: 'Livré',
        CANCELLED: 'Annulé',
    },
    en: {
        DRAFT: 'Draft',
        QUOTED: 'Quote sent',
        CONFIRMED: 'Confirmed',
        PICKED_UP: 'Picked up',
        IN_TRANSIT: 'In transit',
        OUT_FOR_DELIVERY: 'Out for delivery',
        DELIVERED: 'Delivered',
        CANCELLED: 'Cancelled',
    },
};
