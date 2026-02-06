/**
 * Design Tokens
 * 
 * Centralized design system values for consistent styling.
 */

export const colors = {
    primary: {
        50: '#e6f0ff',
        100: '#b3d1ff',
        200: '#80b3ff',
        300: '#4d94ff',
        400: '#1a75ff',
        500: '#0066cc', // Main
        600: '#0052a3',
        700: '#003d7a',
        800: '#002952',
        900: '#001429',
    },
    gray: {
        50: '#f8f9fa',
        100: '#e9ecef',
        200: '#dee2e6',
        300: '#ced4da',
        400: '#adb5bd',
        500: '#6c757d',
        600: '#495057',
        700: '#343a40',
        800: '#212529',
        900: '#121416',
    },
    success: '#28a745',
    warning: '#ffc107',
    error: '#dc3545',
    info: '#17a2b8',
} as const;

export const spacing = {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    '2xl': '48px',
    '3xl': '64px',
} as const;

export const typography = {
    fontFamily: {
        sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        mono: 'Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
    },
    fontSize: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '2rem',
        '4xl': '2.5rem',
    },
    fontWeight: {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
    },
} as const;

export const borderRadius = {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px',
} as const;

export const shadows = {
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.1)',
} as const;

export const transitions = {
    fast: '150ms ease',
    normal: '300ms ease',
    slow: '500ms ease',
} as const;
