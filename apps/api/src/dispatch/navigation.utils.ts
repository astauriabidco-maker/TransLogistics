/**
 * Navigation Utilities
 * 
 * Generate deep links to external navigation apps:
 * - Google Maps
 * - Waze
 * 
 * Supports:
 * - GPS coordinates (lat/lng)
 * - What3Words addresses
 * - Fallback to street address
 */

// ==================================================
// TYPES
// ==================================================

export interface LocationInput {
    lat?: number | null;
    lng?: number | null;
    what3words?: string | null;
    address?: string | null;
}

export interface NavigationLinks {
    googleMaps: string | null;
    waze: string | null;
    appleMaps: string | null;
}

// ==================================================
// LINK GENERATORS
// ==================================================

/**
 * Generate Google Maps directions URL.
 * Format: https://www.google.com/maps/dir/?api=1&destination=...
 */
function buildGoogleMapsUrl(destination: string): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

/**
 * Generate Waze navigation URL.
 * Format: https://waze.com/ul?ll=lat,lng&navigate=yes (for coords)
 * Or: https://waze.com/ul?q=address&navigate=yes (for address)
 */
function buildWazeUrl(lat?: number | null, lng?: number | null, address?: string | null): string {
    if (lat != null && lng != null) {
        return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    }
    if (address) {
        return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
    }
    return '';
}

/**
 * Generate Apple Maps URL (for iOS devices).
 * Format: https://maps.apple.com/?daddr=...
 */
function buildAppleMapsUrl(destination: string): string {
    return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}`;
}

// ==================================================
// WHAT3WORDS SUPPORT
// ==================================================

const W3W_API_KEY = process.env['WHAT3WORDS_API_KEY'];

/**
 * Convert What3Words address to GPS coordinates.
 * Returns null if API key not configured or conversion fails.
 */
export async function convertWhat3WordsToCoords(
    w3w: string
): Promise<{ lat: number; lng: number } | null> {
    if (!W3W_API_KEY) {
        // No API key configured, skip W3W conversion
        return null;
    }

    // Validate W3W format (three.word.address)
    const w3wRegex = /^[a-z]+\.[a-z]+\.[a-z]+$/i;
    if (!w3wRegex.test(w3w.trim())) {
        return null;
    }

    try {
        const response = await fetch(
            `https://api.what3words.com/v3/convert-to-coordinates?words=${encodeURIComponent(w3w)}&key=${W3W_API_KEY}`
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json() as { coordinates?: { lat: number; lng: number } };
        if (data.coordinates) {
            return {
                lat: data.coordinates.lat,
                lng: data.coordinates.lng,
            };
        }
        return null;
    } catch {
        return null;
    }
}

// ==================================================
// MAIN FUNCTION
// ==================================================

/**
 * Generate navigation links for a location.
 * 
 * Priority:
 * 1. GPS coordinates (if provided)
 * 2. What3Words (converted to coords if API key available)
 * 3. Street address (fallback)
 * 
 * Returns null links if no valid location data.
 */
export async function generateNavigationLinks(
    location: LocationInput
): Promise<NavigationLinks> {
    let lat = location.lat;
    let lng = location.lng;
    const address = location.address;

    // Try What3Words if no coordinates
    if ((lat == null || lng == null) && location.what3words) {
        const coords = await convertWhat3WordsToCoords(location.what3words);
        if (coords) {
            lat = coords.lat;
            lng = coords.lng;
        }
    }

    // Build destination string
    let destination: string | null = null;

    if (lat != null && lng != null) {
        destination = `${lat},${lng}`;
    } else if (address) {
        destination = address;
    }

    // Generate links
    if (!destination) {
        return {
            googleMaps: null,
            waze: null,
            appleMaps: null,
        };
    }

    return {
        googleMaps: buildGoogleMapsUrl(destination),
        waze: buildWazeUrl(lat, lng, address),
        appleMaps: buildAppleMapsUrl(destination),
    };
}

/**
 * Synchronous version for when What3Words conversion is not needed.
 * Use this when you already have coordinates.
 */
export function generateNavigationLinksSync(
    location: LocationInput
): NavigationLinks {
    const { lat, lng, address } = location;

    // Build destination string
    let destination: string | null = null;

    if (lat != null && lng != null) {
        destination = `${lat},${lng}`;
    } else if (address) {
        destination = address;
    }

    // Generate links
    if (!destination) {
        return {
            googleMaps: null,
            waze: null,
            appleMaps: null,
        };
    }

    return {
        googleMaps: buildGoogleMapsUrl(destination),
        waze: buildWazeUrl(lat, lng, address),
        appleMaps: buildAppleMapsUrl(destination),
    };
}
