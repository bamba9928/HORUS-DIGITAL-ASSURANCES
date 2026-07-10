import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  Inbox,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

/* ── PageAction ──────────────────────────────────────────────────── */
type PageActionProps = {
  icon?: typeof ArrowRight;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
} & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

export function PageAction({
  href,
  onClick,
  icon: Icon,
  children,
  variant = "primary",
}: PageActionProps) {
  const className = `inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 text-[13.5px] font-bold transition ${
    variant === "primary"
      ? "bg-gradient-to-br from-primary to-[var(--primary-strong)] text-white shadow-sm shadow-primary/30 hover:shadow-[0_4px_14px_0_rgba(150,0,192,0.35)] hover:brightness-105"
      : "border border-border bg-white text-black/80 shadow-[var(--shadow-xs)] hover:bg-muted hover:border-[var(--border-strong)]"
  }`;
  const content = (
    <>
      {Icon ? <Icon size={14} /> : null}
      <span className="hidden sm:inline">{children}</span>
    </>
  );
  if (onClick) {
    return (
      <button className={className} onClick={onClick} type="button">
        {content}
      </button>
    );
  }
  return (
    <Link className={className} href={href!}>
      {content}
    </Link>
  );
}

/* ── MetricCard ──────────────────────────────────────────────────── */
const toneConfig = {
  neutral: {
    bar: "bg-slate-300/80",
    icon: "bg-slate-100 text-slate-500",
    value: "",
  },
  primary: {
    bar: "bg-primary",
    icon: "bg-primary/10 text-primary",
    value: "text-primary",
  },
  success: {
    bar: "bg-emerald-500",
    icon: "bg-emerald-50 text-emerald-600",
    value: "text-emerald-700",
  },
  warning: {
    bar: "bg-amber-400",
    icon: "bg-amber-50 text-amber-600",
    value: "",
  },
};

