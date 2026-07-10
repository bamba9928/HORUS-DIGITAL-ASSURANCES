"use client";

import { ExternalLink, RefreshCw, Smartphone, X } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandSpinner } from "@/components/ui";
import {
  getOmPaymentStatus,
  initiateOmPayment,
  type OmInitiateResult,
} from "@/lib/api";

const POLL_INTERVAL_MS = 4000;

/**
 * Paiement Orange Money : initie la demande, affiche le QR + deeplinks,
 * puis sonde le statut jusqu'à confirmation (ou échec/expiration).
 * À monter uniquement quand il est ouvert (l'état repart à zéro à chaque ouverture).
 */
export function OmPaymentDialog({
  contractId,
  onClose,
  onConfirmed,
}: {
  contractId: number;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [data, setData] = useState<OmInitiateResult | null>(null);
  const [error, setError] = useState("");
  const [isInitiating, setIsInitiating] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const confirmedRef = useRef(false);

  const initiate = useCallback(() => {
    confirmedRef.current = false;
    return initiateOmPayment(contractId)
      .then((res) => {
        setData(res);
        setError("");
        setSecondsLeft(res.qr.validity_seconds ?? null);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Initialisation du paiement impossible.",
        );
      })
      .finally(() => {
        setIsInitiating(false);
      });
  }, [contractId]);

  // Nouvelle tentative (bouton) : réinitialise l'affichage avant de relancer.
  function retry() {
    setError("");
    setData(null);
    setIsInitiating(true);
    void initiate();
  }

  // Initiation au montage (le parent ne monte le dialogue que lorsqu'il est ouvert).
  useEffect(() => {
    void initiate();
  }, [initiate]);

  // Sondage du statut tant que le paiement est en attente.
  useEffect(() => {
    if (!data || data.payment.status !== "PENDING") return;
    const paymentId = data.payment.id;
    const timer = setInterval(async () => {
      try {
        const res = await getOmPaymentStatus(paymentId);
        if (res.payment.status === "CONFIRMED") {
          if (!confirmedRef.current) {
            confirmedRef.current = true;
            onConfirmed();
          }
        } else if (res.payment.status !== "PENDING") {
          setData((current) =>
            current ? { ...current, payment: res.payment } : current,
          );
          setError("Le paiement a échoué ou a expiré. Vous pouvez réessayer.");
        }
      } catch (err) {
        // Montant encaissé ≠ devis (400) : on arrête le sondage et on affiche.
        setError(
          err instanceof Error ? err.message : "Vérification du paiement impossible.",
        );
        setData((current) =>
          current
            ? { ...current, payment: { ...current.payment, status: "FAILED" } }
            : current,
        );
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [data, onConfirmed]);

  // Compte à rebours de validité du QR.
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const payment = data?.payment ?? null;
  const isFailed = payment ? ["FAILED", "CANCELLED"].includes(payment.status) : false;
  const expired = secondsLeft !== null && secondsLeft <= 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        aria-label="Fermer"
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-modal="true"
        className="app-surface-raised animate-scale-in relative z-10 w-full max-w-sm p-6 text-center shadow-xl"
        role="dialog"
      >
        <button
          aria-label="Fermer"
          className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-lg text-black/40 transition hover:bg-muted hover:text-black"
          onClick={onClose}
          type="button"
        >
          <X size={16} />
        </button>

        <span className="mx-auto flex size-11 items-center justify-center rounded-2xl bg-[#ff7900]/12 text-[#ff7900]">
          <Smartphone size={20} />
        </span>
        <h2 className="mt-3 text-[16px] font-extrabold tracking-tight">
          Paiement Orange Money
        </h2>

        {payment ? (
          <p className="mt-1 text-sm font-medium text-black/45">
            {new Intl.NumberFormat("fr-FR").format(payment.amount)} FCFA — le client
            scanne le QR avec MaxIt / Orange Money.
          </p>
        ) : null}

        {isInitiating ? (
          <div className="flex min-h-56 items-center justify-center">
            <BrandSpinner size="lg" />
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {error}
          </p>
        ) : null}

        {data && payment?.status === "PENDING" && !expired ? (
          <>
            {data.qr.mock ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                Mode démonstration — confirmation simulée automatique
              </p>
            ) : null}
            <div className="mt-4 flex justify-center">
              {/* Data-URI généré par l'API OM : dimension fixe, hors pipeline next/image */}
              <Image
                alt="QR code de paiement Orange Money"
                className="rounded-2xl border border-border bg-white p-2"
                height={210}
                src={data.qr.qr_code}
                unoptimized
                width={210}
              />
            </div>
            {secondsLeft !== null ? (
              <p className="mt-2 text-xs font-semibold text-black/38">
                QR valable {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, "0")}
              </p>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-2">
              {Object.entries(data.qr.deep_links).map(([label, url]) => (
                <a
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-white text-[13px] font-bold text-black/75 shadow-xs transition hover:bg-muted"
                  href={url}
                  key={label}
                  rel="noreferrer"
                  target="_blank"
                >
                  <ExternalLink size={13} />
                  {label === "MAXIT" ? "MaxIt" : "Orange Money"}
                </a>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-black/40">
              <BrandSpinner size="sm" />
              En attente du paiement…
            </div>
          </>
        ) : null}

        {(isFailed || expired || (error && !data)) && !isInitiating ? (
          <button
            className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-[var(--primary-strong)] px-6 text-sm font-extrabold text-white shadow-sm shadow-primary/30 transition hover:brightness-105"
            onClick={retry}
            type="button"
          >
            <RefreshCw size={15} />
            Générer un nouveau QR
          </button>
        ) : null}
      </div>
    </div>
  );
}
