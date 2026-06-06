"use client";

import {
  BadgePercent,
  Boxes,
  FilePlus2,
  FileText,
  Gauge,
  LogIn,
  Menu,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const navigation = [
  { href: "/", label: "Tableau de bord", icon: Gauge },
  { href: "/contracts/new", label: "Nouveau contrat", icon: FilePlus2 },
  { href: "/contracts", label: "Contrats", icon: FileText },
  { href: "/commissions", label: "Commissions", icon: BadgePercent },
  { href: "/users", label: "Utilisateurs", icon: Users },
  { href: "/referentials/brands", label: "Référentiels", icon: Boxes },
  { href: "/integrations/ass", label: "Intégration ASS", icon: ShieldCheck },
];

export function AppShell({
  children,
  title,
  description,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border bg-white lg:flex lg:flex-col">
        <Brand />
        <nav className="flex-1 space-y-1 px-3 py-4">
          {navigation.map((item) => (
            <NavItem
              active={isActivePath(pathname, item.href)}
              href={item.href}
              icon={item.icon}
              key={item.href}
              label={item.label}
            />
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <NavItem
            active={isActivePath(pathname, "/login")}
            href="/login"
            icon={LogIn}
            label="Connexion"
          />
          <div className="mt-3 flex items-center gap-3 px-3 py-2">
            <span className="flex size-9 items-center justify-center rounded-md bg-black text-xs font-black text-white">
              HA
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">Horus Assurances</p>
              <p className="text-xs font-semibold text-black/45">Environnement test</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              aria-label="Ouvrir la navigation"
              className="flex size-10 items-center justify-center rounded-md border border-border lg:hidden"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-extrabold sm:text-2xl">{title}</h1>
              {description ? (
                <p className="mt-0.5 hidden text-sm font-medium text-black/50 sm:block">
                  {description}
                </p>
              ) : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
        </header>

        <main className="mx-auto min-w-0 max-w-[1500px] px-4 py-5 pb-24 sm:px-6 sm:py-7 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fermer la navigation"
            className="absolute inset-0 bg-black/35"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(86vw,320px)] flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-border pr-4">
              <Brand />
              <button
                aria-label="Fermer la navigation"
                className="flex size-10 items-center justify-center rounded-md hover:bg-muted"
                onClick={() => setMobileOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {navigation.map((item) => (
                <NavItem
                  active={isActivePath(pathname, item.href)}
                  href={item.href}
                  icon={item.icon}
                  key={item.href}
                  label={item.label}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-white px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 lg:hidden">
        {navigation.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              className={`flex min-w-0 flex-col items-center gap-1 rounded-md px-1 py-1.5 text-[10px] font-bold ${
                active ? "text-primary" : "text-black/50"
              }`}
              href={item.href}
              key={item.href}
            >
              <Icon size={19} strokeWidth={active ? 2.5 : 2} />
              <span className="max-w-full truncate">
                {item.href === "/" ? "Accueil" : item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function Brand() {
  return (
    <Link className="flex h-20 items-center gap-3 px-5" href="/">
      <span className="flex size-10 items-center justify-center rounded-md bg-primary text-lg font-black text-white">
        H
      </span>
      <span>
        <span className="block text-base font-black">HORUS</span>
        <span className="block text-xs font-bold text-black/45">Assurances Digital</span>
      </span>
    </Link>
  );
}

function NavItem({
  active,
  href,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  href: string;
  icon: typeof Gauge;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      className={`flex h-11 items-center gap-3 rounded-md px-3 text-sm font-bold transition ${
        active
          ? "bg-primary text-white"
          : "text-black/62 hover:bg-muted hover:text-black"
      }`}
      href={href}
      onClick={onClick}
    >
      <Icon size={19} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/contracts") {
    return pathname === "/contracts" || /^\/contracts\/\d+/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
