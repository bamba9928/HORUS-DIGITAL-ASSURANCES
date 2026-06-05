"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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
    <main className="min-h-screen bg-white text-black">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div>
            <Link className="text-sm font-black uppercase text-primary" href="/">
              Horus
            </Link>
            <h1 className="text-2xl font-black">Contrat #{params.id}</h1>
          </div>
          <nav className="flex gap-4 text-sm font-black">
            <Link href="/contracts">Contrats</Link>
            <Link href="/contracts/new">Nouveau contrat</Link>
            <Link href="/commissions">Commissions</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        {!hasValidContractId ? <ErrorMessage message="Identifiant contrat invalide." /> : null}
        {isLoading ? <p className="font-bold text-black/60">Chargement...</p> : null}
        {error ? <ErrorMessage message={error} /> : null}
        {contract ? (
          <div className="grid grid-cols-[1fr_360px] gap-6">
            <div className="space-y-6">
              <Panel title="Resume">
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Type" value={contract.contract_type} />
                  <Field label="Statut Horus" value={contract.internal_status} />
                  <Field label="Statut ASS" value={contract.ass_status || "-"} />
                  <Field label="Vehicule" value={contract.vehicle_label || "-"} />
                  <Field label="Apporteur" value={contract.contributor_username} />
                  <Field label="Groupe" value={contract.organization_name} />
                </div>
              </Panel>

              <Panel title="Montants">
                <div className="grid grid-cols-4 gap-4">
                  <Metric label="Prime RC" value={formatNullableMoney(contract.prime_rc_ass)} />
                  <Metric label="Police ASS" value={formatMoney(contract.cout_police_ass)} />
                  <Metric label="TTC ASS" value={formatNullableMoney(contract.ttc_ass)} />
                  <Metric label="A payer test" value={payableAmount === null ? "-" : formatMoney(payableAmount)} />
                </div>
              </Panel>

              <Panel title="Paiements">
                <div className="overflow-hidden rounded-md border border-border">
                  <table className="w-full border-collapse text-left text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-3 font-black">Reference</th>
                        <th className="px-4 py-3 font-black">Montant</th>
                        <th className="px-4 py-3 font-black">Statut</th>
                        <th className="px-4 py-3 font-black">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contract.payments.map((payment) => (
                        <tr className="border-t border-border" key={payment.id}>
                          <td className="px-4 py-3 font-bold">{payment.external_reference || "-"}</td>
                          <td className="px-4 py-3 font-bold">{formatMoney(payment.amount)}</td>
                          <td className="px-4 py-3 font-bold">{payment.status}</td>
                          <td className="px-4 py-3 font-bold">{formatDate(payment.created_at)}</td>
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
                  <div className="grid grid-cols-4 gap-4">
                    <Metric
                      label="Commission"
                      value={formatMoney(contract.commission_snapshot.commission_total)}
                    />
                    <Metric
                      label="Net Horus"
                      value={formatMoney(contract.commission_snapshot.net_to_horus)}
                    />
                    <Metric
                      label="Prime RC"
                      value={formatMoney(contract.commission_snapshot.commission_prime_rc_amount)}
                    />
                    <Metric
                      label="Police"
                      value={formatMoney(contract.commission_snapshot.commission_policy_fee_amount)}
                    />
                  </div>
                ) : (
                  <p className="font-bold text-black/60">Aucun snapshot commission.</p>
                )}
              </Panel>
            </div>

            <aside className="space-y-6">
              <Panel title="Actions">
                <div className="space-y-3">
                  {contract.internal_status === "DRAFT" ? (
                    <Link
                      className="flex h-11 w-full items-center justify-center rounded-md bg-primary px-4 font-black text-white"
                      href={`/contracts/new?draftId=${contract.id}`}
                    >
                      Reprendre brouillon
                    </Link>
                  ) : null}
                  <button
                    className="h-11 w-full rounded-md border border-black px-4 font-black text-black disabled:border-black/20 disabled:text-black/30"
                    disabled={
                      isActionLoading ||
                      !["DRAFT", "QUOTE_READY"].includes(contract.internal_status)
                    }
                    onClick={calculateQuote}
                    type="button"
                  >
                    Calculer devis
                  </button>
                  <button
                    className="h-11 w-full rounded-md bg-black px-4 font-black text-white disabled:bg-black/30"
                    disabled={
                      isActionLoading ||
                      payableAmount === null ||
                      !["QUOTE_READY", "PAYMENT_PENDING"].includes(contract.internal_status)
                    }
                    onClick={confirmPayment}
                    type="button"
                  >
                    Confirmer paiement test
                  </button>
                  <button
                    className="h-11 w-full rounded-md bg-primary px-4 font-black text-white disabled:bg-black/30"
                    disabled={isActionLoading || contract.internal_status !== "PAID"}
                    onClick={emitContract}
                    type="button"
                  >
                    Emettre le contrat ASS
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
        ) : null}
      </section>
    </main>
  );
}

function Panel({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="rounded-md border border-border p-5">
      <h2 className="text-lg font-black">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-muted p-4">
      <p className="text-xs font-black uppercase text-black/50">{label}</p>
      <p className="mt-2 text-xl font-black">{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs font-black uppercase text-black/50">{label}</p>
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
                    className="text-primary"
                    href={attestation.link_attestation_digitale}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Attestation digitale
                  </a>
                ) : null}
                {attestation.link_attestation_cedeao ? (
                  <a
                    className="text-primary"
                    href={attestation.link_attestation_cedeao}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Carte brune
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

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mb-4 rounded-md border border-primary bg-white p-3 text-sm font-bold text-primary">
      {message}
    </p>
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
