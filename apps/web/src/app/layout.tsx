import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
    title: 'TransLogistics | Expédition Europe-Afrique & Chine-Afrique',
    description: 'Plateforme logistique professionnelle pour vos envois Europe-Afrique et Chine-Afrique. Devis instantané, paiement mobile, suivi en temps réel.',
    keywords: ['logistique', 'expédition', 'afrique', 'colis', 'fret', 'cameroun', 'france', 'chine'],
    openGraph: {
        title: 'TransLogistics | Expédition Europe-Afrique & Chine-Afrique',
        description: 'Plateforme logistique professionnelle pour vos envois Europe-Afrique et Chine-Afrique.',
        type: 'website',
        locale: 'fr_FR',
    },
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="fr">
            <body className="bg-white text-gray-900 antialiased">
                {children}
            </body>
        </html>
    );
}
