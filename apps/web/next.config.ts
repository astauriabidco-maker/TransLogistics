import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
    // Enable React strict mode
    reactStrictMode: true,

    // Output standalone for Docker deployments
    output: 'standalone',

    // Experimental features
    experimental: {
        // Enable typed routes
        typedRoutes: true,
    },

    // Environment variables exposed to the client
    env: {
        NEXT_PUBLIC_APP_NAME: 'TransLogistics',
        NEXT_PUBLIC_APP_VERSION: '0.1.0',
    },

    // Redirects (placeholder)
    async redirects() {
        return [];
    },

    // Headers for security
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                ],
            },
        ];
    },
};

export default nextConfig;
