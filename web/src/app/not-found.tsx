import { Home } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { AppFooter } from "@/components/AppFooter";

export const metadata: Metadata = {
  title: "Page introuvable — Horus Assurances Digital",
};

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-[#f5f6f9]">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Image
          alt="Horus Assur"
          className="h-24 w-auto"
          height={512}
          priority
          src="/brand/horus-assur-logo.png"
          width={960}
        />
        <p className="mt-10 text-[64px] font-black leading-none tracking-tight text-primary">
          404
        </p>
        <h1 className="mt-3 text-xl font-extrabold tracking-tight">
          Page introuvable
        </h1>
        <p className="mt-2 max-w-sm text-sm font-medium text-black/45">
          La page que vous cherchez n&apos;existe pas ou a été déplacée.
        </p>
        <Link
          className="mt-8 inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-gradient-to-br from-primary to-[var(--primary-strong)] px-6 text-sm font-extrabold text-white shadow-sm shadow-primary/30 transition hover:shadow-[0_6px_20px_rgba(150,0,192,0.4)] hover:brightness-105"
          href="/"
        >
          <Home size={16} />
          Retour à l&apos;accueil
        </Link>
      </div>

      <AppFooter variant="minimal" />
    </main>
  );
}
