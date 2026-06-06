import {
  ArrowRight,
  Bike,
  CarFront,
  FilePlus2,
  Files,
  Truck,
} from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/AppShell";
import { DashboardAssStockCard } from "@/components/DashboardAssStockCard";
import { DashboardContractMetrics } from "@/components/DashboardContractMetrics";
import { PageAction, SectionHeader } from "@/components/ui";

const contractTypes = [
  {
    name: "Automobile",
    description: "Véhicule individuel",
    status: "Disponible",
    href: "/contracts/new",
    icon: CarFront,
  },
  {
    name: "Moto",
    description: "Deux et trois roues",
    status: "Disponible",
    href: "/contracts/new",
    icon: Bike,
  },
  {
    name: "Flotte",
    description: "Plusieurs véhicules",
    status: "Disponible",
    href: "/contracts/new",
    icon: Truck,
  },
];

export default function Home() {
  return (
    <AppShell
      actions={<PageAction href="/contracts/new" icon={FilePlus2}>Nouveau contrat</PageAction>}
      description="Vue d’ensemble des opérations"
      title="Tableau de bord"
    >
      <div className="space-y-7">
        <DashboardContractMetrics />

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.75fr)]">
          <section className="app-surface p-5 sm:p-6">
            <SectionHeader
              action={
                <Link
                  className="inline-flex items-center gap-1.5 text-sm font-extrabold text-primary"
                  href="/contracts"
                >
                  Voir les contrats
                  <ArrowRight size={16} />
                </Link>
              }
              description="Démarrer un nouveau parcours"
              title="Souscription"
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {contractTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <Link
                    className="group flex min-h-40 flex-col justify-between rounded-md border border-border bg-white p-4 transition hover:border-black/35 hover:bg-[#fbfbfc]"
                    href={type.href}
                    key={type.name}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex size-10 items-center justify-center rounded-md bg-black text-white">
                        <Icon size={20} />
                      </span>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-extrabold text-emerald-700">
                        {type.status}
                      </span>
                    </div>
                    <div>
                      <p className="font-extrabold">{type.name}</p>
                      <p className="mt-1 text-sm font-medium text-black/48">{type.description}</p>
                      <span className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-primary">
                        Créer
                        <ArrowRight className="transition group-hover:translate-x-0.5" size={14} />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>

          <DashboardAssStockCard />
        </div>

        <section className="app-surface overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-md bg-muted text-black/60">
                <Files size={20} />
              </span>
              <div>
                <h2 className="font-extrabold">Suivi des dossiers</h2>
                <p className="text-sm font-medium text-black/48">
                  Reprendre un brouillon ou contrôler une émission
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
