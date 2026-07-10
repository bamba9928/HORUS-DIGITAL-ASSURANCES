import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AppFooter } from "@/components/AppFooter";

export const metadata: Metadata = {
  title: "Mentions légales — Horus Assurances Digital",
  description: "Mentions légales de la plateforme Horus Assurances Digital.",
};

export default function MentionsLegalesPage() {
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

        <h1 className="mt-8 text-2xl font-black tracking-tight">Mentions légales</h1>

        <div className="mt-6 space-y-6">
          <LegalSection title="Éditeur du site">
            <p>
              Le site <strong>horus-assur.digital</strong> est édité par{" "}
              <strong>Horus Assur</strong>, plateforme de gestion de contrats
              d&apos;assurance automobile réservée aux agents et courtiers agréés.
            </p>
            <p className="mt-2">
              Siège : Dakar, Sénégal
              <br />
              Contact :{" "}
              <a className="font-semibold text-primary hover:underline" href="mailto:bigrip2016@gmail.com">
                bigrip2016@gmail.com
              </a>
            </p>
          </LegalSection>

          <LegalSection title="Hébergement">
            <p>
              Le site est hébergé par <strong>OVHcloud</strong>
              <br />
              2 rue Kellermann, 59100 Roubaix, France
              <br />
              <a
                className="font-semibold text-primary hover:underline"
                href="https://www.ovhcloud.com"
                rel="noreferrer"
                target="_blank"
              >
                www.ovhcloud.com
              </a>
            </p>
          </LegalSection>

          <LegalSection title="Activité">
            <p>
              La plateforme permet la gestion de contrats d&apos;assurance automobile
              (souscription, encaissement des primes, suivi des commissions) en
              partenariat avec des compagnies d&apos;assurance agréées au Sénégal. Les
              attestations d&apos;assurance sont émises par les compagnies partenaires,
              seules porteuses du risque.
            </p>
          </LegalSection>

          <LegalSection title="Propriété intellectuelle">
            <p>
              L&apos;ensemble des éléments du site (logo, textes, interface, code) est la
              propriété exclusive de Horus Assur. Toute reproduction ou représentation,
              totale ou partielle, sans autorisation écrite préalable est interdite.
            </p>
          </LegalSection>

          <LegalSection title="Données personnelles">
            <p>
              Les données collectées sur la plateforme (identités des souscripteurs,
              véhicules, paiements) sont utilisées exclusivement pour la gestion des
              contrats d&apos;assurance et ne sont jamais cédées à des tiers en dehors
              des compagnies d&apos;assurance partenaires et des obligations légales.
              Conformément à la loi sénégalaise n° 2008-12 sur la protection des données
              à caractère personnel, vous disposez d&apos;un droit d&apos;accès, de
              rectification et de suppression de vos données en écrivant à{" "}
              <a className="font-semibold text-primary hover:underline" href="mailto:bigrip2016@gmail.com">
                bigrip2016@gmail.com
              </a>
              .
            </p>
          </LegalSection>

          <LegalSection title="Cookies">
            <p>
              Le site utilise uniquement des cookies de session strictement nécessaires
              au fonctionnement de l&apos;espace connecté (authentification, sécurité).
              Aucun cookie publicitaire ou de suivi n&apos;est déposé.
            </p>
          </LegalSection>
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

function LegalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-6 shadow-xs">
      <h2 className="text-[15px] font-extrabold tracking-tight">{title}</h2>
      <div className="mt-2 text-sm font-medium leading-relaxed text-black/55">
        {children}
      </div>
    </section>
  );
}
