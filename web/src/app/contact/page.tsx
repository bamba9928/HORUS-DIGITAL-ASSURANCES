import { Mail, MapPin, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AppFooter } from "@/components/AppFooter";

export const metadata: Metadata = {
  title: "Contact — Horus Assurances Digital",
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
                href="mailto:bigrip2016@gmail.com"
              >
                bigrip2016@gmail.com
              </a>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-2xl border border-border bg-white p-6 shadow-xs">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <MapPin size={18} />
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight">Adresse</h2>
              <p className="mt-1 text-sm font-medium text-black/55">Dakar, Sénégal</p>
            </div>
          </div>

          <div className="flex items-start gap-4 rounded-2xl border border-border bg-white p-6 shadow-xs">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ShieldCheck size={18} />
            </span>
            <div>
              <h2 className="text-[15px] font-extrabold tracking-tight">Espace agents</h2>
              <p className="mt-1 text-sm font-medium text-black/55">
                La plateforme est réservée aux agents et courtiers agréés. L&apos;accès
                se fait uniquement sur invitation de votre administrateur.
              </p>
              <Link
                className="mt-1.5 inline-block text-sm font-bold text-primary hover:underline"
                href="/login"
              >
                Se connecter →
              </Link>
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
