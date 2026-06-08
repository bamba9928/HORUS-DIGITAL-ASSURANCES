"use client";

import {
  ArrowRight,
  Bike,
  Bus,
  CarFront,
  FilePlus2,
  Wrench,
  Truck,
} from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { DashboardAssStockCard } from "@/components/DashboardAssStockCard";
import { DashboardContractMetrics } from "@/components/DashboardContractMetrics";
import { PageAction, SectionHeader } from "@/components/ui";
import { canCreateContract, canViewAssIntegration } from "@/lib/permissions";

const contractTypes = [
  {
    name: "Automobile",
    description: "Véhicule individuel RC + options",
    href: "/contracts/new?type=AUTO_MONO",
    icon: CarFront,
    gradient: "from-blue-500 to-blue-700",
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
  },
  {
    name: "Moto",
    description: "Deux et trois roues",
    href: "/contracts/new?type=AUTO_MONO",
    icon: Bike,
    gradient: "from-violet-500 to-violet-700",
    bg: "bg-violet-50",
    text: "text-violet-700",
    ring: "ring-violet-200",
  },
  {
    name: "Flotte",
    description: "Multi-véhicules + remorques",
    href: "/contracts/new?type=FLEET",
    icon: Truck,
    gradient: "from-sky-500 to-sky-700",
    bg: "bg-sky-50",
    text: "text-sky-700",
    ring: "ring-sky-200",
  },
  {
    name: "Bus École",
    description: "Transport scolaire",
    href: "/contracts/new?type=BUS_SCHOOL",
    icon: Bus,
    gradient: "from-emerald-500 to-emerald-700",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  {
    name: "Garage",
    description: "Responsabilité civile garage",
    href: "/contracts/new?type=GARAGE",
    icon: Wrench,
    gradient: "from-amber-500 to-amber-600",
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
];

export default function Home() {
  const { auth } = useAuth();
  const userCanCreateContract = canCreateContract(auth?.user);
  const userCanViewAss = canViewAssIntegration(auth?.user);

  return (
    <AppShell
      actions={
        userCanCreateContract ? (
          <PageAction href="/contracts/new" icon={FilePlus2}>
            Nouveau contrat
          </PageAction>
        ) : null
      }
      description="Vue d'ensemble des opérations"
      title="Tableau de bord"
    >
      <div className="space-y-6">
        {/* ── Metrics row ──────────────────────────────────────── */}
        <DashboardContractMetrics />

        <div
          className={`grid items-start gap-5 ${
            userCanCreateContract && userCanViewAss
              ? "xl:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.65fr)]"
              : userCanViewAss
                ? "xl:grid-cols-[minmax(280px,420px)]"
                : ""
          }`}
        >
          {/* ── Contract types ───────────────────────────────── */}
          {userCanCreateContract ? (
            <section className="app-surface p-5 sm:p-6">
            <SectionHeader
              action={
                <Link
                  className="inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline"
                  href="/contracts"
                >
                  Voir tous les contrats
                  <ArrowRight size={13} />
                </Link>
              }
              description="Démarrez une nouvelle souscription"
              title="Types de contrats"
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {contractTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <Link
                    className="group relative flex flex-col justify-between gap-10 overflow-hidden rounded-xl border border-border bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:border-transparent hover:shadow-lg"
                    href={type.href}
                    key={type.name}
                  >
                    {/* Icon */}
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className={`flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${type.gradient} text-white shadow-sm`}
                      >
                        <Icon size={21} />
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${type.bg} ${type.text}`}
                      >
                        Actif
                      </span>
                    </div>

                    {/* Label */}
                    <div>
                      <p className="font-extrabold tracking-tight">{type.name}</p>
                      <p className="mt-0.5 text-[13px] text-black/40">{type.description}</p>
                      <span
                        className={`mt-3 inline-flex items-center gap-1 text-xs font-bold ${type.text} opacity-0 transition-opacity group-hover:opacity-100`}
                      >
                        Créer un contrat
                        <ArrowRight size={12} />
                      </span>
                    </div>

                  </Link>
                );
              })}
            </div>
            </section>
          ) : null}

          {/* ── ASS stock ────────────────────────────────────── */}
          {userCanViewAss ? <DashboardAssStockCard /> : null}
        </div>

        {/* ── Quick access banner ──────────────────────────── */}
        <section className="app-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 sm:px-6">
            <div className="flex items-center gap-4">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary/8 text-primary">
                <FilePlus2 size={20} />
              </span>
              <div>
                <h2 className="font-extrabold tracking-tight">Suivi des dossiers</h2>
                <p className="mt-0.5 text-sm text-black/40">
                  Reprendre un brouillon, contrôler une émission
                </p>
              </div>
            </div>
            <PageAction href="/contracts" icon={ArrowRight} variant="secondary">
              Ouvrir la liste
            </PageAction>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
