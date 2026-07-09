"use client";

import {
  BadgePercent,
  Banknote,
  Boxes,
  Building2,
  CalendarClock,
  ChevronDown,
  CircleUser,
  FilePlus2,
  FileText,
  Gauge,
  Layers,
  LogIn,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { logout } from "@/lib/api";
import {
  canCreateContract,
  canManageReferentials,
  canManageUsers,
  canViewAssIntegration,
  canViewConfig,
  canViewOrganizations,
  canViewPayments,
} from "@/lib/permissions";

const navigation = [
  { href: "/", label: "Tableau de bord", icon: Gauge },
  { href: "/contracts/new", label: "Nouveau contrat", icon: FilePlus2 },
];

const productionNavigation = [
  { href: "/contracts", label: "Contrats", icon: FileText },
  { href: "/echeances", label: "Échéances", icon: CalendarClock },
  { href: "/clients", label: "Clients", icon: UserRound },
];

const financeNavigation = [
  { href: "/commissions", label: "Commissions", icon: BadgePercent },
  { href: "/payments", label: "Paiements", icon: Banknote },
];

const compteNavigation = [
  { href: "/users", label: "Utilisateurs", icon: Users },
  { href: "/organizations", label: "Organisations", icon: Building2 },
];

const settingsNavigation = [
  { href: "/config", label: "Configuration", icon: Settings },
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
  const router = useRouter();
  const { auth, isLoading: isAuthLoading, refreshAuth } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Redirection automatique vers /login si session expirée ou non authentifié
  useEffect(() => {
    if (isAuthLoading) return;
    if (auth?.authenticated === false) {
      const redirect = encodeURIComponent(pathname);
      router.replace(`/login?redirect=${redirect}`);
    }
  }, [isAuthLoading, auth?.authenticated, pathname, router]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [productionOpen, setProductionOpen] = useState(false);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [compteOpen, setCompteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Préférence de sidebar lue après le montage uniquement : le serveur rend
  // toujours la sidebar dépliée, donc lire localStorage pendant le rendu initial
  // provoquerait un mismatch d'hydratation.
  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem("horus-sidebar") === "collapsed");
  }, []);

  const user = auth?.user;
  const visibleNavigation = navigation.filter((item) => {
    if (item.href === "/contracts/new") return canCreateContract(user);
    return true;
  });
  const visibleProductionNavigation = productionNavigation;
  const visibleFinanceNavigation = financeNavigation.filter((item) => {
    if (item.href === "/payments") return canViewPayments(user);
    return true;
  });
  const visibleCompteNavigation = compteNavigation.filter((item) => {
    if (item.href === "/users") return canManageUsers(user);
    if (item.href === "/organizations") return canViewOrganizations(user);
    return true;
  });
  const visibleSettingsNavigation = settingsNavigation.filter((item) => {
    if (item.href === "/config") return canViewConfig(user);
    if (item.href === "/referentials/brands") return canManageReferentials(user);
    if (item.href === "/integrations/ass") return canViewAssIntegration(user);
    return false;
  });
  const productionActive = visibleProductionNavigation.some((item) =>
    isActivePath(pathname, item.href),
  );
  const productionVisible = productionOpen || productionActive;
  const financeActive = visibleFinanceNavigation.some((item) =>
    isActivePath(pathname, item.href),
  );
  const financeVisible = financeOpen || financeActive;
  const compteActive = visibleCompteNavigation.some((item) =>
    isActivePath(pathname, item.href),
  );
  const compteVisible = compteOpen || compteActive;
  const settingsActive = visibleSettingsNavigation.some((item) =>
    isActivePath(pathname, item.href),
  );
  const settingsVisible = settingsOpen || settingsActive;

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // La session locale est tout de même resynchronisée juste après.
    } finally {
      await refreshAuth();
      setMobileOpen(false);
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen overflow-x-clip bg-background text-foreground">
      {/* ── Desktop sidebar ───────────────────────────────────────── */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-white/[0.07] bg-[#111218] transition-[width] duration-200 lg:flex ${
          sidebarCollapsed ? "w-[68px]" : "w-60"
        }`}
      >
        <Brand collapsed={sidebarCollapsed} />

        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
          {sidebarCollapsed ? null : (
            <p className="mb-1.5 px-3 text-[10px] font-black uppercase tracking-widest text-white/25">
              Navigation
            </p>
          )}
          {visibleNavigation.map((item) => (
            <NavItem
              active={isActivePath(pathname, item.href)}
              collapsed={sidebarCollapsed}
              href={item.href}
              icon={item.icon}
              key={item.href}
              label={item.label}
            />
          ))}

          <div className="my-3 border-t border-white/[0.07]" />

          <ProductionMenu
            collapsed={sidebarCollapsed}
            items={visibleProductionNavigation}
            onToggle={() => setProductionOpen((c) => !c)}
            open={productionVisible}
            pathname={pathname}
          />
          <FinanceMenu
            collapsed={sidebarCollapsed}
            items={visibleFinanceNavigation}
            onToggle={() => setFinanceOpen((c) => !c)}
            open={financeVisible}
            pathname={pathname}
          />
          <CompteMenu
            collapsed={sidebarCollapsed}
            items={visibleCompteNavigation}
            onToggle={() => setCompteOpen((c) => !c)}
            open={compteVisible}
            pathname={pathname}
          />
          <SettingsMenu
            collapsed={sidebarCollapsed}
            onToggle={() => setSettingsOpen((c) => !c)}
            open={settingsVisible}
            pathname={pathname}
            items={visibleSettingsNavigation}
          />
        </nav>

        {/* ── Sidebar footer ──────────────────────────────────────── */}
        <div className="border-t border-white/[0.07] p-2">
          <SessionControl
            auth={auth}
            collapsed={sidebarCollapsed}
            isLoading={isAuthLoading}
            onLogout={handleLogout}
          />
          <div
            className={`mt-2 flex items-center rounded-lg py-2 ${
              sidebarCollapsed ? "justify-center px-0" : "gap-2.5 px-2.5"
            }`}
            title={sidebarCollapsed ? "Horus Assurances — Mode test" : undefined}
          >
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white shadow-lg shadow-black/25">
              <Image
                alt="Horus Assur"
                height={256}
                src="/brand/horus-assur-icon.png"
                width={256}
              />
            </span>
            {sidebarCollapsed ? null : (
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-white/80">Horus Assurances</p>
                <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                  <span className="size-1.5 rounded-full bg-amber-400" />
                  Mode test
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ── Main content area ─────────────────────────────────────── */}
      <div
        className={`min-w-0 transition-[padding] duration-200 ${
          sidebarCollapsed ? "lg:pl-[68px]" : "lg:pl-60"
        }`}
      >
        {/* ── Topbar ──────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 border-b border-border bg-white/96 backdrop-blur-sm">
          <div className="flex min-h-[58px] items-center gap-3 px-4 sm:px-6">
            {/* Mobile menu button */}
            <button
              aria-label="Ouvrir la navigation"
              className="flex size-9 items-center justify-center rounded-lg border border-border text-black/55 hover:bg-muted lg:hidden"
              onClick={() => setMobileOpen(true)}
              type="button"
            >
              <Menu size={17} />
            </button>

            {/* Desktop collapse toggle */}
            <button
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? "Déplier le menu" : "Replier le menu"}
              className="hidden size-9 items-center justify-center rounded-lg border border-border text-black/50 transition hover:bg-muted hover:text-black lg:flex"
              onClick={() =>
                setSidebarCollapsed((c) => {
                  const next = !c;
                  localStorage.setItem("horus-sidebar", next ? "collapsed" : "expanded");
                  return next;
                })
              }
              title={sidebarCollapsed ? "Déplier le menu" : "Replier le menu"}
              type="button"
            >
              {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            </button>

            {/* Title */}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <h1 className="truncate text-base font-black tracking-tight sm:text-[17px]">
                  {title}
                </h1>
                {description ? (
                  <span className="hidden truncate text-sm font-medium text-black/40 sm:inline">
                    — {description}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Actions slot */}
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}

            {/* Session widget */}
            <TopbarSession auth={auth} isLoading={isAuthLoading} />
          </div>
        </header>

        <main className="min-w-0 px-4 py-6 pb-24 sm:px-6 sm:py-7 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      {/* ── Mobile drawer ─────────────────────────────────────────── */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Fermer la navigation"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            type="button"
          />
          <aside className="animate-slide-up absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col border-r border-white/[0.07] bg-[#111218] shadow-xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] pr-3">
              <Brand />
              <button
                aria-label="Fermer"
                className="flex size-9 items-center justify-center rounded-lg text-white/50 hover:bg-white/[0.07] hover:text-white"
                onClick={() => setMobileOpen(false)}
                type="button"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
              {visibleNavigation.map((item) => (
                <NavItem
                  active={isActivePath(pathname, item.href)}
                  href={item.href}
                  icon={item.icon}
                  key={item.href}
                  label={item.label}
                  onClick={() => setMobileOpen(false)}
                />
              ))}
              <ProductionMenu
                items={visibleProductionNavigation}
                onNavigate={() => setMobileOpen(false)}
                onToggle={() => setProductionOpen((c) => !c)}
                open={productionVisible}
                pathname={pathname}
              />
              <FinanceMenu
                items={visibleFinanceNavigation}
                onNavigate={() => setMobileOpen(false)}
                onToggle={() => setFinanceOpen((c) => !c)}
                open={financeVisible}
                pathname={pathname}
              />
              <CompteMenu
                items={visibleCompteNavigation}
                onNavigate={() => setMobileOpen(false)}
                onToggle={() => setCompteOpen((c) => !c)}
                open={compteVisible}
                pathname={pathname}
              />
              <SettingsMenu
                onNavigate={() => setMobileOpen(false)}
                onToggle={() => setSettingsOpen((c) => !c)}
                open={settingsVisible}
                pathname={pathname}
                items={visibleSettingsNavigation}
              />
            </nav>
            <div className="border-t border-white/[0.07] p-2">
              <SessionControl
                auth={auth}
                isLoading={isAuthLoading}
                onLogout={handleLogout}
              />
            </div>
          </aside>
        </div>
      ) : null}

      {/* ── Mobile bottom nav ─────────────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid border-t border-border bg-white/95 px-1 pb-[max(6px,env(safe-area-inset-bottom))] pt-1 backdrop-blur-sm lg:hidden"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, Math.min(4, visibleNavigation.length))}, minmax(0, 1fr))`,
        }}
      >
        {visibleNavigation.slice(0, 4).map((item) => {
          const Icon = item.icon;
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              className={`flex min-w-0 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-bold transition ${
                active ? "text-primary" : "text-black/40"
              }`}
              href={item.href}
              key={item.href}
            >
              <span
                className={`flex size-7 items-center justify-center rounded-lg transition ${
                  active ? "bg-primary/10" : ""
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.5 : 2} />
              </span>
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

/* ── Brand ────────────────────────────────────────────────────────── */
function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <Link
      className={`flex h-[60px] items-center ${
        collapsed ? "justify-center px-0" : "px-4"
      }`}
      href="/"
      title={collapsed ? "Horus Assurances Digital" : undefined}
    >
      {collapsed ? (
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-lg shadow-black/30">
          <Image
            alt="Horus Assur"
            height={256}
            src="/brand/horus-assur-icon.png"
            width={256}
          />
        </span>
      ) : (
        <span className="flex items-center rounded-lg bg-white px-2.5 py-1.5 shadow-lg shadow-black/20">
          <Image
            alt="Horus Assur"
            className="h-6 w-auto"
            height={512}
            priority
            src="/brand/horus-assur-logo.png"
            width={960}
          />
        </span>
      )}
    </Link>
  );
}

/* ── NavItem ──────────────────────────────────────────────────────── */
function NavItem({
  active,
  collapsed = false,
  href,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  collapsed?: boolean;
  href: string;
  icon: typeof Gauge;
  label: string;
  onClick?: () => void;
}) {
  return (
    <Link
      className={`group relative flex items-center rounded-lg font-semibold transition ${
        collapsed
          ? "h-[52px] flex-col justify-center gap-0.5 px-1 text-center text-[9px] leading-[1.1]"
          : "h-9 gap-2.5 px-3 text-[13px]"
      } ${
        active
          ? "bg-primary/[0.18] text-white font-bold"
          : "text-white/45 hover:bg-white/[0.07] hover:text-white/80"
      }`}
      href={href}
      onClick={onClick}
      title={collapsed ? label : undefined}
    >
      <span className="flex size-5 shrink-0 items-center justify-center">
        <Icon
          size={collapsed ? 18 : 15}
          strokeWidth={active ? 2.5 : 1.8}
        />
      </span>
      <span className={collapsed ? "line-clamp-2 w-full font-bold" : "truncate"}>
        {label}
      </span>
      {active && !collapsed ? (
        <span className="ml-auto size-1.5 rounded-full bg-primary" />
      ) : null}
    </Link>
  );
}

/* ── ProductionMenu ───────────────────────────────────────────────── */
function ProductionMenu({
  collapsed = false,
  items,
  onNavigate,
  onToggle,
  open,
  pathname,
}: {
  collapsed?: boolean;
  items: typeof productionNavigation;
  onNavigate?: () => void;
  onToggle: () => void;
  open: boolean;
  pathname: string;
}) {
  const active = items.some((item) => isActivePath(pathname, item.href));

  if (!items.length) return null;

  return (
    <div>
      <button
        aria-expanded={open}
        className={`group flex w-full items-center rounded-lg font-semibold transition ${
          collapsed
            ? "h-[52px] flex-col justify-center gap-0.5 px-1 text-center text-[9px] leading-[1.1]"
            : "h-9 gap-2.5 px-3 text-[13px]"
        } ${
          active
            ? "bg-primary/[0.18] font-bold text-white"
            : "text-white/45 hover:bg-white/[0.07] hover:text-white/80"
        }`}
        onClick={onToggle}
        title={collapsed ? "Production" : undefined}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Layers size={collapsed ? 18 : 15} strokeWidth={active ? 2.5 : 1.8} />
        </span>
        <span className={collapsed ? "w-full font-bold" : "truncate"}>Production</span>
        {collapsed ? null : (
          <ChevronDown
            className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
            size={14}
          />
        )}
      </button>

      {open ? (
        <div
          className={
            collapsed
              ? "mt-1 space-y-0.5 border-t border-white/[0.07] pt-1"
              : "ml-4 mt-1 space-y-0.5 border-l border-white/[0.12] pl-2"
          }
        >
          {items.map((item) => (
            <NavItem
              active={isActivePath(pathname, item.href)}
              collapsed={collapsed}
              href={item.href}
              icon={item.icon}
              key={item.href}
              label={item.label}
              onClick={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── CompteMenu ───────────────────────────────────────────────────── */
function CompteMenu({
  collapsed = false,
  items,
  onNavigate,
  onToggle,
  open,
  pathname,
}: {
  collapsed?: boolean;
  items: typeof compteNavigation;
  onNavigate?: () => void;
  onToggle: () => void;
  open: boolean;
  pathname: string;
}) {
  const active = items.some((item) => isActivePath(pathname, item.href));

  if (!items.length) return null;

  return (
    <div>
      <button
        aria-expanded={open}
        className={`group flex w-full items-center rounded-lg font-semibold transition ${
          collapsed
            ? "h-[52px] flex-col justify-center gap-0.5 px-1 text-center text-[9px] leading-[1.1]"
            : "h-9 gap-2.5 px-3 text-[13px]"
        } ${
          active
            ? "bg-primary/[0.18] font-bold text-white"
            : "text-white/45 hover:bg-white/[0.07] hover:text-white/80"
        }`}
        onClick={onToggle}
        title={collapsed ? "Compte" : undefined}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <CircleUser size={collapsed ? 18 : 15} strokeWidth={active ? 2.5 : 1.8} />
        </span>
        <span className={collapsed ? "w-full font-bold" : "truncate"}>Compte</span>
        {collapsed ? null : (
          <ChevronDown
            className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
            size={14}
          />
        )}
      </button>

      {open ? (
        <div
          className={
            collapsed
              ? "mt-1 space-y-0.5 border-t border-white/[0.07] pt-1"
              : "ml-4 mt-1 space-y-0.5 border-l border-white/[0.12] pl-2"
          }
        >
          {items.map((item) => (
            <NavItem
              active={isActivePath(pathname, item.href)}
              collapsed={collapsed}
              href={item.href}
              icon={item.icon}
              key={item.href}
              label={item.label}
              onClick={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── FinanceMenu ──────────────────────────────────────────────────── */
function FinanceMenu({
  collapsed = false,
  items,
  onNavigate,
  onToggle,
  open,
  pathname,
}: {
  collapsed?: boolean;
  items: typeof financeNavigation;
  onNavigate?: () => void;
  onToggle: () => void;
  open: boolean;
  pathname: string;
}) {
  const active = items.some((item) => isActivePath(pathname, item.href));

  if (!items.length) return null;

  return (
    <div>
      <button
        aria-expanded={open}
        className={`group flex w-full items-center rounded-lg font-semibold transition ${
          collapsed
            ? "h-[52px] flex-col justify-center gap-0.5 px-1 text-center text-[9px] leading-[1.1]"
            : "h-9 gap-2.5 px-3 text-[13px]"
        } ${
          active
            ? "bg-primary/[0.18] font-bold text-white"
            : "text-white/45 hover:bg-white/[0.07] hover:text-white/80"
        }`}
        onClick={onToggle}
        title={collapsed ? "Finance" : undefined}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Wallet size={collapsed ? 18 : 15} strokeWidth={active ? 2.5 : 1.8} />
        </span>
        <span className={collapsed ? "w-full font-bold" : "truncate"}>Finance</span>
        {collapsed ? null : (
          <ChevronDown
            className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
            size={14}
          />
        )}
      </button>

      {open ? (
        <div
          className={
            collapsed
              ? "mt-1 space-y-0.5 border-t border-white/[0.07] pt-1"
              : "ml-4 mt-1 space-y-0.5 border-l border-white/[0.12] pl-2"
          }
        >
          {items.map((item) => (
            <NavItem
              active={isActivePath(pathname, item.href)}
              collapsed={collapsed}
              href={item.href}
              icon={item.icon}
              key={item.href}
              label={item.label}
              onClick={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── SettingsMenu ─────────────────────────────────────────────────── */
function SettingsMenu({
  collapsed = false,
  items,
  onNavigate,
  onToggle,
  open,
  pathname,
}: {
  collapsed?: boolean;
  items: typeof settingsNavigation;
  onNavigate?: () => void;
  onToggle: () => void;
  open: boolean;
  pathname: string;
}) {
  const active = items.some((item) => isActivePath(pathname, item.href));

  if (!items.length) {
    return null;
  }

  return (
    <div>
      <button
        aria-expanded={open}
        className={`group flex w-full items-center rounded-lg font-semibold transition ${
          collapsed
            ? "h-[52px] flex-col justify-center gap-0.5 px-1 text-center text-[9px] leading-[1.1]"
            : "h-9 gap-2.5 px-3 text-[13px]"
        } ${
          active
            ? "bg-primary/[0.18] font-bold text-white"
            : "text-white/45 hover:bg-white/[0.07] hover:text-white/80"
        }`}
        onClick={onToggle}
        title={collapsed ? "Réglages" : undefined}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Settings size={collapsed ? 18 : 15} strokeWidth={active ? 2.5 : 1.8} />
        </span>
        <span className={collapsed ? "w-full font-bold" : "truncate"}>Réglages</span>
        {collapsed ? null : (
          <ChevronDown
            className={`ml-auto transition-transform ${open ? "rotate-180" : ""}`}
            size={14}
          />
        )}
      </button>

      {open ? (
        <div
          className={
            collapsed
              ? "mt-1 space-y-0.5 border-t border-white/[0.07] pt-1"
              : "ml-4 mt-1 space-y-0.5 border-l border-white/[0.12] pl-2"
          }
        >
          {items.map((item) => (
            <NavItem
              active={isActivePath(pathname, item.href)}
              collapsed={collapsed}
              href={item.href}
              icon={item.icon}
              key={item.href}
              label={item.label}
              onClick={onNavigate}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SessionControl({
  auth,
  collapsed = false,
  isLoading,
  onLogout,
}: {
  auth: ReturnType<typeof useAuth>["auth"];
  collapsed?: boolean;
  isLoading: boolean;
  onLogout: () => Promise<void>;
}) {
  if (isLoading || !auth?.authenticated || !auth?.user) return null;

  return (
    <button
      aria-label="Se déconnecter"
      className={`flex items-center rounded-lg text-white/35 transition hover:bg-red-500/15 hover:text-red-300 ${
        collapsed
          ? "size-[44px] justify-center"
          : "h-9 w-full gap-2.5 px-3 text-[13px] font-semibold"
      }`}
      onClick={() => void onLogout()}
      title="Se déconnecter"
      type="button"
    >
      <LogOut size={15} />
      {collapsed ? null : "Se déconnecter"}
    </button>
  );
}

/* ── TopbarSession ────────────────────────────────────────────────── */
function TopbarSession({
  auth,
  isLoading,
}: {
  auth: ReturnType<typeof useAuth>["auth"];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <span className="flex size-8 items-center justify-center">
        <span className="size-4 animate-spin rounded-full border-2 border-black/15 border-t-black/45" />
      </span>
    );
  }

  if (!auth?.authenticated || !auth.user) {
    return (
      <Link
        className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-white px-3 text-[13px] font-bold text-black/70 shadow-xs transition hover:bg-muted"
        href="/login"
      >
        <LogIn size={14} />
        <span className="hidden sm:inline">Connexion</span>
      </Link>
    );
  }

  const name =
    [auth.user.first_name, auth.user.last_name].filter(Boolean).join(" ") ||
    auth.user.username;

  return (
    <Link
      className="rounded-lg px-2 py-1 text-[13px] font-bold transition hover:bg-muted hover:text-primary"
      href="/profile"
      title="Mon profil"
    >
      {name}
    </Link>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/contracts")
    return pathname === "/contracts" || /^\/contracts\/\d+/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}
