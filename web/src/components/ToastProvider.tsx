"use client";

import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastTone = "success" | "error" | "info" | "warning";

type Toast = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastInput = Omit<Toast, "id">;

type ToastContextValue = {
  push: (toast: ToastInput) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((toast: ToastInput) => {
    const id = (idRef.current += 1);
    setToasts((current) => [...current, { ...toast, id }]);
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ tone: "success", title, description }),
      error: (title, description) => push({ tone: "error", title, description }),
      info: (title, description) => push({ tone: "info", title, description }),
      warning: (title, description) => push({ tone: "warning", title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} onDismiss={dismiss} toast={toast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const toneStyles: Record<ToastTone, { card: string; icon: React.ReactNode }> = {
  success: {
    card: "border-emerald-200",
    icon: <CheckCircle2 className="text-emerald-600" size={18} />,
  },
  error: {
    card: "border-red-200",
    icon: <AlertCircle className="text-red-600" size={18} />,
  },
  info: {
    card: "border-blue-200",
    icon: <Info className="text-blue-600" size={18} />,
  },
  warning: {
    card: "border-amber-200",
    icon: <AlertCircle className="text-amber-600" size={18} />,
  },
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4500);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const style = toneStyles[toast.tone];
  return (
    <div
      className={`animate-slide-up pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white px-4 py-3 shadow-lg ${style.card}`}
      role="status"
    >
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-black/80">{toast.title}</p>
        {toast.description ? (
          <p className="mt-0.5 text-[13px] font-medium text-black/50">{toast.description}</p>
        ) : null}
      </div>
      <button
        aria-label="Fermer"
        className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-black/30 transition hover:bg-muted hover:text-black/60"
        onClick={() => onDismiss(toast.id)}
        type="button"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast doit etre utilise dans ToastProvider.");
  }
  return value;
}
