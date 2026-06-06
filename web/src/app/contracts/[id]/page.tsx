"use client";

import {
  ArrowLeft,
  Banknote,
  Calculator,
  CheckCircle2,
  ExternalLink,
  FilePenLine,
  LoaderCircle,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { AlertMessage, ContractTypeBadge, MetricCard, StatusBadge, humanize } from "@/components/ui";
import {
  calculateContractQuote,
  cancelContract,
  confirmContractPayment,
  fetchContractDetail,
  issueContract,
  type CancelMethod,
  type ContractDetail,
  type ContractQuote,
  type IssueResult,
} from "@/lib/api";

const WORKFLOW_STEPS = ["DRAFT", "QUOTE_READY", "PAYMENT_PENDING", "PAID", "ISSUED"] as const;
const STEP_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  QUOTE_READY: "Devis",
  PAYMENT_PENDING: "Paiement",
  PAID: "Payé",
  ISSUED: "Émis",
};

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const contractId = Number(params.id);
  const hasValidId = Number.isFinite(contractId);

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [quote, setQuote] = useState<ContractQuote | null>(null);
  const [issueResult, setIssueResult] = useState<IssueResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(hasValidId);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelMethod, setCancelMethod] = useState<CancelMethod>("ANNULER");
  const [cancelMotif, setCancelMotif] = useState("");

  async function refresh() {
    setError("");
    setIsLoading(true);
    try {
      setContract(await fetchContractDetail(contractId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Contrat introuvable.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let isCancelled = false;
    async function load() {
      try {
        const res = await fetchContractDetail(contractId);
        if (!isCancelled) setContract(res);
      } catch (err) {
        if (!isCancelled)
          setError(err instanceof Error ? err.message : "Contrat introuvable.");
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    }
    if (hasValidId) void load();
    return () => {
      isCancelled = true;
    };
  }, [contractId, hasValidId]);

  const payableAmount = useMemo(() => {
    if (!contract?.prime_rc_ass) return null;
    return contract.prime_rc_ass + contract.cout_police_ass;
  }, [contract]);

  async function calculateQuote() {
    if (!contract) return;
    setError("");
    setIsActionLoading(true);
    try {
      const res = await calculateContractQuote(contract.id);
      setQuote(res.quote);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calcul devis impossible.");
    } finally {
      setIsActionLoading(false);
    }
  }

  async function confirmPayment() {
    if (!contract || payableAmount === null) return;
    setError("");
    setIsActionLoading(true);
    try {
      await confirmContractPayment(contract.id, payableAmount);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Paiement impossible.");
    } finally {
      setIsActionLoading(false);
    }
  }

  async function emitContract() {
    if (!contract) return;
    setError("");
    setIsActionLoading(true);
    try {
      const res = await issueContract(contract.id);
      setIssueResult(res);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Émission impossible.");
    } finally {
      setIsActionLoading(false);
    }
  }

  async function handleCancel() {
    if (!contract) return;
    setError("");
    setIsActionLoading(true);
    setShowCancelDialog(false);
    try {
      await cancelContract(contract.id, cancelMethod, cancelMotif);
      setCancelMotif("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Annulation impossible.");
    } finally {
      setIsActionLoading(false);
    }
  }

  return (
    <AppShell
      actions={
        <Link
          className="inline-flex h-9 items-center gap-1.5 rounded-[9px] border border-border bg-white px-3 text-[13px] font-bold shadow-xs transition hover:bg-muted"
          href="/contracts"
        >
          <ArrowLeft size={14} />
          <span className="hidden sm:inline">Contrats</span>
        </Link>
      }
      description={
        contract ? contract.vehicle_label || humanize(contract.contract_type) : "Détail"
      }
      title={`Contrat #${params.id}`}
    >
      <div className="space-y-5">
        {!hasValidId ? (
          <AlertMessage>Identifiant contrat invalide.</AlertMessage>
        ) : null}

        {/* Loading skeletons */}
        {isLoading ? (
          <div className="space-y-3 animate-fade-in">
            {[72, 52, 120].map((h, i) => (
              <div
                className="skeleton rounded-2xl"
                key={i}
                style={{ height: h }}
              />
            ))}
          </div>
        ) : null}

        {error ? <AlertMessage>{error}</AlertMessage> : null}

        {contract ? (
          <>
            {/* ── Hero ───────────────────────────────────────────── */}
            <section className="app-surface overflow-hidden animate-fade-in">
              <div className="p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={contract.internal_status} />
                      {contract.ass_status ? (
                        <StatusBadge status={contract.ass_status} />
                      ) : null}
                      <ContractTypeBadge contractType={contract.contract_type} />
                    </div>
                    <h2 className="mt-3 text-xl font-black tracking-tight">
                      {contract.vehicle_label || humanize(contract.contract_type)}
                    </h2>
                    <p className="mt-1 text-sm font-medium text-black/40">
                      {contract.contributor_username}
                      {contract.organization_name
                        ? ` · ${contract.organization_name}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-x-8 gap-y-3">
                    <InfoField label="Immatriculation" value={contract.immatriculation || "—"} mono />
                    <InfoField label="Créé le" value={formatDate(contract.created_at)} />
                  </div>
                </div>
              </div>

              {/* Workflow stepper */}
              {contract.internal_status !== "CANCELLED" ? (
                <div className="border-t border-border px-5 py-4 sm:px-6">
                  <div className="flex items-center">
                    {WORKFLOW_STEPS.map((step, idx) => {
                      const stepIndex = WORKFLOW_STEPS.indexOf(
                        contract.internal_status as (typeof WORKFLOW_STEPS)[number],
                      );
                      const isDone = idx < stepIndex;
                      const isActive = idx === stepIndex;
                      return (
                        <div className="flex flex-1 items-center" key={step}>
                          <div
                            className={`flex flex-col items-center gap-1.5 ${
                              isActive
                                ? "text-primary"
                                : isDone
                                  ? "text-emerald-600"
                                  : "text-black/22"
                            }`}
                          >
                            <div
                              className={`flex size-7 items-center justify-center rounded-full text-[11px] font-black transition ${
                                isActive
                                  ? "bg-primary text-white shadow-md shadow-primary/30 ring-4 ring-primary/15"
                                  : isDone
                                    ? "bg-emerald-500 text-white"
                                    : "border-2 border-current bg-white"
                              }`}
                            >
                              {isDone ? "✓" : idx + 1}
                            </div>
                            <span className="hidden text-[10px] font-bold sm:block">
                              {STEP_LABELS[step]}
                            </span>
                          </div>
                          {idx < WORKFLOW_STEPS.length - 1 ? (
                            <div
                              className={`mx-1 h-0.5 flex-1 rounded-full transition ${
                                idx < stepIndex ? "bg-emerald-400" : "bg-border"
                              }`}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 border-t border-red-100 bg-red-50 px-5 py-3 text-sm font-bold text-red-700">
                  <XCircle size={15} />
                  Contrat annulé
                </div>
              )}
            </section>

            {/* ── KPI cards ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard
                icon={Banknote}
                label="Prime RC"
                value={contract.prime_rc_ass === null ? "—" : formatMoney(contract.prime_rc_ass)}
              />
              <MetricCard
                icon={ShieldCheck}
                label="Police ASS"
                value={formatMoney(contract.cout_police_ass)}
              />
              <MetricCard
                icon={Banknote}
                label="TTC ASS"
                tone="primary"
                value={contract.ttc_ass === null ? "—" : formatMoney(contract.ttc_ass)}
              />
              <MetricCard
                icon={CheckCircle2}
                label="Montant attendu"
                tone="success"
                value={payableAmount === null ? "—" : formatMoney(payableAmount)}
              />
            </div>

            {/* ── Main grid ──────────────────────────────────────── */}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              {/* Left column */}
              <div className="space-y-5">
                <Panel title="Paiements">
                  <div className="overflow-x-auto">
                    <table className="app-table app-table-responsive">
                      <thead>
                        <tr>
                          <th>Référence</th>
                          <th>Montant</th>
                          <th>Statut</th>
                          <th>Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contract.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="font-bold" data-label="Référence">
                              {p.external_reference || "—"}
                            </td>
                            <td
                              className="font-extrabold tabular-nums"
                              data-label="Montant"
                            >
                              {formatMoney(p.amount)}
                            </td>
                            <td data-label="Statut">
                              <StatusBadge status={p.status} />
                            </td>
                            <td
                              className="text-[13px] text-black/45"
                              data-label="Date"
                            >
                              {formatDate(p.created_at)}
                            </td>
                          </tr>
                        ))}
                        {!contract.payments.length ? (
                          <tr>
                            <td
                              className="py-8 text-center text-sm font-semibold text-black/38"
                              colSpan={4}
                            >
                              Aucun paiement enregistré
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </Panel>

                <Panel title="Commission">
                  {contract.commission_snapshot ? (
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                      <InfoField
                        label="Commission totale"
                        value={formatMoney(contract.commission_snapshot.commission_total)}
                        highlight
                      />
                      <InfoField
                        label="Net Horus"
                        value={formatMoney(contract.commission_snapshot.net_to_horus)}
                      />
                      <InfoField
                        label="Part Prime RC"
                        value={formatMoney(
                          contract.commission_snapshot.commission_prime_rc_amount,
                        )}
                      />
                      <InfoField
                        label="Part Police"
                        value={formatMoney(
                          contract.commission_snapshot.commission_policy_fee_amount,
                        )}
                      />
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-black/38">
                      Aucun snapshot commission.
                    </p>
                  )}
                </Panel>
              </div>

              {/* ── Right sidebar ─────────────────────────────── */}
              <aside className="space-y-5 xl:sticky xl:top-[74px]">
                {/* Actions panel */}
                <section className="app-surface overflow-hidden">
                  <div className="border-b border-border px-4 py-3.5">
                    <h2 className="text-[13.5px] font-extrabold">Actions</h2>
                  </div>
                  <div className="space-y-2 p-4">
                    {contract.internal_status === "DRAFT" ? (
                      <Link
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-[var(--primary-strong)] text-sm font-extrabold text-white shadow-sm shadow-primary/25 transition hover:shadow-[0_4px_14px_rgba(150,0,192,0.35)] hover:brightness-105"
                        href={`/contracts/new?draftId=${contract.id}`}
                      >
                        <FilePenLine size={15} />
                        Reprendre le brouillon
                      </Link>
                    ) : null}

                    <ActionButton
                      disabled={
                        isActionLoading ||
                        !["DRAFT", "QUOTE_READY"].includes(contract.internal_status)
                      }
                      icon={Calculator}
                      isLoading={isActionLoading}
                      onClick={calculateQuote}
                      variant="secondary"
                    >
                      Calculer le devis
                    </ActionButton>

                    <ActionButton
                      disabled={
                        isActionLoading ||
                        payableAmount === null ||
                        !["QUOTE_READY", "PAYMENT_PENDING"].includes(
                          contract.internal_status,
                        )
                      }
                      icon={Banknote}
                      isLoading={isActionLoading}
                      onClick={confirmPayment}
                      variant="dark"
                    >
                      Confirmer le paiement
                    </ActionButton>

                    <ActionButton
                      disabled={
                        isActionLoading || contract.internal_status !== "PAID"
                      }
                      icon={Send}
                      isLoading={isActionLoading}
                      onClick={emitContract}
                      variant="primary"
                    >
                      Émettre le contrat
                    </ActionButton>

                    {contract.internal_status === "ISSUED" ? (
                      <ActionButton
                        disabled={isActionLoading}
                        icon={XCircle}
                        isLoading={isActionLoading}
                        onClick={() => setShowCancelDialog(true)}
                        variant="danger"
                      >
                        Annuler le contrat
                      </ActionButton>
                    ) : null}
                  </div>
                </section>

                {/* Quote result */}
                {quote ? (
                  <section className="app-surface overflow-hidden animate-fade-in">
                    <div className="border-b border-border px-4 py-3.5">
                      <h2 className="text-[13.5px] font-extrabold">Devis calculé</h2>
                    </div>
                    <div className="divide-y divide-border">
                      <QuoteRow label="Type" value={quote.type} text />
                      <QuoteRow label="Prime RC" value={formatMoney(quote.prime_rc_ass)} />
                      <QuoteRow label="Police ASS" value={formatMoney(quote.policy_fee_ass)} />
                      {quote.taxe !== undefined ? (
                        <QuoteRow label="Taxe" value={formatMoney(quote.taxe ?? 0)} />
                      ) : null}
                      {quote.cedeao !== undefined ? (
                        <QuoteRow label="CEDEAO" value={formatMoney(quote.cedeao ?? 0)} />
                      ) : null}
                      {quote.reduction !== undefined && (quote.reduction ?? 0) > 0 ? (
                        <QuoteRow
                          label="Réduction"
                          value={`−${formatMoney(quote.reduction ?? 0)}`}
                          reduction
                        />
                      ) : null}
                      {quote.prime_totale !== undefined ? (
                        <QuoteRow
                          label="Prime totale"
                          value={formatMoney(quote.prime_totale ?? 0)}
                          total
                        />
                      ) : null}
                    </div>
                    {quote.warnings.length ? (
                      <div className="m-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800">
                        {quote.warnings.join(" ")}
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {/* Attestations */}
                <AttestationsPanel
                  attestations={contract.ass_attestations}
                  fallback={{
                    attestationNumber:
                      issueResult?.attestation_number || contract.attestation_number,
                    dateExpiration:
                      issueResult?.date_expiration || contract.date_expiration || null,
                    linkAttestation:
                      issueResult?.link_attestation_digitale ||
                      contract.link_attestation_digitale,
                    linkCarteBrune:
                      issueResult?.link_attestation_cedeao ||
                      contract.link_attestation_cedeao,
                    referenceExterne:
                      issueResult?.reference_externe || contract.reference_externe,
                  }}
                />
              </aside>
            </div>
          </>
        ) : null}
      </div>

      {/* ── Cancel modal ─────────────────────────────────────────── */}
      {showCancelDialog ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowCancelDialog(false);
          }}
        >
          <div className="animate-scale-in w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <XCircle size={21} />
              </span>
              <div>
                <h3 className="text-base font-black">Annuler le contrat</h3>
                <p className="mt-1 text-sm font-medium text-black/45">
                  Cette action est irréversible. L&apos;attestation sera annulée auprès
                  de l&apos;ASS.
                </p>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-black/45">
                  Méthode
                </label>
                <select
                  className="app-field text-sm"
                  onChange={(e) => setCancelMethod(e.target.value as CancelMethod)}
                  value={cancelMethod}
                >
                  <option value="ANNULER">Annuler</option>
                  <option value="RESILIER">Résilier</option>
                  <option value="SUSPENDRE">Suspendre</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-black/45">
                  Motif (optionnel)
                </label>
                <input
                  className="app-field text-sm"
                  onChange={(e) => setCancelMotif(e.target.value)}
                  placeholder="Ex: Erreur de saisie"
                  type="text"
                  value={cancelMotif}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-2.5">
              <button
                className="flex h-10 flex-1 items-center justify-center rounded-xl border border-border text-sm font-bold transition hover:bg-muted"
                onClick={() => setShowCancelDialog(false)}
                type="button"
              >
                Retour
              </button>
              <button
                className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-extrabold text-white transition hover:bg-red-700 active:scale-[0.98]"
                onClick={handleCancel}
                type="button"
              >
                <XCircle size={15} />
                Confirmer
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="app-surface overflow-hidden">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-[13.5px] font-extrabold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function InfoField({
  label,
  value,
  mono = false,
  highlight = false,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-black/38">{label}</p>
      <p
        className={`mt-1 text-sm font-bold ${mono ? "font-mono" : ""} ${highlight ? "text-primary" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function QuoteRow({
  label,
  value,
  total = false,
  reduction = false,
  text = false,
}: {
  label: string;
  value: string;
  total?: boolean;
  reduction?: boolean;
  text?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-3 ${total ? "bg-primary/[0.04]" : ""}`}
    >
      <span
        className={`text-xs font-bold ${total ? "font-extrabold text-primary" : "text-black/50"}`}
      >
        {label}
      </span>
      <span
        className={`text-sm font-extrabold tabular-nums ${
          total ? "text-primary" : reduction ? "text-emerald-600" : text ? "text-foreground" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  icon: Icon,
  isLoading,
  onClick,
  variant,
}: {
  children: React.ReactNode;
  disabled: boolean;
  icon: typeof Calculator;
  isLoading: boolean;
  onClick: () => void;
  variant: "primary" | "secondary" | "dark" | "danger";
}) {
  const base =
    "flex h-10 w-full items-center justify-center gap-2 rounded-xl text-sm font-extrabold transition disabled:cursor-not-allowed disabled:opacity-35 active:scale-[0.98]";
  const styles = {
    primary:
      "bg-gradient-to-br from-primary to-[var(--primary-strong)] text-white shadow-sm shadow-primary/20 hover:shadow-[0_4px_14px_rgba(150,0,192,0.35)] hover:brightness-105",
    secondary:
      "border border-border bg-white text-foreground hover:bg-muted hover:border-[var(--border-strong)]",
    dark: "bg-[#111218] text-white hover:bg-black/80",
    danger:
      "border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:border-red-300",
  };
  return (
    <button
      className={`${base} ${styles[variant]}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {isLoading && !disabled ? (
        <LoaderCircle className="animate-spin" size={15} />
      ) : (
        <Icon size={15} />
      )}
      {children}
    </button>
  );
}

function AttestationsPanel({
  attestations,
  fallback,
}: {
  attestations: ContractDetail["ass_attestations"];
  fallback: {
    attestationNumber: string;
    dateExpiration: string | null;
    linkAttestation: string;
    linkCarteBrune: string;
    referenceExterne: string;
  };
}) {
  const rows = attestations.length
    ? attestations
    : fallback.attestationNumber || fallback.referenceExterne
      ? [
          {
            kind: "VEHICLE" as const,
            label: "Véhicule",
            immatriculation: "",
            reference_externe: fallback.referenceExterne,
            attestation_number: fallback.attestationNumber,
            secure_key: "",
            date_expiration: fallback.dateExpiration,
            link_attestation_digitale: fallback.linkAttestation,
            link_attestation_cedeao: fallback.linkCarteBrune,
          },
        ]
      : [];

  return (
    <section className="app-surface overflow-hidden">
      <div className="border-b border-border px-4 py-3.5">
        <h2 className="text-[13.5px] font-extrabold">Attestations</h2>
      </div>
      <div className="p-4">
        {rows.length ? (
          <div className="divide-y divide-border">
            {rows.map((a) => (
              <div
                className="grid gap-3 py-4 first:pt-0 last:pb-0"
                key={`${a.kind}-${a.reference_externe}-${a.attestation_number}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-black">{a.label}</p>
                    <p className="mt-0.5 text-[10px] font-black uppercase tracking-wide text-black/38">
                      {a.kind === "TRAILER" ? "Remorque" : "Véhicule"}
                      {a.immatriculation ? ` · ${a.immatriculation}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-right font-mono text-sm font-black tabular-nums text-primary">
                    {a.attestation_number || "—"}
                  </span>
                </div>
                <InfoField
                  label="Référence externe"
                  value={a.reference_externe || "—"}
                  mono
                />
                <InfoField
                  label="Expiration"
                  value={a.date_expiration ? formatDate(a.date_expiration) : "—"}
                />
                <div className="flex flex-wrap gap-3 text-[13px] font-bold">
                  {a.link_attestation_digitale ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={a.link_attestation_digitale}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Attestation
                      <ExternalLink size={11} />
                    </a>
                  ) : null}
                  {a.link_attestation_cedeao ? (
                    <a
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                      href={a.link_attestation_cedeao}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Carte brune
                      <ExternalLink size={11} />
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm font-semibold text-black/38">Aucune attestation émise.</p>
        )}
      </div>
    </section>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
