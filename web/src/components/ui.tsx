import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Inbox,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";

export function PageAction({
  href,
  icon: Icon,
  children,
  variant = "primary",
}: {
  href: string;
  icon?: typeof ArrowRight;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-extrabold transition ${
        variant === "primary"
          ? "bg-primary text-white hover:bg-[var(--primary-strong)]"
          : "border border-border bg-white text-black hover:bg-muted"
      }`}
      href={href}
    >
      {Icon ? <Icon size={17} /> : null}
      <span className="hidden sm:inline">{children}</span>
    </Link>
  );
}

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: typeof ArrowRight;
  tone?: "neutral" | "primary" | "success" | "warning";
}) {
  const tones = {
    neutral: "bg-black text-white",
    primary: "bg-primary text-white",
    success: "bg-emerald-700 text-white",
    warning: "bg-amber-600 text-white",
  };

  return (
    <div className="app-surface min-w-0 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold text-black/55">{label}</p>
        {Icon ? (
          <span className={`flex size-9 shrink-0 items-center justify-center rounded-md ${tones[tone]}`}>
            <Icon size={18} />
          </span>
        ) : null}
      </div>
      <p className="mt-3 truncate text-2xl font-black sm:text-3xl">{value}</p>
      {detail ? <p className="mt-1 truncate text-xs font-semibold text-black/42">{detail}</p> : null}
    </div>
  );
}

export function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-extrabold">{title}</h2>
        {description ? <p className="mt-1 text-sm font-medium text-black/48">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { label: string; className: string; icon: typeof CircleDashed }> = {
    DRAFT: { label: "Brouillon", className: "bg-slate-100 text-slate-700", icon: CircleDashed },
    QUOTE_READY: { label: "Devis prêt", className: "bg-blue-50 text-blue-700", icon: CheckCircle2 },
    PAYMENT_PENDING: { label: "Paiement attendu", className: "bg-amber-50 text-amber-700", icon: CircleDashed },
    PAID: { label: "Payé", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
    ISSUED: { label: "Émis", className: "bg-purple-50 text-purple-700", icon: CheckCircle2 },
    CANCELLED: { label: "Annulé", className: "bg-red-50 text-red-700", icon: AlertCircle },
    PENDING: { label: "En attente", className: "bg-slate-100 text-slate-700", icon: CircleDashed },
    PAYABLE: { label: "Payable", className: "bg-blue-50 text-blue-700", icon: CheckCircle2 },
    DISPUTED: { label: "Contesté", className: "bg-amber-50 text-amber-700", icon: AlertCircle },
    CONFIRMED: { label: "Confirmé", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
    FAILED: { label: "Échoué", className: "bg-red-50 text-red-700", icon: AlertCircle },
    REFUNDED: { label: "Remboursé", className: "bg-blue-50 text-blue-700", icon: CheckCircle2 },
    SUCCESS: { label: "Opérationnel", className: "bg-emerald-50 text-emerald-700", icon: CheckCircle2 },
  };
  const config = statusConfig[status] ?? {
    label: humanize(status),
    className: "bg-slate-100 text-slate-700",
    icon: CircleDashed,
  };
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold ${config.className}`}>
      <Icon size={13} />
      {config.label}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-md bg-muted text-black/45">
        <Inbox size={22} />
      </span>
      <p className="mt-4 font-extrabold">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm font-medium text-black/48">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center gap-2 text-sm font-bold text-black/50">
      <LoaderCircle className="animate-spin" size={18} />
      {label}
    </div>
  );
}

export function AlertMessage({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "info" | "success";
}) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };

  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm font-bold ${styles[tone]}`}>
      {tone === "success" ? <CheckCircle2 className="mt-0.5 shrink-0" size={16} /> : <AlertCircle className="mt-0.5 shrink-0" size={16} />}
      <span>{children}</span>
    </div>
  );
}

export function humanize(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/^./, (character) => character.toUpperCase());
}
