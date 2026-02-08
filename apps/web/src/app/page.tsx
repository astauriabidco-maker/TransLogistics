/**
 * TransLogistics Landing Page V3
 * 
 * Vibrant, Modern, Engaging Design
 * Dynamic gradients, smooth animations, premium feel
 */

import Link from 'next/link';

// Placeholders
const WHATSAPP_LINK = 'https://wa.me/237600000000?text=Bonjour%2C%20je%20souhaite%20un%20devis.';
const CONTACT_EMAIL = 'mailto:contact@translogistics.com';

export default function HomePage() {
    return (
        <main className="min-h-screen bg-white overflow-hidden">
            {/* ==================== HEADER ==================== */}
            <header className="fixed top-0 left-0 right-0 z-50">
                <div className="mx-4 mt-4">
                    <div className="glass-dark rounded-2xl max-w-6xl mx-auto px-6">
                        <div className="flex items-center justify-between h-16">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                                    <span className="text-white text-sm font-bold">TL</span>
                                </div>
                                <span className="font-bold text-white text-lg">TransLogistics</span>
                            </div>
                            <nav className="hidden md:flex items-center gap-8 text-sm">
                                <a href="#services" className="text-white/70 hover:text-white transition-colors">Services</a>
                                <a href="#processus" className="text-white/70 hover:text-white transition-colors">Processus</a>
                                <a href="#faq" className="text-white/70 hover:text-white transition-colors">FAQ</a>
                            </nav>
                            <Link href={WHATSAPP_LINK} className="btn-whatsapp text-sm py-2.5 px-5">
                                Demander un devis
                            </Link>
                        </div>
                    </div>
                </div>
            </header>

            {/* ==================== HERO ==================== */}
            <section className="hero-gradient relative min-h-screen flex items-center ">
                <div className="hero-gradient-overlay absolute inset-0" />

                {/* Floating Shapes */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute top-20 left-10 w-72 h-72 bg-orange-500/20 rounded-full blur-3xl animate-float" />
                    <div className="absolute top-40 right-20 w-96 h-96 bg-cyan-400/20 rounded-full blur-3xl animate-float stagger-2" />
                    <div className="absolute bottom-20 left-1/3 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-float stagger-3" />
                </div>

                <div className="relative z-10 max-w-6xl mx-auto px-6 py-32 pt-40">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div className="animate-slide-up">
                            <div className="inline-flex items-center gap-2 px-4 py-2 glass rounded-full text-sm text-white/90 mb-8">
                                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                                En opération sur 3 continents
                            </div>
                            <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold text-white leading-tight">
                                Expédiez{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-300 to-yellow-300">
                                    sans stress
                                </span>
                            </h1>
                            <p className="mt-6 text-xl text-white/80 leading-relaxed max-w-xl">
                                Plateforme logistique nouvelle génération pour l'Afrique.
                                Mesure IA, suivi WhatsApp, paiement Mobile Money.
                            </p>
                            <div className="mt-10 flex flex-col sm:flex-row gap-4">
                                <Link href={WHATSAPP_LINK} className="btn-whatsapp inline-flex items-center justify-center gap-3">
                                    <WhatsAppIcon className="w-5 h-5" />
                                    Obtenir un devis gratuit
                                </Link>
                                <a href="#processus" className="btn-outline inline-flex items-center justify-center">
                                    Comment ça marche ?
                                </a>
                            </div>
                        </div>

                        {/* Hero Visual */}
                        <div className="hidden lg:block animate-slide-up stagger-2">
                            <div className="relative">
                                {/* Main Card */}
                                <div className="glass-card rounded-3xl p-8 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                                    <div className="flex items-center gap-4 mb-6">
                                        <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-500 rounded-2xl flex items-center justify-center text-2xl shadow-lg">
                                            📦
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900">Colis #TL-2024-7842</div>
                                            <div className="text-sm text-gray-500">France → Cameroun</div>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                                <span className="text-green-600">✓</span>
                                            </div>
                                            <span className="text-gray-700">Scanné par IA</span>
                                            <span className="ml-auto text-sm text-gray-400">Il y a 2h</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                                                <span className="text-green-600">✓</span>
                                            </div>
                                            <span className="text-gray-700">Devis accepté</span>
                                            <span className="ml-auto text-sm text-gray-400">Il y a 1h</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center animate-pulse">
                                                <span className="text-orange-600">→</span>
                                            </div>
                                            <span className="text-gray-700 font-medium">En transit</span>
                                            <span className="ml-auto text-sm text-orange-500">En cours</span>
                                        </div>
                                    </div>
                                    <div className="mt-6 pt-6 border-t border-gray-100">
                                        <div className="flex justify-between text-sm">
                                            <span className="text-gray-500">Arrivée estimée</span>
                                            <span className="font-bold text-gray-900">12 Février 2024</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Floating Stats */}
                                <div className="absolute -bottom-4 -left-8 glass-card rounded-2xl px-5 py-3 shadow-2xl animate-float">
                                    <div className="text-2xl font-bold text-orange-500">+12%</div>
                                    <div className="text-xs text-gray-500">économies</div>
                                </div>
                                <div className="absolute -top-4 -right-8 glass-card rounded-2xl px-5 py-3 shadow-2xl animate-float stagger-2">
                                    <div className="text-2xl font-bold text-green-500">4.9★</div>
                                    <div className="text-xs text-gray-500">satisfaction</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Stats Row */}
                    <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6">
                        {[
                            { number: '50K+', label: 'Colis livrés' },
                            { number: '3', label: 'Continents' },
                            { number: '< 24h', label: 'Réponse devis' },
                            { number: '99.5%', label: 'Livraison à temps' },
                        ].map((stat, i) => (
                            <div key={i} className="stat-card animate-slide-up" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
                                <div className="text-3xl font-bold text-gray-900">{stat.number}</div>
                                <div className="text-sm text-gray-600 mt-1">{stat.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ==================== SERVICES ==================== */}
            <section id="services" className="py-24 px-6 bg-gradient-to-b from-slate-50 to-white">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <span className="inline-block px-4 py-1.5 bg-orange-100 text-orange-600 rounded-full text-sm font-medium mb-4">
                            Nos Services
                        </span>
                        <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                            Tout ce qu'il faut pour{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-red-500">
                                expédier malin
                            </span>
                        </h2>
                        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                            Une plateforme complète qui simplifie chaque étape de votre logistique internationale.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <FeatureCard
                            icon="📸"
                            title="VolumeScan AI"
                            description="Mesurez vos colis en 10 secondes avec une simple photo. Facturation précise, pas de disputes."
                            gradient="from-blue-500 to-cyan-500"
                        />
                        <FeatureCard
                            icon="💬"
                            title="WhatsApp Flow"
                            description="Devis, paiement, suivi - tout sur WhatsApp. Pas d'app à télécharger, pas de compte à créer."
                            gradient="from-green-500 to-emerald-500"
                        />
                        <FeatureCard
                            icon="🛒"
                            title="Shop & Ship"
                            description="On achète pour vous en Chine ou Europe. Consolidation intelligente pour économiser."
                            gradient="from-purple-500 to-pink-500"
                        />
                        <FeatureCard
                            icon="🚚"
                            title="Livraison Tracée"
                            description="GPS en temps réel. Photo de livraison. Signature électronique. Zéro doute."
                            gradient="from-orange-500 to-red-500"
                        />
                    </div>
                </div>
            </section>

            {/* ==================== PROCESS ==================== */}
            <section id="processus" className="py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="grid lg:grid-cols-2 gap-16 items-center">
                        <div>
                            <span className="inline-block px-4 py-1.5 bg-blue-100 text-blue-600 rounded-full text-sm font-medium mb-4">
                                Comment ça marche
                            </span>
                            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                                4 étapes,{' '}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-500">
                                    zéro prise de tête
                                </span>
                            </h2>
                            <p className="text-xl text-gray-600 mb-12">
                                De la photo à la livraison, on s'occupe de tout.
                            </p>

                            <div className="space-y-12">
                                <ProcessStep
                                    number="1"
                                    title="Photographiez votre colis"
                                    description="Avec une feuille A4 à côté. Notre IA calcule les dimensions automatiquement."
                                />
                                <ProcessStep
                                    number="2"
                                    title="Recevez votre devis"
                                    description="Prix fixe basé sur le volume réel. Validez en un clic sur WhatsApp."
                                />
                                <ProcessStep
                                    number="3"
                                    title="Payez comme vous voulez"
                                    description="Mobile Money, carte bancaire, ou en agence. Transaction sécurisée."
                                />
                                <ProcessStep
                                    number="4"
                                    title="Suivez et recevez"
                                    description="Notifications à chaque étape. Photo de livraison avec signature."
                                />
                            </div>
                        </div>

                        {/* Visual */}
                        <div className="hidden lg:block">
                            <div className="relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-3xl transform rotate-3" />
                                <div className="relative bg-white rounded-3xl p-8 shadow-2xl border border-gray-100">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4 p-4 bg-green-50 rounded-2xl border border-green-100">
                                            <div className="w-12 h-12 bg-green-500 rounded-xl flex items-center justify-center text-white text-xl">✓</div>
                                            <div>
                                                <div className="font-semibold text-gray-900">Scan validé</div>
                                                <div className="text-sm text-gray-500">Dimensions: 45 × 35 × 20 cm</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 p-4 bg-blue-50 rounded-2xl border border-blue-100">
                                            <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white text-xl">💰</div>
                                            <div>
                                                <div className="font-semibold text-gray-900">Devis: 45,000 XOF</div>
                                                <div className="text-sm text-gray-500">Paris → Douala • 7-10 jours</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 p-4 bg-orange-50 rounded-2xl border border-orange-100">
                                            <div className="w-12 h-12 bg-orange-500 rounded-xl flex items-center justify-center text-white text-xl">🚚</div>
                                            <div>
                                                <div className="font-semibold text-gray-900">En transit</div>
                                                <div className="text-sm text-gray-500">Arrivée estimée: 15 Feb</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ==================== COVERAGE ==================== */}
            <section className="py-24 px-6 bg-gray-900 text-white">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-16">
                        <span className="inline-block px-4 py-1.5 bg-white/10 text-white/90 rounded-full text-sm font-medium mb-4">
                            Couverture
                        </span>
                        <h2 className="text-4xl md:text-5xl font-bold mb-6">
                            Vos{' '}
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-yellow-400">
                                corridors
                            </span>{' '}
                            préférés
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-6">
                        <RouteCard
                            emoji="🇫🇷"
                            route="Europe → Afrique"
                            from="France (Paris, Lyon, Marseille)"
                            to="Afrique de l'Ouest & Centrale"
                            time="7-12 jours"
                        />
                        <RouteCard
                            emoji="🇨🇳"
                            route="Chine → Afrique"
                            from="Guangzhou, Shenzhen, Yiwu"
                            to="Afrique de l'Ouest & Centrale"
                            time="15-25 jours"
                        />
                        <RouteCard
                            emoji="🇨🇲"
                            route="Local Cameroun"
                            from="Douala, Yaoundé"
                            to="Toutes régions"
                            time="1-3 jours"
                        />
                    </div>
                </div>
            </section>

            {/* ==================== FAQ ==================== */}
            <section id="faq" className="py-24 px-6">
                <div className="max-w-3xl mx-auto">
                    <div className="text-center mb-16">
                        <span className="inline-block px-4 py-1.5 bg-purple-100 text-purple-600 rounded-full text-sm font-medium mb-4">
                            FAQ
                        </span>
                        <h2 className="text-4xl font-bold text-gray-900">
                            Questions fréquentes
                        </h2>
                    </div>

                    <div className="space-y-4">
                        <FAQItem
                            question="Comment fonctionne la mesure IA ?"
                            answer="Photographiez votre colis avec une feuille A4 visible. Notre IA utilise la feuille comme référence pour calculer les dimensions exactes en quelques secondes. Précision garantie."
                        />
                        <FAQItem
                            question="Quels moyens de paiement acceptez-vous ?"
                            answer="Mobile Money (Orange, MTN, Wave), cartes bancaires (Visa, Mastercard), et espèces dans nos agences partenaires."
                        />
                        <FAQItem
                            question="Comment suivre mon colis ?"
                            answer="Vous recevez des notifications WhatsApp automatiques à chaque étape. Vous pouvez aussi demander le statut à tout moment en envoyant 'Suivi' suivi de votre numéro de colis."
                        />
                        <FAQItem
                            question="Proposez-vous des tarifs B2B ?"
                            answer="Oui ! Tarifs négociés, facturation mensuelle, et intégration API disponibles pour les professionnels. Contactez-nous via le formulaire B2B."
                        />
                    </div>
                </div>
            </section>

            {/* ==================== CTA ==================== */}
            <section className="py-24 px-6">
                <div className="max-w-4xl mx-auto">
                    <div className="bg-gradient-to-br from-orange-500 via-red-500 to-pink-500 rounded-3xl p-12 md:p-16 text-center text-white relative overflow-hidden">
                        {/* Background decoration */}
                        <div className="absolute inset-0 overflow-hidden">
                            <div className="absolute -top-20 -right-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                        </div>

                        <div className="relative z-10">
                            <h2 className="text-4xl md:text-5xl font-bold mb-6">
                                Prêt à expédier ?
                            </h2>
                            <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
                                Obtenez votre devis gratuit en moins de 2 minutes sur WhatsApp.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-4 justify-center">
                                <Link href={WHATSAPP_LINK} className="inline-flex items-center justify-center gap-3 bg-white text-gray-900 font-bold px-8 py-4 rounded-xl hover:bg-gray-100 transition-all hover:scale-105 shadow-xl">
                                    <WhatsAppIcon className="w-6 h-6 text-green-600" />
                                    Démarrer sur WhatsApp
                                </Link>
                                <a href="#contact" className="inline-flex items-center justify-center px-8 py-4 rounded-xl font-bold border-2 border-white/40 hover:bg-white/10 transition-colors">
                                    Contact B2B
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ==================== FOOTER ==================== */}
            <footer className="py-16 px-6 bg-gray-900 text-white">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl flex items-center justify-center">
                                <span className="text-white text-sm font-bold">TL</span>
                            </div>
                            <span className="font-bold text-xl">TransLogistics</span>
                        </div>
                        <nav className="flex items-center gap-8 text-sm text-gray-400">
                            <a href="#services" className="hover:text-white transition-colors">Services</a>
                            <a href="#processus" className="hover:text-white transition-colors">Processus</a>
                            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
                            <a href={CONTACT_EMAIL} className="hover:text-white transition-colors">Contact</a>
                        </nav>
                    </div>
                    <div className="mt-12 pt-8 border-t border-gray-800 text-center text-sm text-gray-500">
                        © {new Date().getFullYear()} TransLogistics. Tous droits réservés.
                    </div>
                </div>
            </footer>
        </main>
    );
}

// ==================================================
// COMPONENTS
// ==================================================

function FeatureCard({ icon, title, description, gradient }: { icon: string; title: string; description: string; gradient: string }) {
    return (
        <div className="feature-card group">
            <div className={`w-14 h-14 bg-gradient-to-br ${gradient} rounded-2xl flex items-center justify-center text-2xl mb-5 shadow-lg group-hover:scale-110 transition-transform`}>
                {icon}
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-3">{title}</h3>
            <p className="text-gray-600 leading-relaxed">{description}</p>
        </div>
    );
}

function ProcessStep({ number, title, description }: { number: string; title: string; description: string }) {
    return (
        <div className="process-step">
            <div className="step-number">{number}</div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
            <p className="text-gray-600">{description}</p>
        </div>
    );
}

function RouteCard({ emoji, route, from, to, time }: { emoji: string; route: string; from: string; to: string; time: string }) {
    return (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 hover:bg-white/10 transition-colors">
            <div className="text-4xl mb-4">{emoji}</div>
            <h3 className="text-xl font-bold mb-4">{route}</h3>
            <div className="space-y-2 text-sm text-gray-400">
                <div><span className="text-gray-500">De:</span> {from}</div>
                <div><span className="text-gray-500">Vers:</span> {to}</div>
                <div className="pt-2 border-t border-white/10">
                    <span className="text-orange-400 font-medium">{time}</span>
                </div>
            </div>
        </div>
    );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
    return (
        <details className="group bg-gray-50 rounded-2xl overflow-hidden">
            <summary className="flex items-center justify-between cursor-pointer list-none p-6">
                <span className="font-semibold text-gray-900 pr-4">{question}</span>
                <span className="text-orange-500 group-open:rotate-180 transition-transform flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </span>
            </summary>
            <p className="px-6 pb-6 text-gray-600 leading-relaxed">{answer}</p>
        </details>
    );
}

function WhatsAppIcon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
    );
}
