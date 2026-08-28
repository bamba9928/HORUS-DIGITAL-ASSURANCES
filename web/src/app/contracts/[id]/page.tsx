"use client";

import {
  ArrowLeft,
  Banknote,
  Calculator,
  Download,
  ExternalLink,
  FilePenLine,
  FileText,
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
import {
  AlertMessage,
  ContractTypeBadge,
  DataList,
  DataRow,
  Panel,
  StatStrip,
  StatusBadge,
  humanize,
} from "@/components/ui";
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

  // La date d'effet vit dans le brouillon, à un endroit différent selon le produit.
  const effectDate = useMemo(() => {
    if (!contract) return null;
    const payload = contract.draft_payload as DraftPayload;
    return (
      payload.vehicle?.effectDate ||
      payload.fleet?.effectDate ||
      payload.garage?.effectDate ||
      null
    );
  }, [contract]);

  const payableAmount = useMemo(() => {
    if (!contract?.prime_rc_ass) return null;
    // Net à verser = TTC − coût de police. L'apporteur retient le coût de police
    // à la source, il ne verse que le solde (règle du 28/08/2026). Le backend
    // applique la même formule dans payments.services.expected_payment_amount :
    // envoyer le TTC entier ferait échouer la confirmation de paiement.
    // TTC = prime totale ASS (taxe, CEDEAO, fonds de garantie…) quand elle
    // existe ; sinon prime RC + coût de police.
    const primeTotale = contract.quote_breakdown?.prime_totale;
    const ttc =
      primeTotale && primeTotale > 0
        ? primeTotale
        : contract.prime_rc_ass + contract.cout_police_ass;
    return Math.max(0, ttc - contract.cout_police_ass);
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
      title={`Contrat ${params.id}`}
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
            {/* ── Hero : identité, avancement et montants dans un seul bloc ── */}
            <section className="app-surface overflow-hidden animate-fade-in">
              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={contract.internal_status} />
                      {contract.ass_status ? (
                        <StatusBadge status={contract.ass_status} />
                      ) : null}
                      <ContractTypeBadge contractType={contract.contract_type} />
                    </div>
                    <h2 className="mt-2.5 text-[19px] font-black leading-tight tracking-[-0.03em] text-strong sm:text-[21px]">
                      {contract.vehicle_label || humanize(contract.contract_type)}
                    </h2>
                    <p className="mt-1 text-[12.5px] font-semibold text-faint">
                      {contract.contributor_username}
                      {contract.organization_name
                        ? ` · ${contract.organization_name}`
                        : ""}
                    </p>
                  </div>
                  {contract.immatriculation ? (
                    <div className="shrink-0 rounded-[10px] border-[1.5px] border-border bg-[#fbfbfe] px-3 py-1.5 text-right">
                      <p className="eyebrow">Immatriculation</p>
                      <p className="font-mono text-[15px] font-black tracking-[-0.02em] text-strong">
                        {contract.immatriculation}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Workflow stepper */}
              {contract.internal_status !== "CANCELLED" ? (
                <div className="border-t border-border px-4 py-3.5 sm:px-5">
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
                                  : "text-black/28"
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
                            <span className="hidden text-[10px] font-extrabold uppercase tracking-[0.04em] sm:block">
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

              {/* Dates clés — même grille que les montants pour un alignement net */}
              <StatStrip
                items={[
                  { label: "Créé le", value: formatDate(contract.created_at) },
                  {
                    label: "Date d'effet",
                    value: effectDate ? formatDate(effectDate) : "—",
                  },
                  {
                    label: "Échéance",
                    value: contract.date_expiration
                      ? formatDate(contract.date_expiration)
                      : "—",
                  },
                  {
                    label: "Attestation",
                    value: contract.attestation_number || "—",
                    mono: Boolean(contract.attestation_number),
                  },
                ]}
                size="sm"
              />

              {/* Montants — la synthèse ; le détail reste dans « Tarification » */}
              <StatStrip
                items={[
                  {
                    label: "Prime RC",
                    value:
                      contract.prime_rc_ass === null
                        ? "—"
                        : formatMoney(contract.prime_rc_ass),
                  },
                  { label: "Police ASS", value: formatMoney(contract.cout_police_ass) },
                  {
                    label: "TTC ASS",
                    value: contract.ttc_ass === null ? "—" : formatMoney(contract.ttc_ass),
                    tone: "primary",
                  },
                  {
                    label: "Net à verser",
                    value: payableAmount === null ? "—" : formatMoney(payableAmount),
                    tone: "success",
                  },
                ]}
              />
            </section>

            {/* ── Main grid ──────────────────────────────────────── */}
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
              {/* Left column */}
              <div className="space-y-5">
                <DraftDetailsPanel contract={contract} />

                <Panel bodyClassName="" icon={Banknote} title="Paiements">
                  <div className="overflow-x-auto">
                    <table className="app-table app-table-responsive">
                      <thead>
                        <tr>
                          <th>Référence</th>
                          <th>Statut</th>
                          <th>Date</th>
                          <th className="num">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {contract.payments.map((p) => (
                          <tr key={p.id}>
                            <td className="row-head" data-label="Référence">
                              <span className="cell-mono">
                                {p.external_reference || "—"}
                              </span>
                            </td>
                            <td data-label="Statut">
                              <StatusBadge status={p.status} />
                            </td>
                            <td data-label="Date">
                              <span className="cell-sub">{formatDate(p.created_at)}</span>
                            </td>
                            <td className="num" data-label="Montant">
                              <span className="text-[13.5px] font-black text-strong">
                                {formatMoney(p.amount)}
                              </span>
                            </td>
                          </tr>
                        ))}
                        {!contract.payments.length ? (
                          <tr>
                            <td
                              className="py-8 text-center text-sm font-semibold text-faint"
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

                <Panel icon={Calculator} title="Commission">
                  {contract.commission_snapshot ? (
                    <DataList columns={2}>
                      <DataRow
                        accent
                        label="Commission totale"
                        value={formatMoney(contract.commission_snapshot.commission_total)}
                      />
                      <DataRow
                        label="Marge Horus"
                        value={formatMoney(contract.commission_snapshot.marge_horus)}
                      />
                      <DataRow
                        label="Reversé ASS"
                        value={formatMoney(
                          contract.commission_snapshot.montant_reverse_ass,
                        )}
                      />
                      <DataRow
                        label="Part prime RC"
                        value={formatMoney(
                          contract.commission_snapshot.commission_prime_rc_amount,
                        )}
                      />
                      <DataRow
                        label="Part police"
                        value={formatMoney(
                          contract.commission_snapshot.commission_policy_fee_amount,
                        )}
                      />
                    </DataList>
                  ) : (
                    <p className="text-sm font-semibold text-faint">
                      Aucun snapshot commission.
                    </p>
                  )}
                </Panel>
              </div>

              {/* ── Right sidebar ─────────────────────────────── */}
              <aside className="space-y-5 xl:sticky xl:top-[74px]">
                {/* Actions panel */}
                <Panel bodyClassName="space-y-2 p-3.5" title="Actions">
                  <>
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
                  </>
                </Panel>

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

  // Selon le produit, la couverture est portée par le véhicule, la flotte ou le garage.
  const coverage: { effectDate?: string; duration?: string; periodicity?: string } =
    contract.contract_type === "FLEET"
      ? (fleet ?? {})
      : contract.contract_type === "GARAGE"
        ? (garage ?? {})
        : (vehicle ?? {});

  function personName(p: DraftPerson | undefined) {
    if (!p) return "—";
    return [p.firstName, p.lastName].filter(Boolean).join(" ") || "—";
  }

  function durationLabel(v: { duration?: string; periodicity?: string }) {
    if (!v.duration) return null;
    return `${v.duration} ${v.periodicity === "JOUR" ? "jour(s)" : "mois"}`;
  }

  return (
    <Panel icon={FileText} title="Détails du contrat">
      {isEmpty ? (
        <p className="text-sm font-semibold text-faint">Brouillon vide.</p>
      ) : (
        <div className="space-y-5">
          {/* ── Parties ──────────────────────────────────── */}
          {policyholder || insured ? (
            <Block title="Parties">
              <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
                {policyholder ? (
                  <div>
                    <p className="eyebrow mb-1 text-primary">Souscripteur</p>
                    <DataList>
                      <DataRow label="Nom complet" value={personName(policyholder)} />
                      <DataRow label="Téléphone" value={policyholder.phone || "—"} mono />
                      <DataRow label="Email" value={policyholder.email || "—"} />
                      <DataRow label="Adresse" value={policyholder.address || "—"} />
                    </DataList>
                  </div>
                ) : null}
                {insured ? (
                  <div>
                    <p className="eyebrow mb-1 text-primary">Assuré</p>
                    <DataList>
                      <DataRow label="Nom complet" value={personName(insured)} />
                      <DataRow label="Téléphone" value={insured.phone || "—"} mono />
                      <DataRow label="Email" value={insured.email || "—"} />
                      <DataRow label="Adresse" value={insured.address || "—"} />
                    </DataList>
                  </div>
                ) : null}
              </div>
            </Block>
          ) : null}

          {/* ── Véhicule (mono) ───────────────────────────── */}
          {vehicle && contract.contract_type !== "GARAGE" ? (
            <Block title="Véhicule">
              <DataList columns={2}>
                <DataRow label="Marque" value={vehicle.brand || "—"} />
                <DataRow label="Modèle" value={vehicle.model || "—"} />
                <DataRow
                  label="Immatriculation"
                  mono
                  value={vehicle.registration || contract.immatriculation || "—"}
                />
                <DataRow label="Genre" value={vehicle.subcategory || "—"} />
                <DataRow label="Énergie" value={vehicle.energy || "—"} />
                <DataRow
                  label={vehicle.cylindree ? "Cylindrée" : "Puissance fiscale"}
                  value={
                    vehicle.cylindree
                      ? `${vehicle.cylindree} cm³`
                      : vehicle.fiscalPower
                        ? `${vehicle.fiscalPower} CV`
                        : "—"
                  }
                />
                <DataRow label="Places" value={vehicle.seats || "—"} />
                <DataRow
                  label="1re circulation"
                  value={
                    vehicle.firstCirculationDate
                      ? formatDate(vehicle.firstCirculationDate)
                      : "—"
                  }
                />
              </DataList>
            </Block>
          ) : null}

          {/* ── Garage ───────────────────────────────────── */}
          {garage && contract.contract_type === "GARAGE" ? (
            <Block title="Garage">
              <DataList columns={2}>
                <DataRow label="Genre" value={garage.subcategory || "—"} />
                <DataRow label="Nombre de cartes" value={garage.nombreCarte || "—"} />
                <DataRow label="Immatriculation" mono value={garage.registration || "—"} />
              </DataList>
            </Block>
          ) : null}

          {/* ── Couverture ───────────────────────────────── */}
          <Block title="Couverture">
            <DataList columns={2}>
              <DataRow
                label="Date d'effet"
                value={coverage.effectDate ? formatDate(coverage.effectDate) : "—"}
              />
              <DataRow label="Durée" value={durationLabel(coverage) || "—"} />
              <DataRow
                label="Échéance"
                value={
                  contract.date_expiration ? formatDate(contract.date_expiration) : "—"
                }
              />
              <DataRow
                label="Garanties"
                value={
                  guarantees?.length ? (
                    <span className="flex flex-wrap gap-1">
                      {guarantees.map((g) => (
                        <span
                          className="rounded-md bg-primary/10 px-2 py-0.5 text-[11.5px] font-bold text-primary"
                          key={g}
                        >
                          {g}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "RC seule"
                  )
                }
              />
            </DataList>
            {guaranteeOptions && Object.entries(guaranteeOptions).some(([, v]) => v) ? (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                {Object.entries(guaranteeOptions)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <span
                      className="rounded-md border border-border bg-[#fbfbfe] px-2.5 py-1 text-[11.5px] font-bold text-body"
                      key={k}
                    >
                      {k} : {v}
                    </span>
                  ))}
              </div>
            ) : null}
          </Block>

          {/* ── Flotte ───────────────────────────────────── */}
          {fleet?.vehicles?.length ? (
            <Block title={`Flotte — ${fleet.vehicles.length} véhicule(s)`}>
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="app-table app-table-responsive">
                  <thead>
                    <tr>
                      <th>Véhicule</th>
                      <th>Immat. / châssis</th>
                      <th className="center">Remorques</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fleet.vehicles.map((v, i) => (
                      <tr key={v.id ?? i}>
                        <td className="row-head" data-label="Véhicule">
                          <span className="cell-main">
                            {[v.brand, v.model].filter(Boolean).join(" ") ||
                              `Véhicule ${i + 1}`}
                          </span>
                        </td>
                        <td data-label="Immat. / châssis">
                          <span className="cell-mono">
                            {v.registration || v.chassis || "—"}
                          </span>
                        </td>
                        <td className="center" data-label="Remorques">
                          <span className="font-bold text-body">
                            {v.trailers?.length ?? 0}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Block>
          ) : null}
        </div>
      )}
    </Panel>
  );
}

/* Bloc de section interne : un titre discret, un filet, un contenu aligné. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2.5">
        <p className="eyebrow shrink-0">{title}</p>
        <span className="h-px flex-1 bg-border" />
      </div>
      {children}
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
      className={`flex items-baseline justify-between gap-3 px-4 ${
        total ? "bg-primary/[0.05] py-3" : "py-2"
      }`}
    >
      <span
        className={
          total
            ? "text-[11px] font-black uppercase tracking-[0.06em] text-primary"
            : "text-[12px] font-bold text-muted-fg"
        }
      >
        {label}
      </span>
      <span
        className={`tabular-nums ${
          total
            ? "text-[15px] font-black text-primary"
            : `text-[13px] font-extrabold ${
                reduction ? "text-emerald-600" : text ? "text-strong" : "text-strong"
              }`
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
      <div className="panel-head">
        <h2 className="panel-title">
          <Calculator className="text-primary" size={14} />
          Tarification
        </h2>
      </div>
      <div className="divide-y divide-[#f0f2f8]">
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
          <div className="px-4 pb-1.5 pt-2.5">
            <p className="eyebrow">Véhicules ({fleetItems.length})</p>
          </div>
          <div className="divide-y divide-[#f0f2f8] pb-2">
            {fleetItems.map((item) => (
              <div
                className="flex items-baseline justify-between gap-3 px-4 py-2"
                key={item.request_id}
              >
                <span className="truncate text-[12px] font-bold text-muted-fg">
                  {item.label}
                </span>
                <span className="shrink-0 text-[12.5px] font-extrabold tabular-nums text-strong">
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
      <div className="panel-head">
        <h2 className="panel-title">
          <ShieldCheck className="text-primary" size={14} />
          Attestations
        </h2>
      </div>
      <div className="p-4">
        {rows.length ? (
          <div className="divide-y divide-border">
            {rows.map((a) => (
              <div
                className="py-3.5 first:pt-0 last:pb-0"
                key={`${a.kind}-${a.reference_externe}-${a.attestation_number}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-black text-strong">
                      {a.label}
                    </p>
                    <p className="eyebrow mt-0.5">
                      {a.kind === "TRAILER" ? "Remorque" : "Véhicule"}
                      {a.immatriculation ? ` · ${a.immatriculation}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-right font-mono text-[13px] font-black tabular-nums text-primary">
                    {a.attestation_number || "—"}
                  </span>
                </div>
                <DataList className="mt-2">
                  <DataRow label="Réf. externe" mono value={a.reference_externe || "—"} />
                  <DataRow
                    label="Expiration"
                    value={a.date_expiration ? formatDate(a.date_expiration) : "—"}
                  />
                </DataList>
                {(a.link_attestation_digitale || a.link_attestation_cedeao) ? (
                  <div className="mt-2.5 flex flex-wrap gap-2">
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
          <p className="text-sm font-semibold text-faint">Aucune attestation émise.</p>
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
