"use client";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DayPicker } from "react-day-picker";
import { fr } from "react-day-picker/locale";

function formatDisplay(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseIso(value: string): Date | undefined {
  if (!value) return undefined;
  const parts = value.split("-");
  if (parts.length !== 3) return undefined;
  const [y, m, d] = parts.map(Number);
  if (!y || !m || !d) return undefined;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? undefined : date;
}

function getPopoverPosition(rect: DOMRect, height: number) {
  const viewportPadding = 8;
  const width = Math.min(288, window.innerWidth - viewportPadding * 2);
  const left = Math.min(
    Math.max(rect.left, viewportPadding),
    window.innerWidth - width - viewportPadding,
  );
  const spaceBelow = window.innerHeight - rect.bottom;

  if (spaceBelow < height) {
    return {
      position: "fixed" as const,
      bottom: window.innerHeight - rect.top + 6,
      left,
      width,
    };
  }

  return {
    position: "fixed" as const,
    top: rect.bottom + 6,
    left,
    width,
  };
}

export function DatePicker({
  label,
  value,
  onChange,
  minDate,
  error,
  required = false,
  placeholder = "Sélectionner une date",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minDate?: Date;
  error?: string;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const selected = parseIso(value);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (
        containerRef.current &&
        e.target instanceof Node &&
        !containerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPopoverStyle(getPopoverPosition(rect, 320));
    }
    setOpen((v) => !v);
  }

  return (
    <div className="relative" ref={containerRef}>
      <span className="text-xs font-extrabold uppercase tracking-wide text-primary">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      <button
        ref={buttonRef}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={label}
        className={`app-field mt-1.5 flex items-center justify-between text-left text-sm font-semibold transition ${
          error ? "border-red-400 bg-red-50" : "border-primary/30 bg-primary/5"
        }`}
        onClick={toggle}
        type="button"
      >
        <span className={selected ? "text-primary" : "text-primary/40"}>
          {selected ? formatDisplay(selected) : placeholder}
        </span>
        <CalendarDays
          className={`shrink-0 ${error ? "text-red-400" : "text-primary/60"}`}
          size={16}
        />
      </button>
      {error ? (
        <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>
      ) : null}

      {open ? (
        <div
          className="z-50 animate-scale-in overflow-hidden rounded-xl border border-border bg-white shadow-xl"
          style={popoverStyle}
        >
          <DayPicker
            locale={fr}
            mode="single"
            selected={selected}
            defaultMonth={selected ?? minDate ?? new Date()}
            onSelect={(date) => {
              if (date) {
                onChange(formatIso(date));
                setOpen(false);
              }
            }}
            disabled={minDate ? { before: minDate } : undefined}
            classNames={{
              root: "p-3 select-none",
              months: "",
              month: "space-y-2",
              month_caption:
                "relative flex h-9 items-center justify-center",
              caption_label:
                "text-sm font-extrabold capitalize text-foreground",
              nav: "absolute inset-x-0 top-0 flex justify-between",
              button_previous:
                "flex size-8 items-center justify-center rounded-lg border border-border bg-white text-black/40 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary",
              button_next:
                "flex size-8 items-center justify-center rounded-lg border border-border bg-white text-black/40 transition hover:border-primary/30 hover:bg-primary/5 hover:text-primary",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday:
                "flex-1 py-1.5 text-center text-[10px] font-black uppercase tracking-wide text-black/30",
              weeks: "",
              week: "mt-0.5 flex",
              day: "flex-1 p-0",
              day_button:
                "flex h-8 w-full items-center justify-center rounded-lg text-sm font-medium text-foreground transition hover:bg-primary/10 hover:text-primary",
              selected:
                "[&>button]:!bg-primary [&>button]:!text-white [&>button]:!font-extrabold [&>button]:shadow-sm",
              today:
                "[&>button]:font-extrabold [&>button]:text-primary [&>button]:ring-1 [&>button]:ring-primary/40",
              outside:
                "[&>button]:!text-black/20 [&>button]:hover:!bg-transparent",
              disabled:
                "[&>button]:!cursor-not-allowed [&>button]:!text-black/20 [&>button]:!line-through [&>button]:hover:!bg-transparent",
              hidden: "invisible",
            }}
            components={{
              Chevron: ({ orientation }: { orientation?: string }) =>
                orientation === "left" ? (
                  <ChevronLeft size={14} strokeWidth={2.5} />
                ) : (
                  <ChevronRight size={14} strokeWidth={2.5} />
                ),
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
