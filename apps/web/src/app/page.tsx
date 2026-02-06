/**
 * TransLogistics Landing Page
 * 
 * Premium, enterprise-grade landing page.
 * Trust-driven, minimalist, professional.
 * 
 * V2: Social proof, visual hero, contact form, FAQ
 */

import Link from 'next/link';

// Placeholders
const WHATSAPP_LINK = 'https://wa.me/237600000000?text=Bonjour%2C%20je%20souhaite%20un%20devis.';
const CONTACT_EMAIL = 'mailto:contact@translogistics.com';

export default function HomePage() {
    return (
        <main className="min-h-screen bg-white">
            {/* ==================== HEADER ==================== */}
            <header className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-slate-100">
                <div className="max-w-6xl mx-auto px-6">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                                <span className="text-white text-sm font-bold">TL</span>
                            </div>
                            <span className="font-semibold text-slate-900">TransLogistics</span>
                        </div>
                        <nav className="hidden md:flex items-center gap-8 text-sm">
                            <a href="#capacites" className="text-slate-600 hover:text-slate-900 transition-colors">Capacités</a>
                            <a href="#processus" className="text-slate-600 hover:text-slate-900 transition-colors">Processus</a>
                            <a href="#faq" className="text-slate-600 hover:text-slate-900 transition-colors">FAQ</a>
                        </nav>
                        <Link
                            href={WHATSAPP_LINK}
                            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            Demander un devis
                        </Link>
                    </div>
                </div>
            </header>

            {/* ==================== HERO ==================== */}
            <section className="pt-32 pb-24 px-6">
                <div className="max-w-6xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-sm text-slate-600 mb-6">
                            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                            En opération depuis 2024
                        </div>
                        <h1 className="text-4xl md:text-5xl font-semibold text-slate-900 leading-tight tracking-tight">
                            Logistique internationale,<br />
                            facturée avec précision.
                        </h1>
                        <p className="mt-6 text-xl text-slate-600 leading-relaxed">
                            Plateforme opérationnelle pour l'expédition Europe-Afrique et Chine-Afrique.
                            Mesure volumétrique par IA. Expérience client via WhatsApp.
                            Contrôle total sur vos opérations.
                        </p>
                        <div className="mt-8 flex flex-col sm:flex-row gap-4">
                            <Link
                                href={WHATSAPP_LINK}
                                className="inline-flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1da851] text-white px-6 py-3.5 rounded-lg font-medium transition-colors"
                            >
                                <WhatsAppIcon className="w-5 h-5" />
                                Demander un devis sur WhatsApp
                            </Link>
                            <a
                                href="#contact"
                                className="inline-flex items-center justify-center px-6 py-3.5 rounded-lg font-medium text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                            >
                                Contacter l'équipe
                            </a>
                        </div>
                    </div>

                    {/* Visual: Abstract Flow Diagram */}
                    <div className="hidden lg:block">
                        <div className="relative bg-slate-50 rounded-2xl p-8 border border-slate-100">
                            <div className="flex items-center justify-between">
                                <FlowStep icon="📦" label="Colis" />
                                <FlowArrow />
                                <FlowStep icon="📸" label="Scan IA" highlight />
                                <FlowArrow />
                                <FlowStep icon="💬" label="Devis" />
                                <FlowArrow />
                                <FlowStep icon="✓" label="Livré" />
                            </div>
                            <div className="mt-8 grid grid-cols-3 gap-4 text-center text-sm">
                                <div className="bg-white rounded-lg p-4 border border-slate-100">
                                    <div className="text-2xl font-semibold text-slate-900">3</div>
                                    <div className="text-slate-500">Hubs actifs</div>
                                </div>
                                <div className="bg-white rounded-lg p-4 border border-slate-100">
                                    <div className="text-2xl font-semibold text-slate-900">2</div>
                                    <div className="text-slate-500">Corridors</div>
                                </div>
                                <div className="bg-white rounded-lg p-4 border border-slate-100">
                                    <div className="text-2xl font-semibold text-slate-900">24h</div>
                                    <div className="text-slate-500">Réponse devis</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ==================== VALUE PILLARS ==================== */}
            <section className="py-20 px-6 bg-slate-50">
                <div className="max-w-6xl mx-auto">
                    <div className="grid md:grid-cols-3 gap-8">
                        <PillarCard
                            number="01"
                            title="Précision tarifaire"
                            description="Mesure volumétrique automatisée par IA. Chaque colis est scanné, mesuré et facturé sur des données objectives."
                        />
                        <PillarCard
                            number="02"
                            title="Contrôle opérationnel"
                            description="Multi-hub, traçabilité complète, historique conservé. Chaque étape est enregistrée et auditable."
                        />
                        <PillarCard
                            number="03"
                            title="Simplicité client"
                            description="Devis et suivi via WhatsApp. Paiement Mobile Money ou carte. Onboarding en quelques minutes."
                        />
                    </div>
                </div>
            </section>

            {/* ==================== CAPABILITIES ==================== */}
            <section id="capacites" className="py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-16">
                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Capacités</p>
                        <h2 className="text-3xl font-semibold text-slate-900">
                            Infrastructure logistique intégrée
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-2 gap-12">
                        <CapabilityCard
                            title="VolumeScan AI"
                            description="Mesure volumétrique automatique à partir d'une photo. Référence A4 pour calibration. Résultat en secondes."
                            benefit="Facturation précise, disputes minimisées, confiance établie."
                        />
                        <CapabilityCard
                            title="Expérience WhatsApp"
                            description="Interface conversationnelle native. Devis instantané, confirmation de paiement, notifications de suivi."
                            benefit="Accessibilité maximale, adoption rapide, friction réduite."
                        />
                        <CapabilityCard
                            title="Shop & Ship"
                            description="Service d'achat pour compte. Consolidation des commandes. Gestion des fournisseurs internationaux."
                            benefit="Accès aux produits internationaux, optimisation des volumes."
                        />
                        <CapabilityCard
                            title="Smart Dispatch"
                            description="Affectation des tournées. Chauffeurs connectés. Preuve de livraison photographique."
                            benefit="Visibilité terrain, responsabilité tracée, clients informés."
                        />
                    </div>
                </div>
            </section>

            {/* ==================== PROCESS ==================== */}
            <section id="processus" className="py-24 px-6 bg-slate-900 text-white">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-16">
                        <p className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">Processus</p>
                        <h2 className="text-3xl font-semibold">
                            Fonctionnement standard
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-4 gap-8">
                        <ProcessStep
                            step="1"
                            title="Réception & scan"
                            description="Le colis est reçu, photographié avec référence A4, mesuré automatiquement."
                        />
                        <ProcessStep
                            step="2"
                            title="Calcul & validation"
                            description="Le tarif est calculé selon volume réel. Le client reçoit et confirme le devis."
                        />
                        <ProcessStep
                            step="3"
                            title="Paiement sécurisé"
                            description="Mobile Money, carte bancaire ou paiement en agence. Transaction enregistrée."
                        />
                        <ProcessStep
                            step="4"
                            title="Transport & preuve"
                            description="Acheminement tracé. Livraison avec photo et signature. Historique conservé."
                        />
                    </div>
                </div>
            </section>

            {/* ==================== COVERAGE ==================== */}
            <section id="couverture" className="py-24 px-6">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-16">
                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Couverture</p>
                        <h2 className="text-3xl font-semibold text-slate-900">
                            Corridors opérationnels
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        <CoverageCard
                            route="Europe → Afrique"
                            origin="France (Paris, Lyon, Marseille)"
                            destination="Afrique de l'Ouest et Centrale"
                        />
                        <CoverageCard
                            route="Chine → Afrique"
                            origin="Guangzhou, Shenzhen, Yiwu"
                            destination="Afrique de l'Ouest et Centrale"
                        />
                        <CoverageCard
                            route="Cameroun"
                            origin="Hubs Douala & Yaoundé"
                            destination="Distribution locale"
                        />
                    </div>

                    <p className="mt-12 text-slate-500 text-sm">
                        Architecture multi-hub extensible. Nouvelles destinations ajoutées selon la demande opérationnelle.
                    </p>
                </div>
            </section>

            {/* ==================== TRUST & GOVERNANCE ==================== */}
            <section className="py-24 px-6 bg-slate-50">
                <div className="max-w-6xl mx-auto">
                    <div className="mb-16">
                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Gouvernance</p>
                        <h2 className="text-3xl font-semibold text-slate-900">
                            Confiance et transparence
                        </h2>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                        <TrustCard
                            title="Tarification immuable"
                            description="Une fois le devis validé, le prix est figé. Pas de surfacturation."
                        />
                        <TrustCard
                            title="Paiements sécurisés"
                            description="Intégration Mobile Money et Stripe. Transactions tracées et vérifiables."
                        />
                        <TrustCard
                            title="Historique auditable"
                            description="Chaque scan, paiement et livraison est enregistré avec horodatage."
                        />
                        <TrustCard
                            title="Support humain"
                            description="Une équipe réelle répond aux questions. Pas de chatbot sans issue."
                        />
                    </div>
                </div>
            </section>

            {/* ==================== FAQ ==================== */}
            <section id="faq" className="py-24 px-6">
                <div className="max-w-3xl mx-auto">
                    <div className="mb-12 text-center">
                        <p className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">FAQ</p>
                        <h2 className="text-3xl font-semibold text-slate-900">
                            Questions fréquentes
                        </h2>
                    </div>

                    <div className="space-y-6">
                        <FAQItem
                            question="Comment fonctionne la mesure volumétrique ?"
                            answer="Vous photographiez votre colis avec une feuille A4 visible à côté. Notre IA calcule automatiquement les dimensions en utilisant la feuille comme référence. Le résultat est disponible en quelques secondes."
                        />
                        <FAQItem
                            question="Quels modes de paiement acceptez-vous ?"
                            answer="Nous acceptons Mobile Money (Orange Money, MTN Money), les cartes bancaires via Stripe, et le paiement en espèces dans nos agences partenaires."
                        />
                        <FAQItem
                            question="Comment suivre mon colis ?"
                            answer="Vous recevez des notifications automatiques sur WhatsApp à chaque étape : réception, départ, arrivée hub destination, et livraison. Vous pouvez aussi demander le statut à tout moment par message."
                        />
                        <FAQItem
                            question="Quels sont les délais de livraison ?"
                            answer="Les délais varient selon la destination et le mode de transport (aérien ou maritime). Pour le fret aérien Europe-Cameroun, comptez 7-10 jours ouvrés. Un délai estimé est fourni avec chaque devis."
                        />
                        <FAQItem
                            question="Travaillez-vous avec des entreprises ?"
                            answer="Oui, nous proposons des conditions adaptées aux professionnels : tarifs négociés, facturation mensuelle, API d'intégration. Contactez-nous via le formulaire B2B ci-dessous."
                        />
                    </div>
                </div>
            </section>

            {/* ==================== CONTACT FORM (B2B) ==================== */}
            <section id="contact" className="py-24 px-6 bg-slate-900 text-white">
                <div className="max-w-4xl mx-auto">
                    <div className="grid md:grid-cols-2 gap-12">
                        <div>
                            <p className="text-sm font-medium text-slate-400 uppercase tracking-wide mb-3">Contact B2B</p>
                            <h2 className="text-3xl font-semibold mb-6">
                                Vous êtes une entreprise ?
                            </h2>
                            <p className="text-slate-400 mb-8">
                                Tarifs négociés, facturation mensuelle, intégration API.
                                Parlons de vos besoins logistiques.
                            </p>
                            <div className="space-y-4 text-sm">
                                <div className="flex items-center gap-3">
                                    <span className="text-slate-500">Email:</span>
                                    <a href={CONTACT_EMAIL} className="text-white hover:underline">contact@translogistics.com</a>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-slate-500">WhatsApp:</span>
                                    <Link href={WHATSAPP_LINK} className="text-white hover:underline">+237 6 00 00 00 00</Link>
                                </div>
                            </div>
                        </div>

                        <div className="bg-slate-800 rounded-xl p-6">
                            <form className="space-y-4" action={CONTACT_EMAIL} method="GET">
                                <div>
                                    <label htmlFor="company" className="block text-sm text-slate-400 mb-1.5">Entreprise</label>
                                    <input
                                        type="text"
                                        id="company"
                                        name="company"
                                        className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
                                        placeholder="Nom de l'entreprise"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="email" className="block text-sm text-slate-400 mb-1.5">Email</label>
                                    <input
                                        type="email"
                                        id="email"
                                        name="email"
                                        className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
                                        placeholder="vous@entreprise.com"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="volume" className="block text-sm text-slate-400 mb-1.5">Volume estimé / mois</label>
                                    <select
                                        id="volume"
                                        name="volume"
                                        className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-slate-500"
                                    >
                                        <option value="">Sélectionner</option>
                                        <option value="1-10">1-10 colis</option>
                                        <option value="10-50">10-50 colis</option>
                                        <option value="50-200">50-200 colis</option>
                                        <option value="200+">200+ colis</option>
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="message" className="block text-sm text-slate-400 mb-1.5">Message</label>
                                    <textarea
                                        id="message"
                                        name="body"
                                        rows={3}
                                        className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-slate-500 resize-none"
                                        placeholder="Décrivez vos besoins..."
                                    ></textarea>
                                </div>
                                <button
                                    type="submit"
                                    className="w-full bg-white text-slate-900 py-3 rounded-lg font-medium hover:bg-slate-100 transition-colors"
                                >
                                    Envoyer la demande
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </section>

            {/* ==================== FINAL CTA ==================== */}
            <section className="py-24 px-6 border-t border-slate-100">
                <div className="max-w-2xl mx-auto text-center">
                    <h2 className="text-2xl font-semibold text-slate-900 mb-4">
                        Prêt à expédier ?
                    </h2>
                    <p className="text-slate-600 mb-8">
                        Obtenez un devis pour votre prochaine expédition.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        <Link
                            href={WHATSAPP_LINK}
                            className="inline-flex items-center justify-center gap-3 bg-[#25D366] hover:bg-[#1da851] text-white px-6 py-3.5 rounded-lg font-medium transition-colors"
                        >
                            <WhatsAppIcon className="w-5 h-5" />
                            WhatsApp
                        </Link>
                        <a
                            href="#contact"
                            className="inline-flex items-center justify-center px-6 py-3.5 rounded-lg font-medium text-slate-700 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors"
                        >
                            Contact B2B
                        </a>
                    </div>
                </div>
            </section>

            {/* ==================== FOOTER ==================== */}
            <footer className="py-12 px-6 bg-slate-900 text-slate-400">
                <div className="max-w-6xl mx-auto">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                                <span className="text-white text-sm font-bold">TL</span>
                            </div>
                            <span className="font-medium text-white">TransLogistics</span>
                        </div>
                        <nav className="flex items-center gap-6 text-sm">
                            <a href="#capacites" className="hover:text-white transition-colors">Capacités</a>
                            <a href="#processus" className="hover:text-white transition-colors">Processus</a>
                            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
                            <a href="#contact" className="hover:text-white transition-colors">Contact</a>
                        </nav>
                    </div>
                    <div className="mt-8 pt-8 border-t border-slate-800 text-center text-sm">
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

function FlowStep({ icon, label, highlight }: { icon: string; label: string; highlight?: boolean }) {
    return (
        <div className={`flex flex-col items-center gap-2 ${highlight ? 'scale-110' : ''}`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${highlight ? 'bg-blue-100 ring-2 ring-blue-500' : 'bg-white border border-slate-200'}`}>
                {icon}
            </div>
            <span className={`text-xs font-medium ${highlight ? 'text-blue-600' : 'text-slate-600'}`}>{label}</span>
        </div>
    );
}

function FlowArrow() {
    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="w-full h-px bg-slate-300 relative">
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 border-l-4 border-l-slate-300 border-y-4 border-y-transparent"></div>
            </div>
        </div>
    );
}

function PillarCard({ number, title, description }: { number: string; title: string; description: string }) {
    return (
        <div className="p-8">
            <div className="text-sm font-medium text-slate-400 mb-4">{number}</div>
            <h3 className="text-xl font-semibold text-slate-900 mb-3">{title}</h3>
            <p className="text-slate-600 leading-relaxed">{description}</p>
        </div>
    );
}

function CapabilityCard({ title, description, benefit }: { title: string; description: string; benefit: string }) {
    return (
        <div className="border-l-2 border-slate-200 pl-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
            <p className="text-slate-600 mb-4">{description}</p>
            <p className="text-sm text-slate-500 italic">{benefit}</p>
        </div>
    );
}

function ProcessStep({ step, title, description }: { step: string; title: string; description: string }) {
    return (
        <div>
            <div className="text-3xl font-semibold text-slate-500 mb-4">{step}</div>
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
        </div>
    );
}

function CoverageCard({ route, origin, destination }: { route: string; origin: string; destination: string }) {
    return (
        <div className="p-6 bg-white border border-slate-200 rounded-lg">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">{route}</h3>
            <div className="space-y-2 text-sm">
                <div>
                    <span className="text-slate-500">Origine:</span>
                    <span className="ml-2 text-slate-700">{origin}</span>
                </div>
                <div>
                    <span className="text-slate-500">Destination:</span>
                    <span className="ml-2 text-slate-700">{destination}</span>
                </div>
            </div>
        </div>
    );
}

function TrustCard({ title, description }: { title: string; description: string }) {
    return (
        <div>
            <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{description}</p>
        </div>
    );
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
    return (
        <details className="group border-b border-slate-200 pb-6">
            <summary className="flex items-center justify-between cursor-pointer list-none">
                <span className="font-medium text-slate-900">{question}</span>
                <span className="text-slate-400 group-open:rotate-180 transition-transform">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </span>
            </summary>
            <p className="mt-4 text-slate-600 leading-relaxed">{answer}</p>
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
