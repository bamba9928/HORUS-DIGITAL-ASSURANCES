"use client";

import {
  ArrowLeft,
  Banknote,
  Calculator,
  CheckCircle2,
  ExternalLink,
  FilePenLine,
  Send,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { AlertMessage, MetricCard, StatusBadge, humanize } from "@/components/ui";
import {
  calculateContractQuote,
  confirmContractPayment,
  fetchContractDetail,
  issueContract,
  type ContractQuote,
  type ContractDetail,
  type IssueResult,
} from "@/lib/api";

export default function ContractDetailPage() {
  const params = useParams<{ id: string }>();
  const contractId = Number(params.id);
  const hasValidContractId = Number.isFinite(contractId);
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [quote, setQuote] = useState<ContractQuote | null>(null);
  const [issueResult, setIssueResult] = useState<IssueResult | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(hasValidContractId);
  const [isActionLoading, setIsActionLoading] = useState(false);

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

    async function loadInitialData() {
      try {
        const response = await fetchContractDetail(contractId);
        if (!isCancelled) {
          setContract(response);
        }
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Contrat introuvable.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    if (hasValidContractId) {
      void loadInitialData();
    }

    return () => {
      isCancelled = true;
    };
  }, [contractId, hasValidContractId]);

  const payableAmount = useMemo(() => {
    if (!contract?.prime_rc_ass) {
      return null;
    }
    return contract.prime_rc_ass + contract.cout_police_ass;
  }, [contract]);

  async function calculateQuote() {
    if (!contract) {
      return;
    }
    setError("");
    setIsActionLoading(true);
    try {
      const response = await calculateContractQuote(contract.id);
      setQuote(response.quote);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calcul devis impossible.");
    } finally {
      setIsActionLoading(false);
    }
  }

  async function confirmPayment() {
    if (!contract || payableAmount === null) {
      return;
    }
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
    if (!contract) {
      return;
    }
    setError("");
    setIsActionLoading(true);
    try {
      const response = await issueContract(contract.id);
      setIssueResult(response);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Emission impossible.");
    } finally {
      setIsActionLoading(false);
    }
  }

  return (
    <AppShell
      actions={
        <Link
          aria-label="Retour aux contrats"
          className="flex h-10 items-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-extrabold hover:bg-muted"
          href="/contracts"
        >
          <ArrowLeft size={17} />
          <span className="hidden sm:inline">Retour</span>
        </Link>
      }
      description={contract ? contract.vehicle_label || humanize(contract.contract_type) : "Détail du dossier"}
      title={`Contrat #${params.id}`}
    >
      <div className="space-y-5">
        {!hasValidContractId ? <AlertMessage>Identifiant contrat invalide.</AlertMessage> : null}
        {isLoading ? <p className="font-bold text-black/50">Chargement...</p> : null}
        {error ? <AlertMessage>{error}</AlertMessage> : null}
        {contract ? (
          <>
            <section className="app-surface p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={contract.internal_status} />
                    {contract.ass_status ? <StatusBadge status={contract.ass_status} /> : null}
                  </div>
                  <h2 className="mt-4 text-xl font-black">
                    {contract.vehicle_label || humanize(contract.contract_type)}
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-black/48">
                    {contract.contributor_username} · {contract.organization_name}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-right sm:grid-cols-3">
                  <Field label="Type" value={humanize(contract.contract_type)} />
                  <Field label="Immatriculation" value={contract.immatriculation || "-"} />
                  <Field label="Créé le" value={formatDate(contract.created_at)} />
                </div>
              </div>
            </section>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <MetricCard icon={Banknote} label="Prime RC" value={formatNullableMoney(contract.prime_rc_ass)} />
              <MetricCard icon={ShieldCheck} label="Police ASS" value={formatMoney(contract.cout_police_ass)} />
              <MetricCard icon={Banknote} label="TTC ASS" tone="primary" value={formatNullableMoney(contract.ttc_ass)} />
              <MetricCard icon={CheckCircle2} label="Montant attendu" tone="success" value={payableAmount === null ? "-" : formatMoney(payableAmount)} />
            </div>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
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
                      {contract.payments.map((payment) => (
                        <tr key={payment.id}>
                          <td className="font-bold" data-label="Référence">{payment.external_reference || "-"}</td>
                          <td className="font-extrabold" data-label="Montant">{formatMoney(payment.amount)}</td>
                          <td data-label="Statut"><StatusBadge status={payment.status} /></td>
                          <td className="font-semibold text-black/58" data-label="Date">{formatDate(payment.created_at)}</td>
                        </tr>
                      ))}
                      {!contract.payments.length ? (
                        <tr>
                          <td className="px-4 py-6 font-bold text-black/50" colSpan={4}>
                            Aucun paiement.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Commission snapshot">
                {contract.commission_snapshot ? (
                  <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4">
                    <Field label="Commission" value={formatMoney(contract.commission_snapshot.commission_total)} />
                    <Field label="Net Horus" value={formatMoney(contract.commission_snapshot.net_to_horus)} />
                    <Field label="Part Prime RC" value={formatMoney(contract.commission_snapshot.commission_prime_rc_amount)} />
                    <Field label="Part police" value={formatMoney(contract.commission_snapshot.commission_policy_fee_amount)} />
                  </div>
                ) : (
                  <p className="font-bold text-black/48">Aucun snapshot commission.</p>
                )}
              </Panel>
            </div>

            <aside className="space-y-5 xl:sticky xl:top-24">
              <Panel title="Actions">
                <div className="space-y-3">
                  {contract.internal_status === "DRAFT" ? (
                    <Link
                      className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 font-extrabold text-white hover:bg-[var(--primary-strong)]"
                      href={`/contracts/new?draftId=${contract.id}`}
                    >
                      <FilePenLine size={17} />
                      Reprendre brouillon
                    </Link>
                  ) : null}
                  <button
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 font-extrabold hover:bg-muted disabled:text-black/30"
                    disabled={
                      isActionLoading ||
                      !["DRAFT", "QUOTE_READY"].includes(contract.internal_status)
                    }
                    onClick={calculateQuote}
                    type="button"
                  >
                    <Calculator size={17} />
                    Calculer devis
                  </button>
                  <button
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-black px-4 font-extrabold text-white hover:bg-black/80 disabled:bg-black/25"
                    disabled={
                      isActionLoading ||
                      payableAmount === null ||
                      !["QUOTE_READY", "PAYMENT_PENDING"].includes(contract.internal_status)
                    }
                    onClick={confirmPayment}
                    type="button"
                  >
                    <Banknote size={17} />
                    Confirmer paiement
                  </button>
                  <button
                    className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 font-extrabold text-white hover:bg-[var(--primary-strong)] disabled:bg-black/25"
                    disabled={isActionLoading || contract.internal_status !== "PAID"}
                    onClick={emitContract}
                    type="button"
                  >
                    <Send size={17} />
                    Émettre le contrat
                  </button>
                </div>
              </Panel>

              {quote ? (
                <Panel title="Dernier devis">
                  <div className="space-y-3">
                    <Field label="Type" value={quote.type} />
                    <Field label="Prime RC ASS" value={formatMoney(quote.prime_rc_ass)} />
                    <Field label="Police ASS" value={formatMoney(quote.policy_fee_ass)} />
                    {quote.warnings.length ? (
                      <p className="rounded-md border border-primary p-3 text-sm font-bold text-primary">
                        {quote.warnings.join(" ")}
                      </p>
                    ) : null}
                  </div>
                </Panel>
              ) : null}

              <AttestationsPanel
                attestations={contract.ass_attestations}
                fallback={{
                  attestationNumber: issueResult?.attestation_number || contract.attestation_number,
                  dateExpiration:
                    issueResult?.date_expiration || contract.date_expiration || null,
                  linkAttestation:
                    issueResult?.link_attestation_digitale || contract.link_attestation_digitale,
                  linkCarteBrune:
                    issueResult?.link_attestation_cedeao || contract.link_attestation_cedeao,
                  referenceExterne: issueResult?.reference_externe || contract.reference_externe,
                }}
              />
            </aside>
          </div>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="app-surface overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <h2 className="font-extrabold">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-extrabold uppercase text-black/45">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
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
            label: "Vehicule",
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
    <Panel title="Attestations">
      {rows.length ? (
        <div className="divide-y divide-border">
          {rows.map((attestation) => (
            <div
              className="grid gap-3 py-4 first:pt-0 last:pb-0"
              key={`${attestation.kind}-${attestation.reference_externe}-${attestation.attestation_number}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-black">{attestation.label}</p>
                  <p className="mt-1 text-xs font-black uppercase text-black/50">
                    {attestation.kind === "TRAILER" ? "Remorque" : "Vehicule"}
                    {attestation.immatriculation ? ` | ${attestation.immatriculation}` : ""}
                  </p>
                </div>
                <span className="text-right text-sm font-black text-primary">
                  {attestation.attestation_number || "-"}
                </span>
              </div>
              <Field label="Reference externe" value={attestation.reference_externe || "-"} />
              <Field
                label="Expiration"
                value={
                  attestation.date_expiration ? formatDate(attestation.date_expiration) : "-"
                }
              />
              <div className="flex flex-wrap gap-3 text-sm font-black">
                {attestation.link_attestation_digitale ? (
                  <a
                    className="inline-flex items-center gap-1 text-primary"
                    href={attestation.link_attestation_digitale}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Attestation
                    <ExternalLink size={13} />
                  </a>
                ) : null}
                {attestation.link_attestation_cedeao ? (
                  <a
                    className="inline-flex items-center gap-1 text-primary"
                    href={attestation.link_attestation_cedeao}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Carte brune
                    <ExternalLink size={13} />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="font-bold text-black/60">Aucune attestation emise.</p>
      )}
    </Panel>
  );
}

function formatNullableMoney(value: number | null) {
  return value === null ? "-" : formatMoney(value);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value) + " FCFA";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
