"use client";

import {
  ArrowLeft,
  Banknote,
  Calculator,
  CheckCircle2,
  Download,
  ExternalLink,
  FilePenLine,
  LoaderCircle,
  Send,
  ShieldCheck,
  Smartphone,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/components/AuthProvider";
import { OmPaymentDialog } from "@/components/OmPaymentDialog";
import { useToast } from "@/components/ToastProvider";
import { AlertMessage, ContractTypeBadge, MetricCard, StatusBadge, humanize } from "@/components/ui";
import {
  calculateContractQuote,
  cancelContract,
  confirmContractPayment,
  downloadContractPdf,
  fetchContractDetail,
  issueContract,
  type CancelMethod,
  type ContractDetail,
  type ContractQuote,
  type IssueResult,
  type QuoteBreakdown,
} from "@/lib/api";
import {
  canCancelContract,
  canConfirmContractPayment,
  canManageContractWorkflow,
} from "@/lib/permissions";

type DraftVehicle = {
  brand?: string; model?: string; category?: string; registration?: string; chassis?: string;
  energy?: string; fiscalPower?: string; seats?: string; firstCirculationDate?: string;
  effectDate?: string; duration?: string; periodicity?: string; personType?: string;
  subcategory?: string; cylindree?: string; motoUsage?: string;
};
type DraftPerson = { firstName?: string; lastName?: string; phone?: string; email?: string; address?: string; };
type DraftPayload = {
  vehicle?: DraftVehicle;
  fleet?: {
    effectDate?: string; duration?: string; periodicity?: string; personType?: string;
    vehicles?: (DraftVehicle & { id?: string; trailers?: { registration?: string; brand?: string; model?: string; }[] })[];
  };
  garage?: { subcategory?: string; nombreCarte?: string; registration?: string; effectDate?: string; duration?: string; periodicity?: string; };
  policyholder?: DraftPerson;
  insured?: DraftPerson;
  sameAsPolicyholder?: boolean;
  guarantees?: number[];
  guaranteeOptions?: Record<string, string | undefined>;
};

const WORKFLOW_STEPS = [
  "DRAFT",
  "QUOTE_READY",
  "PAYMENT_PENDING",
  "PAID",
  "ISSUING",
  "ISSUED",
] as const;
const STEP_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  QUOTE_READY: "Devis",
  PAYMENT_PENDING: "Paiement",
  PAID: "Payé",
  ISSUING: "Émission",
  ISSUED: "Émis",
};

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const { auth } = useAuth();
  const toast = useToast();
  const contractId = Number(params.id);
  const hasValidId = Number.isFinite(contractId);

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [quote, setQuote] = useState<ContractQuote | null>(null);
  const [issueResult, setIssueResult] = useState<IssueResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(hasValidId);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showOmDialog, setShowOmDialog] = useState(false);
  const [cancelMethod, setCancelMethod] = useState<CancelMethod>("ANNULER");
  const [cancelMotif, setCancelMotif] = useState("");
  const canManageWorkflow = canManageContractWorkflow(auth?.user);
  const canConfirmPayment = canConfirmContractPayment(auth?.user);
  const canCancel = canCancelContract(auth?.user);

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

  // Brouillon complet ? (toutes les conditions du formulaire réunies)
  const draftComplete = useMemo(
    () => (contract ? isDraftReadyForQuote(contract) : false),
    [contract],
  );
  // On ne bloque le calcul que tant que le contrat est encore un brouillon :
  // une fois QUOTE_READY, la complétude a déjà été validée.
  const draftNeedsCompletion =
    Boolean(contract) && contract!.internal_status === "DRAFT" && !draftComplete;

  const payableAmount = useMemo(() => {
    if (!contract?.prime_rc_ass) return null;
    // Le backend attend la prime totale ASS (taxe, CEDEAO, fonds de garantie…)
    // quand elle existe ; sinon prime RC + coût de police.
    const primeTotale = contract.quote_breakdown?.prime_totale;
    return primeTotale && primeTotale > 0
      ? primeTotale
      : contract.prime_rc_ass + contract.cout_police_ass;
  }, [contract]);

  async function calculateQuote() {
    if (!contract) return;
    setError("");
    setIsActionLoading(true);
    try {
      const res = await calculateContractQuote(contract.id);
      setQuote(res.quote);
      await refresh();
      toast.success("Devis calculé", "La prime RC a été mise à jour.");
    } catch (err) {
      toast.error(
        "Calcul du devis impossible",
        err instanceof Error ? err.message : undefined,
      );
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
      toast.success(
        "Paiement confirmé",
        `${new Intl.NumberFormat("fr-FR").format(payableAmount)} FCFA encaissés.`,
      );
    } catch (err) {
      toast.error(
        "Paiement impossible",
        err instanceof Error ? err.message : undefined,
      );
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
      toast.success(
        "Contrat émis",
        res.attestation_number ? `Attestation ${res.attestation_number}` : undefined,
      );
    } catch (err) {
      toast.error(
        "Émission impossible",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      setIsActionLoading(false);
    }
  }

  async function downloadPdf() {
    if (!contract) return;
    try {
      await downloadContractPdf(contract.id);
      toast.success("Récap PDF téléchargé");
    } catch (err) {
      toast.error(
        "Téléchargement impossible",
        err instanceof Error ? err.message : undefined,
      );
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
      toast.success("Contrat annulé", "L'attestation a été annulée auprès d'ASS.");
    } catch (err) {
      toast.error(
        "Annulation impossible",
        err instanceof Error ? err.message : undefined,
      );
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
                    {contract.date_expiration ? (
                      <InfoField label="Expiration" value={formatDate(contract.date_expiration)} />
                    ) : null}
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
                <DraftDetailsPanel contract={contract} />

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
                    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-4">
                      <InfoField
                        label="Commission totale"
                        value={formatMoney(contract.commission_snapshot.commission_total)}
                        highlight
                      />
                      <InfoField
                        label="Marge Horus"
                        value={formatMoney(contract.commission_snapshot.marge_horus)}
                      />
                      <InfoField
                        label="Reversé ASS"
                        value={formatMoney(contract.commission_snapshot.montant_reverse_ass)}
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
                    {canManageWorkflow && contract.internal_status === "DRAFT" ? (
                      <Link
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-[var(--primary-strong)] text-sm font-extrabold text-white shadow-sm shadow-primary/25 transition hover:shadow-[0_4px_14px_rgba(150,0,192,0.35)] hover:brightness-105"
                        href={`/contracts/new?draftId=${contract.id}`}
                      >
                        <FilePenLine size={15} />
                        Reprendre le brouillon
                      </Link>
                    ) : null}

                    {canManageWorkflow ? (
                      <ActionButton
                        disabled={
                          isActionLoading ||
                          !["DRAFT", "QUOTE_READY"].includes(contract.internal_status) ||
                          draftNeedsCompletion
                        }
                        icon={Calculator}
                        isLoading={isActionLoading}
                        onClick={calculateQuote}
                        variant="secondary"
                      >
                        Calculer le devis
                      </ActionButton>
                    ) : null}

                    {canManageWorkflow && draftNeedsCompletion ? (
                      <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        <FilePenLine size={13} className="mt-px shrink-0" />
                        Complétez toutes les informations obligatoires du brouillon
                        (souscripteur, véhicule et couverture) pour pouvoir calculer le devis.
                      </p>
                    ) : null}

                    {canManageWorkflow ? (
                      <ActionButton
                        disabled={
                          isActionLoading ||
                          payableAmount === null ||
                          !["QUOTE_READY", "PAYMENT_PENDING"].includes(
                            contract.internal_status,
                          )
                        }
                        icon={Smartphone}
                        isLoading={isActionLoading}
                        onClick={() => setShowOmDialog(true)}
                        variant="primary"
                      >
                        Payer par Orange Money
                      </ActionButton>
                    ) : null}

                    {canConfirmPayment ? (
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
                    ) : null}

                    {canManageWorkflow ? (
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
                    ) : null}

                    <ActionButton
                      disabled={isActionLoading}
                      icon={Download}
                      isLoading={false}
                      onClick={() => void downloadPdf()}
                      variant="secondary"
                    >
                      Récap PDF
                    </ActionButton>

                    {/* Annulation flotte non supportée : attestations à annuler
                        individuellement auprès d'ASS (garde-fou backend également). */}
                    {canCancel &&
                    contract.internal_status === "ISSUED" &&
                    contract.contract_type !== "FLEET" ? (
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

                {/* Tarification — permanent dès qu'un devis existe */}
                <TarificationPanel
                  breakdown={contract.quote_breakdown}
                  contractType={contract.contract_type}
                  freshQuote={quote}
                />

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

      {/* ── Paiement Orange Money ────────────────────────────────── */}
      {contract && showOmDialog ? (
        <OmPaymentDialog
          contractId={contract.id}
          onClose={() => {
            setShowOmDialog(false);
            void refresh();
          }}
          onConfirmed={() => {
            setShowOmDialog(false);
            void refresh();
            toast.success(
              "Paiement Orange Money confirmé",
              payableAmount !== null
                ? `${new Intl.NumberFormat("fr-FR").format(payableAmount)} FCFA encaissés.`
                : undefined,
            );
          }}
        />
      ) : null}

      {/* ── Cancel modal ─────────────────────────────────────────── */}
      {showCancelDialog && canCancel ? (
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

function DraftDetailsPanel({ contract }: { contract: ContractDetail }) {
  const payload = contract.draft_payload as DraftPayload;
  const { vehicle, fleet, garage, policyholder, insured, guarantees, guaranteeOptions } = payload;

  const isEmpty =
    !vehicle && !fleet?.vehicles?.length && !garage && !policyholder && !insured;

  function personName(p: DraftPerson | undefined) {
    if (!p) return "—";
    return [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
  }

  function durationLabel(v: { duration?: string; periodicity?: string }) {
    if (!v.duration) return null;
    return `${v.duration} ${v.periodicity === "JOUR" ? "jour(s)" : "mois"}`;
  }

  return (
    <Panel title="Détails du contrat">
      {isEmpty ? (
        <p className="text-sm font-semibold text-black/38">Brouillon vide.</p>
      ) : (
        <div className="space-y-6">
          {/* ── Véhicule (mono) ───────────────────────────── */}
          {vehicle && contract.contract_type !== "GARAGE" ? (
            <div>
              <SectionLabel>Véhicule</SectionLabel>
              <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-3">
                {vehicle.brand ? <InfoField label="Marque" value={vehicle.brand} /> : null}
                {vehicle.model ? <InfoField label="Modèle" value={vehicle.model} /> : null}
                {(vehicle.registration || contract.immatriculation) ? (
                  <InfoField label="Immatriculation" value={vehicle.registration || contract.immatriculation} mono />
                ) : null}
                {vehicle.energy ? <InfoField label="Énergie" value={vehicle.energy} /> : null}
                {vehicle.fiscalPower ? <InfoField label="Puissance" value={`${vehicle.fiscalPower} CV`} /> : null}
                {vehicle.seats ? <InfoField label="Places" value={vehicle.seats} /> : null}
                {vehicle.firstCirculationDate ? (
                  <InfoField label="1ère circulat." value={formatDate(vehicle.firstCirculationDate)} />
                ) : null}
                {vehicle.effectDate ? <InfoField label="Date d'effet" value={formatDate(vehicle.effectDate)} /> : null}
                {durationLabel(vehicle) ? (
                  <InfoField label="Durée" value={durationLabel(vehicle)!} />
                ) : null}
                {contract.date_expiration ? (
                  <InfoField label="Échéance" value={formatDate(contract.date_expiration)} />
                ) : null}
                {vehicle.subcategory ? <InfoField label="Genre" value={vehicle.subcategory} /> : null}
              </div>
            </div>
          ) : null}

          {/* ── Garage ───────────────────────────────────── */}
          {garage && contract.contract_type === "GARAGE" ? (
            <div>
              <SectionLabel>Garage</SectionLabel>
              <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:grid-cols-3">
                {garage.subcategory ? <InfoField label="Genre" value={garage.subcategory} /> : null}
                {garage.nombreCarte ? <InfoField label="Nb cartes" value={garage.nombreCarte} /> : null}
                {garage.registration ? <InfoField label="Immatriculation" value={garage.registration} mono /> : null}
                {garage.effectDate ? <InfoField label="Date d'effet" value={formatDate(garage.effectDate)} /> : null}
                {durationLabel(garage) ? <InfoField label="Durée" value={durationLabel(garage)!} /> : null}
                {contract.date_expiration ? (
                  <InfoField label="Échéance" value={formatDate(contract.date_expiration)} />
                ) : null}
              </div>
            </div>
          ) : null}

          {/* ── Flotte ───────────────────────────────────── */}
          {fleet?.vehicles?.length ? (
            <div>
              <SectionLabel>{fleet.vehicles.length} véhicule(s) de flotte</SectionLabel>
              <div className="space-y-1.5">
                {fleet.vehicles.map((v, i) => (
                  <div
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                    key={v.id ?? i}
                  >
                    <span className="min-w-0 flex-1 font-semibold">
                      {[v.brand, v.model].filter(Boolean).join(" ") || `Véhicule ${i + 1}`}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-black/45">
                      {v.registration || v.chassis || "—"}
                    </span>
                    {v.trailers?.length ? (
                      <span className="shrink-0 text-xs text-black/38">
                        {v.trailers.length} rem.
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* ── Souscripteur / Assuré ────────────────────── */}
          {(policyholder || insured) ? (
            <div className="grid gap-5 sm:grid-cols-2">
              {policyholder ? (
                <div>
                  <SectionLabel>Souscripteur</SectionLabel>
                  <div className="space-y-3">
                    <InfoField label="Nom complet" value={personName(policyholder)} />
                    {policyholder.phone ? <InfoField label="Téléphone" value={policyholder.phone} /> : null}
                    {policyholder.email ? <InfoField label="Email" value={policyholder.email} /> : null}
                  </div>
                </div>
              ) : null}
              {insured ? (
                <div>
                  <SectionLabel>Assuré</SectionLabel>
                  <div className="space-y-3">
                    <InfoField label="Nom complet" value={personName(insured)} />
                    {insured.phone ? <InfoField label="Téléphone" value={insured.phone} /> : null}
                    {insured.email ? <InfoField label="Email" value={insured.email} /> : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── Garanties ────────────────────────────────── */}
          {guarantees?.length ? (
            <div>
              <SectionLabel>Garanties ASS</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {guarantees.map((g) => (
                  <span
                    className="rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary"
                    key={g}
                  >
                    Garantie {g}
                  </span>
                ))}
              </div>
              {guaranteeOptions && Object.entries(guaranteeOptions).some(([, v]) => v) ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(guaranteeOptions)
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <span
                        className="rounded-md border border-border px-2.5 py-1 text-xs font-semibold text-black/55"
                        key={k}
                      >
                        {k}: {v}
                      </span>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10.5px] font-black uppercase tracking-wide text-black/38">
      {children}
    </p>
  );
}

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

function TarificationPanel({
  breakdown,
  contractType,
  freshQuote,
}: {
  breakdown: QuoteBreakdown | null;
  contractType: string;
  freshQuote: ContractQuote | null;
}) {
  // Pas de données → rien à afficher
  if (!breakdown && !freshQuote) return null;

  // Fusion : on préfère les données fraîches du serveur (breakdown persistant)
  // mais on garde les warnings / fleet items du quote state en mémoire
  const b: QuoteBreakdown = breakdown ?? {
    prime_rc_ass: freshQuote!.prime_rc_ass,
    cout_police: freshQuote!.policy_fee_ass,
    taxe: freshQuote!.taxe,
    cedeao: freshQuote!.cedeao,
    reduction: freshQuote!.reduction,
    prime_ag: freshQuote!.prime_ag,
    fonds_garantie: freshQuote!.fonds_garantie,
    prime_totale: freshQuote!.prime_totale,
  };

  const warnings = freshQuote?.warnings ?? [];
  const fleetItems = freshQuote?.items ?? [];
  const isFleet = contractType === "FLEET";

  return (
    <section className="app-surface overflow-hidden animate-fade-in">
      <div className="border-b border-border px-4 py-3.5">
        <h2 className="text-[13.5px] font-extrabold">Tarification</h2>
      </div>
      <div className="divide-y divide-border">
        <QuoteRow label="Prime RC" value={formatMoney(b.prime_rc_ass)} />
        <QuoteRow label="Police ASS" value={formatMoney(b.cout_police)} />
        {b.taxe !== undefined && b.taxe !== null ? (
          <QuoteRow label="Taxe" value={formatMoney(b.taxe)} />
        ) : null}
        {b.cedeao !== undefined && b.cedeao !== null ? (
          <QuoteRow label="CEDEAO" value={formatMoney(b.cedeao)} />
        ) : null}
        {b.fonds_garantie !== undefined && b.fonds_garantie !== null && b.fonds_garantie > 0 ? (
          <QuoteRow label="Fonds de garantie" value={formatMoney(b.fonds_garantie)} />
        ) : null}
        {b.prime_ag !== undefined && b.prime_ag !== null && b.prime_ag > 0 ? (
          <QuoteRow label="Prime AG" value={formatMoney(b.prime_ag)} />
        ) : null}
        {b.reduction !== undefined && b.reduction !== null && b.reduction > 0 ? (
          <QuoteRow
            label="Réduction"
            value={`−${formatMoney(b.reduction)}`}
            reduction
          />
        ) : null}
        {b.prime_totale !== undefined && b.prime_totale !== null ? (
          <QuoteRow
            label="Prime totale"
            value={formatMoney(b.prime_totale)}
            total
          />
        ) : null}
      </div>

      {/* Véhicules flotte si disponibles en mémoire */}
      {isFleet && fleetItems.length > 0 ? (
        <div className="border-t border-border">
          <div className="px-4 pb-2 pt-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-black/38">
              Véhicules ({fleetItems.length})
            </p>
          </div>
          <div className="divide-y divide-border pb-2">
            {fleetItems.map((item) => (
              <div
                className="flex items-center justify-between px-4 py-2"
                key={item.request_id}
              >
                <span className="truncate text-xs font-semibold text-black/55">
                  {item.label}
                </span>
                <span className="shrink-0 pl-4 text-xs font-extrabold tabular-nums">
                  {formatMoney(item.prime_rc_ass)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="m-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800">
          {warnings.join(" ")}
        </div>
      ) : null}
    </section>
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
                {(a.link_attestation_digitale || a.link_attestation_cedeao) ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {a.link_attestation_digitale ? (
                      <a
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-3 text-[12px] font-bold text-primary transition hover:bg-primary/20"
                        href={a.link_attestation_digitale}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink size={11} />
                        Attestation digitale
                      </a>
                    ) : null}
                    {a.link_attestation_cedeao ? (
                      <a
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-50 px-3 text-[12px] font-bold text-amber-700 transition hover:bg-amber-100"
                        href={a.link_attestation_cedeao}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <ExternalLink size={11} />
                        Carte brune CEDEAO
                      </a>
                    ) : null}
                  </div>
                ) : null}
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

/* ── Complétude du brouillon (mêmes règles que `canCalculateQuote` du formulaire) ──
   Un devis ne peut être calculé que si toutes les informations obligatoires sont
   saisies : parties, véhicule/garage/flotte et couverture. */
function isDraftPhoneValid(phone?: string) {
  return Boolean(phone && /^7\d{8}$/.test(phone));
}

function isDraftPersonComplete(person?: DraftPerson) {
  return Boolean(
    person?.firstName?.trim() &&
      person?.lastName?.trim() &&
      isDraftPhoneValid(person.phone) &&
      person?.address?.trim(),
  );
}

function isDraftVehicleComplete(
  vehicle: DraftVehicle | undefined,
  { requireCoverage }: { requireCoverage: boolean },
) {
  if (!vehicle) return false;
  const isMoto = vehicle.category === "C5";
  const coreOk = Boolean(
    vehicle.brand &&
      vehicle.model &&
      vehicle.category &&
      vehicle.subcategory &&
      vehicle.energy &&
      vehicle.registration,
  );
  if (!coreOk) return false;
  const powerOk = isMoto
    ? Boolean(vehicle.cylindree)
    : Boolean(vehicle.fiscalPower && vehicle.seats);
  if (!powerOk) return false;
  if (requireCoverage && !(vehicle.effectDate && vehicle.duration && vehicle.periodicity)) {
    return false;
  }
  return true;
}

function isDraftReadyForQuote(contract: ContractDetail): boolean {
  const payload = contract.draft_payload as DraftPayload;
  const partiesOk =
    isDraftPersonComplete(payload.policyholder) &&
    (payload.sameAsPolicyholder !== false || isDraftPersonComplete(payload.insured));
  if (!partiesOk) return false;

  if (contract.contract_type === "FLEET") {
    const fleet = payload.fleet;
    const vehicles = fleet?.vehicles ?? [];
    if (!vehicles.length) return false;
    if (!(fleet?.effectDate && fleet?.duration && fleet?.periodicity)) return false;
    // La couverture est portée au niveau flotte, pas par véhicule.
    return vehicles.every((v) => isDraftVehicleComplete(v, { requireCoverage: false }));
  }

  if (contract.contract_type === "GARAGE") {
    const garage = payload.garage;
    return Boolean(
      garage?.subcategory &&
        garage?.nombreCarte &&
        garage?.effectDate &&
        garage?.duration &&
        garage?.periodicity,
    );
  }

  // AUTO_MONO, MOTO, BUS_SCHOOL : véhicule unique avec sa couverture.
  return isDraftVehicleComplete(payload.vehicle, { requireCoverage: true });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
}

function formatDate(value: string) {
  // Extraire directement YYYY-MM-DD pour éviter les décalages de fuseau horaire
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  // Fallback pour les formats non ISO
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return [
    String(d.getDate()).padStart(2, "0"),
    String(d.getMonth() + 1).padStart(2, "0"),
    d.getFullYear(),
  ].join("-");
}