export function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
  trend,
  loading = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon?: typeof ArrowRight;
  tone?: "neutral" | "primary" | "success" | "warning";
  trend?: { value: string; up: boolean };
  loading?: boolean;
}) {
  const cfg = toneConfig[tone];
  return (
    <div className="app-surface min-w-0 overflow-hidden transition hover:shadow-md">
      {/* Colored top strip */}
      <div className={`h-[3px] ${cfg.bar}`} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-black/45">{label}</p>
          {Icon ? (
            <span
              className={`flex size-[34px] shrink-0 items-center justify-center rounded-xl ${cfg.icon}`}
            >
              <Icon size={15} />
            </span>
          ) : null}
        </div>
        {loading ? (
          <span className="skeleton mt-3 block h-[26px] w-24 rounded-md sm:h-[28px]" />
        ) : (
          <p
            className={`mt-3 truncate text-[26px] font-black leading-none tracking-tight sm:text-[28px] ${cfg.value}`}
          >
            {value}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          {detail ? (
            <p className="truncate text-xs font-medium text-black/38">{detail}</p>
          ) : null}
          {trend ? (
            <span
              className={`ml-auto inline-flex items-center gap-0.5 text-xs font-bold ${
                trend.up ? "text-emerald-600" : "text-red-500"
              }`}
            >
              {trend.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend.value}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* ── SectionHeader ───────────────────────────────────────────────── */
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
        <h2 className="text-[15px] font-extrabold tracking-tight">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm font-medium text-black/40">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ── StatusBadge ─────────────────────────────────────────────────── */
export function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<
    string,
    { label: string; className: string; dot: string; icon: typeof CircleDashed }
  > = {
    DRAFT:           { label: "Brouillon",        className: "bg-slate-100 text-slate-600",       dot: "bg-slate-400",   icon: CircleDashed  },
    QUOTE_READY:     { label: "Devis prêt",        className: "bg-blue-50 text-blue-700",          dot: "bg-blue-500",    icon: CheckCircle2  },
    PAYMENT_PENDING: { label: "Paiement attendu",  className: "bg-amber-50 text-amber-700",        dot: "bg-amber-400",   icon: CircleDashed  },
    PAID:            { label: "Payé",              className: "bg-emerald-50 text-emerald-700",    dot: "bg-emerald-500", icon: CheckCircle2  },
    ISSUING:         { label: "Émission en cours", className: "bg-violet-50 text-violet-700",      dot: "bg-violet-400",  icon: CircleDashed  },
    ISSUED:          { label: "Émis",              className: "bg-violet-50 text-violet-700",      dot: "bg-violet-500",  icon: CheckCircle2  },
    CANCELLED:       { label: "Annulé",            className: "bg-red-50 text-red-600",            dot: "bg-red-400",     icon: AlertCircle   },
    PENDING:         { label: "En attente",        className: "bg-slate-100 text-slate-600",       dot: "bg-slate-400",   icon: CircleDashed  },
    PAYABLE:         { label: "Payable",           className: "bg-blue-50 text-blue-700",          dot: "bg-blue-500",    icon: CheckCircle2  },
    PAID_OUT:        { label: "Versé",             className: "bg-emerald-50 text-emerald-700",    dot: "bg-emerald-500", icon: CheckCircle2  },
    DISPUTED:        { label: "Contesté",          className: "bg-amber-50 text-amber-700",        dot: "bg-amber-400",   icon: AlertCircle   },
    CONFIRMED:       { label: "Confirmé",          className: "bg-emerald-50 text-emerald-700",    dot: "bg-emerald-500", icon: CheckCircle2  },
    FAILED:          { label: "Échoué",            className: "bg-red-50 text-red-600",            dot: "bg-red-400",     icon: AlertCircle   },
    REFUNDED:        { label: "Remboursé",         className: "bg-blue-50 text-blue-700",          dot: "bg-blue-400",    icon: CheckCircle2  },
    SUCCESS:         { label: "Opérationnel",      className: "bg-emerald-50 text-emerald-700",    dot: "bg-emerald-500", icon: CheckCircle2  },
    VALIDE:          { label: "Validé ASS",        className: "bg-violet-50 text-violet-700",      dot: "bg-violet-500",  icon: CheckCircle2  },
    BROUILLON:       { label: "Brouillon ASS",     className: "bg-slate-100 text-slate-600",       dot: "bg-slate-400",   icon: CircleDashed  },
    ANNULE:          { label: "Annulé ASS",        className: "bg-red-50 text-red-600",            dot: "bg-red-400",     icon: AlertCircle   },
    "MODE TEST":     { label: "Mode test",         className: "bg-amber-50 text-amber-700",        dot: "bg-amber-400",   icon: CircleDashed  },
    CONTRIBUTOR:     { label: "Apporteur",          className: "bg-primary/10 text-primary",         dot: "bg-primary",     icon: CheckCircle2  },
    FINANCE:         { label: "Finance",             className: "bg-amber-50 text-amber-700",         dot: "bg-amber-400",   icon: CheckCircle2  },
    ADMIN_GROUP:     { label: "Admin groupe",        className: "bg-blue-50 text-blue-700",           dot: "bg-blue-500",    icon: CheckCircle2  },
    ADMIN_GENERAL:   { label: "Admin général",       className: "bg-violet-50 text-violet-700",       dot: "bg-violet-500",  icon: CheckCircle2  },
    ACTIVE:          { label: "Actif",               className: "bg-emerald-50 text-emerald-700",     dot: "bg-emerald-500", icon: CheckCircle2  },
    INACTIVE:        { label: "Inactif",             className: "bg-red-50 text-red-600",             dot: "bg-red-400",     icon: AlertCircle   },
    SUSPENDED:       { label: "Suspendu",            className: "bg-amber-50 text-amber-700",         dot: "bg-amber-400",   icon: AlertCircle   },
  };

  const config = statusConfig[status] ?? {
    label: humanize(status),
    className: "bg-slate-100 text-slate-600",
    dot: "bg-slate-400",
    icon: CircleDashed,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[11px] font-bold tracking-wide ${config.className}`}
    >
      <span className={`size-[5px] shrink-0 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

/* ── ContractTypeBadge ───────────────────────────────────────────── */
const typeConfig: Record<string, { label: string; className: string }> = {
  AUTO_MONO:  { label: "Auto",      className: "bg-blue-50 text-blue-700" },
  MOTO:       { label: "Moto",      className: "bg-violet-50 text-violet-700" },
  FLEET:      { label: "Flotte",    className: "bg-sky-50 text-sky-700" },
  BUS_SCHOOL: { label: "Bus École", className: "bg-emerald-50 text-emerald-700" },
  GARAGE:     { label: "Garage",    className: "bg-amber-50 text-amber-700" },
};

export function ContractTypeBadge({ contractType }: { contractType: string }) {
  const cfg = typeConfig[contractType] ?? {
    label: humanize(contractType),
    className: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10.5px] font-bold tracking-wide ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

/* ── EmptyState ──────────────────────────────────────────────────── */
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
    <div className="flex min-h-56 flex-col items-center justify-center px-5 py-14 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl border border-border bg-gradient-to-br from-muted to-white text-black/28 shadow-inner">
        <Inbox size={24} strokeWidth={1.5} />
      </span>
      <p className="mt-4 text-[15px] font-extrabold text-black/70">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-xs text-sm font-medium text-black/38">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* ── BrandSpinner ────────────────────────────────────────────────── */
const brandSpinnerSizes = {
  sm: { box: 22, ring: "border-2", logo: 14 },
  md: { box: 40, ring: "border-[3px]", logo: 25 },
  lg: { box: 64, ring: "border-4", logo: 40 },
};

export function BrandSpinner({
  size = "md",
  className = "",
}: {
  size?: keyof typeof brandSpinnerSizes;
  className?: string;
}) {
  const cfg = brandSpinnerSizes[size];
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: cfg.box, height: cfg.box }}
    >
      <span
        className={`absolute inset-0 animate-spin rounded-full ${cfg.ring} border-primary/15 border-t-primary`}
      />
      <Image
        alt=""
        className="rounded-full"
        height={256}
        src="/brand/horus-assur-icon.png"
        style={{ width: cfg.logo, height: cfg.logo }}
        width={256}
      />
    </span>
  );
}

/* ── LoadingState ────────────────────────────────────────────────── */
export function LoadingState({ label = "Chargement" }: { label?: string }) {
  return (
    <div className="flex min-h-44 items-center justify-center gap-2.5 text-sm font-semibold text-black/40">
      <BrandSpinner size="sm" />
      {label}…
    </div>
  );
}

/* ── AlertMessage ────────────────────────────────────────────────── */
export function AlertMessage({
  children,
  tone = "error",
}: {
  children: React.ReactNode;
  tone?: "error" | "info" | "success" | "warning";
}) {
  const styles = {
    error:   "border-red-200   bg-red-50   text-red-800",
    info:    "border-blue-200  bg-blue-50  text-blue-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  };
  const icons = {
    error:   <AlertCircle  className="mt-0.5 shrink-0" size={15} />,
    info:    <AlertCircle  className="mt-0.5 shrink-0" size={15} />,
    success: <CheckCircle2 className="mt-0.5 shrink-0" size={15} />,
    warning: <AlertCircle  className="mt-0.5 shrink-0" size={15} />,
  };

  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-semibold ${styles[tone]}`}
    >
      {icons[tone]}
      <span>{children}</span>
    </div>
  );
}

/* ── Skeleton ────────────────────────────────────────────────────── */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} />;
}

/* ── TableSkeleton ───────────────────────────────────────────────── */
export function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex}>
              <Skeleton className="h-4 w-full max-w-32 rounded" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/* ── ConfirmDialog ───────────────────────────────────────────────── */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  tone = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <button
        aria-label="Fermer"
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-[1px]"
        onClick={onCancel}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-modal="true"
        className="app-surface-raised animate-scale-in relative z-10 w-full max-w-md p-5 shadow-xl"
        role="dialog"
      >
        <h2 className="text-[15px] font-extrabold tracking-tight">{title}</h2>
        {description ? (
          <div className="mt-2 text-sm font-medium leading-relaxed text-black/55">
            {description}
          </div>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            className="btn btn-secondary"
            disabled={loading}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`btn ${tone === "danger" ? "btn-danger" : "btn-primary"}`}
            disabled={loading}
            onClick={onConfirm}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────── */
export function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (c) => c.toUpperCase());
}
