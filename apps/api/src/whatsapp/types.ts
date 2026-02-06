/**
 * WhatsApp Integration Types
 * 
 * Type definitions for WhatsApp Cloud API webhooks,
 * messages, and session state management.
 */

// ==================================================
// WHATSAPP STATE (mirrors Prisma enum)
// ==================================================

export type WhatsAppState =
    | 'INIT'
    | 'CHOIX_SERVICE'
    | 'SCAN_PHOTO'
    | 'CALCUL_PRIX'
    | 'CONFIRMATION'
    | 'PAIEMENT'
    | 'SUIVI';

export const WHATSAPP_STATES: WhatsAppState[] = [
    'INIT',
    'CHOIX_SERVICE',
    'SCAN_PHOTO',
    'CALCUL_PRIX',
    'CONFIRMATION',
    'PAIEMENT',
    'SUIVI',
];

// ==================================================
// SESSION
// ==================================================

export interface WhatsAppSession {
    id: string;
    phoneNumber: string;
    state: WhatsAppState;
    stateData: SessionStateData;
    userId: string | null;
    currentShipmentId: string | null;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date;
}

export interface SessionStateData {
    // CHOIX_SERVICE
    selectedService?: 'ENVOI' | 'SUIVI';

    // SCAN_PHOTO
    scanResultId?: string;
    photoReceived?: boolean;

    // CALCUL_PRIX
    quoteId?: string;
    quotePriceXof?: number;

    // CONFIRMATION
    quoteAccepted?: boolean;

    // PAIEMENT
    paymentMethod?: 'MOBILE_MONEY' | 'CASH';
    paymentId?: string;

    // SUIVI
    trackingCode?: string;

    // General
    lastMessageId?: string;
    retryCount?: number;
    errorMessage?: string;
}

// ==================================================
// WEBHOOK PAYLOADS (WhatsApp Cloud API)
// ==================================================

export interface WhatsAppWebhookPayload {
    object: 'whatsapp_business_account';
    entry: WebhookEntry[];
}

export interface WebhookEntry {
    id: string;
    changes: WebhookChange[];
}

export interface WebhookChange {
    value: WebhookValue;
    field: 'messages';
}

export interface WebhookValue {
    messaging_product: 'whatsapp';
    metadata: {
        display_phone_number: string;
        phone_number_id: string;
    };
    contacts?: WebhookContact[];
    messages?: IncomingMessage[];
    statuses?: MessageStatus[];
}

export interface WebhookContact {
    profile: { name: string };
    wa_id: string;
}

// ==================================================
// INCOMING MESSAGES
// ==================================================

export interface IncomingMessage {
    id: string;
    from: string;
    timestamp: string;
    type: MessageType;
    text?: { body: string };
    image?: MediaMessage;
    interactive?: InteractiveResponse;
    button?: ButtonResponse;
}

export type MessageType =
    | 'text'
    | 'image'
    | 'interactive'
    | 'button'
    | 'document'
    | 'audio'
    | 'video'
    | 'location';

export interface MediaMessage {
    id: string;
    mime_type: string;
    sha256: string;
    caption?: string;
}

export interface InteractiveResponse {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
}

export interface ButtonResponse {
    payload: string;
    text: string;
}

// ==================================================
// MESSAGE STATUS
// ==================================================

export interface MessageStatus {
    id: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
    recipient_id: string;
    errors?: MessageError[];
}

export interface MessageError {
    code: number;
    title: string;
    message: string;
}

// ==================================================
// OUTGOING MESSAGES
// ==================================================

export interface OutgoingTextMessage {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'text';
    text: { body: string };
}

export interface OutgoingInteractiveMessage {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'interactive';
    interactive: InteractiveContent;
}

export interface InteractiveContent {
    type: 'button' | 'list';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: InteractiveAction;
}

export interface InteractiveAction {
    buttons?: InteractiveButton[];
    button?: string;
    sections?: ListSection[];
}

export interface InteractiveButton {
    type: 'reply';
    reply: { id: string; title: string };
}

export interface ListSection {
    title: string;
    rows: ListRow[];
}

export interface ListRow {
    id: string;
    title: string;
    description?: string;
}

// ==================================================
// HANDLER CONTEXT
// ==================================================

export interface HandlerContext {
    session: WhatsAppSession;
    message: IncomingMessage;
    phoneNumber: string;
    userName?: string;
}

export interface HandlerResult {
    nextState: WhatsAppState;
    stateData: Partial<SessionStateData>;
    responses: OutgoingMessage[];
}

export type OutgoingMessage = OutgoingTextMessage | OutgoingInteractiveMessage;

// ==================================================
// STATE HANDLER INTERFACE
// ==================================================

export interface StateHandler {
    state: WhatsAppState;
    handle(ctx: HandlerContext): Promise<HandlerResult>;
    canHandle(ctx: HandlerContext): boolean;
}
