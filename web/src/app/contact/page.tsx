import { Mail, MessageCircle, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AppFooter } from "@/components/AppFooter";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contacter l'équipe Horus Assurances Digital.",
};

export default function ContactPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#f5f6f9]">
      <div className="mx-auto w-full max-w-2xl flex-1 px-6 pb-16 pt-12">
        <Link className="inline-flex" href="/">
          <Image
            alt="Horus Assur"
            className="h-16 w-auto"
            height={512}
            priority
            src="/brand/horus-assur-logo.png"
            width={960}
          />
        </Link>

        <h1 className="mt-8 text-2xl font-black tracking-tight">Contact</h1>
        <p className="mt-2 text-sm font-medium text-black/45">
          Une question sur la plateforme, un contrat ou un paiement ? Écrivez-nous.
        </p>

        <div className="mt-6 space-y-4">
          <div className="flex items-start gap-4 rounded-2xl border border-border bg-white p-6 shadow-xs">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Mail size={18} />
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight">Email</h2>
              <p className="mt-1 text-sm font-medium text-black/55">
                Pour toute demande (support, contrats, partenariats) :
              </p>
              <a
                className="mt-1.5 inline-block text-sm font-bold text-primary hover:underline"
                href="mailto:contact@horus-assur.digital"
              >
                contact@horus-assur.digital
              </a>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-2xl border border-border bg-white p-6 shadow-xs">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MessageCircle size={18} />
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight">Contact WhatsApp</h2>
              <p className="mt-1 text-sm font-medium text-black/55">
                Du lundi au vendredi, de 9 h à 18 h :
              </p>
              <a
                className="mt-1.5 inline-block text-sm font-bold text-primary hover:underline"
                href="https://wa.me/221773409658"
                rel="noopener noreferrer"
                target="_blank"
              >
                +221 77 340 96 58
              </a>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-2xl border border-border bg-white p-6 shadow-xs">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight">Espace partenaire</h2>
              <p className="mt-1 text-sm font-medium text-black/55">
                La plateforme est réservée aux partenaires revendeurs agréés : il
                n&apos;y a pas d&apos;inscription libre. Si vous souhaitez devenir
                partenaire revendeur, contactez l&apos;administrateur pour la création
                de votre compte.
              </p>
              <p className="mt-2 text-sm font-medium text-black/55">
                Il vous ouvre votre espace, y rattache votre point de vente et vous
                accompagne sur vos premières attestations : émission, encaissement
                Orange Money et suivi de vos commissions.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <a
                  className="text-sm font-bold text-primary hover:underline"
                  href="https://wa.me/221773409658?text=Bonjour%2C%20je%20souhaite%20devenir%20partenaire%20revendeur%20Horus%20Assur."
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Demander un compte partenaire →
                </a>
                <Link
                  className="text-sm font-bold text-primary hover:underline"
                  href="/login"
                >
                  Se connecter →
                </Link>
              </div>
            </div>
          </div>
        </div>

        <Link
          className="mt-10 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline"
          href="/"
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>

      <AppFooter variant="minimal" />
    </main>
  );
}
