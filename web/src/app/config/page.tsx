"use client";

import {
  ArrowRight,
  Banknote,
  Boxes,
  Building2,
  CheckCircle2,
  Globe,
  KeyRound,
  RefreshCw,
  ServerCog,
  Settings,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";
import { AlertMessage, LoadingState, MetricCard } from "@/components/ui";
import { fetchPlatformConfig, type PlatformConfig } from "@/lib/api";

/* ── Page ────────────────────────────────────────────────────────── */
export default function ConfigPage() {
  const { auth, isLoading: authLoading } = useAuth();
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [error, setError] = useState("");
  const [isDataLoading, setIsDataLoading] = useState(false);

  const isLoading = authLoading || isDataLoading;

  async function refresh() {
    if (!auth?.authenticated) return;
    setError("");
    setIsDataLoading(true);
    try {
      setConfig(await fetchPlatformConfig());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible.");
    } finally {
      setIsDataLoading(false);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    async function load() {
      if (!auth?.authenticated) return;
      if (!cancelled) setIsDataLoading(true);
      try {
        const res = await fetchPlatformConfig();
        if (!cancelled) setConfig(res);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Chargement impossible.");
      } finally {
        if (!cancelled) setIsDataLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [authLoading, auth?.authenticated]);

  return (
    <AppShell
      actions={
        <button
          aria-label="Actualiser"
          className="flex size-10 items-center justify-center rounded-md border border-border bg-white hover:bg-muted disabled:text-black/30"
          disabled={isLoading}
          onClick={() => void refresh()}
          type="button"
        >
          <RefreshCw className={isLoading ? "animate-spin" : ""} size={17} />
        </button>
      }
      description="Paramètres système en lecture seule"
      title="Configuration"
    >
      <div className="space-y-5">
        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {/* ── KPI row ──────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard
            detail="Frais fixes par contrat"
            icon={Banknote}
            label="Frais de police ASS"
            tone="primary"
            value={isLoading ? "—" : config ? `${config.ass_policy_fee.toLocaleString("fr-FR")} FCFA` : "—"}
          />
          <MetricCard
            detail={config?.ass_mock_enabled ? "Données simulées" : "API partenaire"}
            icon={ServerCog}
            label="Mode ASS"
            tone={config?.ass_mock_enabled ? "warning" : "success"}
            value={isLoading ? "—" : config ? (config.ass_mock_enabled ? "Mock" : "Réel") : "—"}
          />
          <MetricCard
            detail={config?.ass_real_calls_allowed ? "Actifs" : "Bloqués"}
            icon={ShieldCheck}
            label="Appels réels"
            tone={config?.ass_real_calls_allowed ? "success" : "warning"}
            value={isLoading ? "—" : config ? (config.ass_real_calls_allowed ? "Autorisés" : "Bloqués") : "—"}
          />
          <MetricCard
            detail={config?.debug ? "Mode développeur" : "Prêt pour la production"}
            icon={Settings}
            label="Environnement"
            tone={config?.environment === "production" ? "success" : "warning"}
            value={isLoading ? "—" : config ? (config.environment === "production" ? "Production" : "Développement") : "—"}
          />
        </div>

        <div className="grid items-start gap-5 lg:grid-cols-[1fr_320px]">
          {/* ── Colonne principale ────────────────────────────── */}
          <div className="space-y-5">
            {/* ASS */}
            <ConfigPanel icon={ServerCog} title="Intégration ASS">
              {isLoading ? (
                <LoadingState label="Chargement de la configuration" />
              ) : config ? (
                <div className="space-y-0 divide-y divide-border">
                  <ConfigRow
                    label="Mode mock"
                    value={config.ass_mock_enabled ? "Activé" : "Désactivé"}
                    ok={!config.ass_mock_enabled}
                  />
                  <ConfigRow
                    label="Appels réels autorisés"
                    value={config.ass_real_calls_allowed ? "Oui" : "Non"}
                    ok={config.ass_real_calls_allowed}
                  />
                  <ConfigRow
                    label="Frais de police (cout_police_ass)"
                    value={`${config.ass_policy_fee.toLocaleString("fr-FR")} FCFA`}
                    neutral
                  />
                  <ConfigRow
                    label="Segment partenaire"
                    value={config.ass_partner_segment || "Non configuré"}
                    neutral
                    mono
                  />
                  <ConfigRow
                    label="URL de base"
                    value={config.ass_base_url || "Non configurée"}
                    neutral
                    mono
                  />
                  <ConfigRow
                    label="Identifiants API"
                    value={config.ass_credentials_set ? "Configurés" : "Non configurés"}
                    ok={config.ass_credentials_set}
                  />
                </div>
              ) : null}
            </ConfigPanel>

            {/* Raccourcis configuration */}
            <section className="app-surface overflow-hidden">
              <div className="border-b border-border px-5 py-3.5">
                <h2 className="text-[13.5px] font-extrabold">Sections de configuration</h2>
              </div>
              <div className="grid gap-px bg-border sm:grid-cols-2">
                <ConfigShortcut
                  description="Gérer les marques de véhicules personnalisées"
                  href="/referentials/brands"
                  icon={Boxes}
                  title="Référentiels"
                />
                <ConfigShortcut
                  description="Supervision de la connexion partenaire A.A.S"
                  href="/integrations/ass"
                  icon={ShieldCheck}
                  title="Intégration ASS"
                />
                <ConfigShortcut
                  description="Comptes utilisateurs, rôles et commissions"
                  href="/users"
                  icon={Users}
                  title="Utilisateurs"
                />
                <ConfigShortcut
                  description="Groupes d'apporteurs et codes d'organisation"
                  href="/organizations"
                  icon={Building2}
                  title="Organisations"
                />
                <ConfigShortcut
                  description="Historique et suivi des paiements"
                  href="/payments"
                  icon={Banknote}
                  title="Paiements"
                />
                <ConfigShortcut
                  description="Calcul et versement des commissions"
                  href="/commissions"
                  icon={Banknote}
                  title="Commissions"
                />
              </div>
            </section>
          </div>

          {/* ── Colonne droite ────────────────────────────────── */}
          <div className="space-y-5">
            {/* Système */}
            <ConfigPanel icon={Globe} title="Système">
              {isLoading ? (
                <LoadingState label="Chargement" />
              ) : config ? (
                <div className="divide-y divide-border">
                  <ConfigRow
                    label="Environnement"
                    value={config.environment === "production" ? "Production" : "Développement"}
                    ok={config.environment === "production"}
                  />
                  <ConfigRow
                    label="Mode debug"
                    value={config.debug ? "Activé" : "Désactivé"}
                    ok={!config.debug}
                  />
                  <ConfigRow
                    label="Langue"
                    value={config.language_code}
                    neutral
                    mono
                  />
                  <ConfigRow
                    label="Fuseau horaire"
                    value={config.time_zone}
                    neutral
                    mono
                  />
                </div>
              ) : null}
            </ConfigPanel>

            {/* Sécurité */}
            <ConfigPanel icon={KeyRound} title="Sécurité">
              {isLoading ? (
                <LoadingState label="Chargement" />
              ) : config ? (
                <div className="divide-y divide-border">
                  <ConfigRow
                    label="Identifiants ASS"
                    value={config.ass_credentials_set ? "Définis" : "Manquants"}
                    ok={config.ass_credentials_set}
                  />
                  <ConfigRow
                    label="Appels réseau mock"
                    value={config.ass_mock_enabled ? "Aucun appel réel" : "Appels actifs"}
                    ok={true}
                    neutral
                  />
                  <ConfigRow
                    label="Configuration"
                    value="Lecture seule"
                    neutral
                  />
                </div>
              ) : null}
            </ConfigPanel>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

/* ── ConfigPanel ─────────────────────────────────────────────────── */
function ConfigPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Settings;
  children: React.ReactNode;
}) {
  return (
    <section className="app-surface overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-3.5">
        <Icon className="text-black/40" size={15} />
        <h2 className="text-[13.5px] font-extrabold">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

/* ── ConfigRow ───────────────────────────────────────────────────── */
function ConfigRow({
  label,
  value,
  ok,
  neutral = false,
  mono = false,
}: {
  label: string;
  value: string;
  ok?: boolean;
  neutral?: boolean;
  mono?: boolean;
}) {
  let icon: React.ReactNode = null;
  if (!neutral) {
    icon = ok ? (
      <CheckCircle2 className="shrink-0 text-emerald-500" size={14} />
    ) : (
      <XCircle className="shrink-0 text-amber-500" size={14} />
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <span className="text-sm font-semibold text-black/50">{label}</span>
      <div className="flex items-center gap-1.5 text-left sm:text-right">
        {icon}
        <span className={`break-all text-sm font-extrabold ${mono ? "font-mono" : ""}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

/* ── ConfigShortcut ──────────────────────────────────────────────── */
function ConfigShortcut({
  href,
  title,
  description,
  icon: Icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: typeof Settings;
}) {
  return (
    <Link
      className="group flex items-center gap-4 bg-white p-5 transition hover:bg-muted"
      href={href}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-white">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">{title}</p>
        <p className="mt-0.5 text-xs font-semibold text-black/45">{description}</p>
      </div>
      <ArrowRight
        className="shrink-0 text-black/20 transition group-hover:translate-x-0.5 group-hover:text-primary"
        size={16}
      />
    </Link>
  );
}
