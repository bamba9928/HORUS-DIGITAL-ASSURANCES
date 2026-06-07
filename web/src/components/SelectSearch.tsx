"use client";

import { Check, ChevronDown, Plus, Search } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

import type { SelectOption } from "@/lib/api";

type SelectSearchProps = {
  label: string;
  helper?: string;
  options: SelectOption[];
  value: string;
  placeholder?: string;
  disabled?: boolean;
  createLabel?: string;
  error?: string;
  required?: boolean;
  onCreate?: (label: string) => Promise<SelectOption | void> | SelectOption | void;
  onChange: (value: string) => void;
};

export function SelectSearch({
  label,
  helper,
  options,
  value,
  placeholder = "Sélectionner...",
  disabled = false,
  createLabel = "Ajouter",
  error,
  required = false,
  onCreate,
  onChange,
}: SelectSearchProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const selected = options.find((option) => String(option.value) === value);
  const filteredOptions = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter(
      (option) =>
        option.label.toLowerCase().includes(normalized) ||
        String(option.value).toLowerCase().includes(normalized),
    );
  }, [options, search]);
  const canCreate = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!onCreate || !normalized) {
      return false;
    }
    return !options.some(
      (option) =>
        option.label.trim().toLowerCase() === normalized ||
        String(option.value).trim().toLowerCase() === normalized,
    );
  }, [onCreate, options, search]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div className="relative block" ref={containerRef}>
      <span className="text-xs font-extrabold uppercase tracking-wide text-primary">
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </span>
      {helper ? (
        <span className="mt-1 block text-xs font-semibold text-black/48">{helper}</span>
      ) : null}
      <button
        ref={buttonRef}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={`app-field mt-1.5 flex items-center justify-between text-left font-semibold ${error ? "border-red-400 bg-red-50 text-black" : "border-primary/30 bg-primary/5 text-primary"}`}
        disabled={disabled}
        onClick={() => {
          if (!open && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const listHeight = Math.min(options.length * 44 + 52, 228);
            if (window.innerHeight - rect.bottom < listHeight) {
              setPopStyle({ position: "fixed", bottom: window.innerHeight - rect.top + 6, left: rect.left, width: rect.width });
            } else {
              setPopStyle({ position: "fixed", top: rect.bottom + 6, left: rect.left, width: rect.width });
            }
          }
          setOpen((current) => !current);
        }}
        type="button"
      >
        <span className={selected ? "" : "text-primary/55"}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={`shrink-0 text-primary/65 transition ${open ? "rotate-180" : ""}`} size={17} />
      </button>
      {error ? <span className="mt-1 block text-xs font-bold text-red-600">{error}</span> : null}
      {open ? (
        <div
          className="z-50 overflow-hidden rounded-xl border border-primary/40 bg-primary shadow-xl shadow-primary/20"
          role="listbox"
          style={popStyle}
        >
          <label className="relative block border-b border-white/15">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/50" size={16} />
            <input
              autoFocus
              className="h-11 w-full bg-transparent pl-9 pr-3 text-sm font-bold text-white outline-none placeholder:text-white/40"
              disabled={disabled}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Filtrer la liste"
              type="search"
              value={search}
            />
          </label>
          <div className="max-h-44 overflow-auto">
            {canCreate ? (
              <button
                className="flex w-full items-center gap-2 border-b border-white/15 px-3 py-2.5 text-left text-sm font-extrabold text-white hover:bg-white/10 disabled:opacity-40"
                disabled={creating}
                onClick={async () => {
                  const labelToCreate = search.trim();
                  setCreating(true);
                  try {
                    const created = await onCreate?.(labelToCreate);
                    if (created?.value !== undefined) {
                      onChange(String(created.value));
                    }
                    setSearch("");
                    setOpen(false);
                  } finally {
                    setCreating(false);
                  }
                }}
                type="button"
              >
                <Plus size={15} />
                {creating ? "Ajout..." : `${createLabel} "${search.trim()}"`}
              </button>
            ) : null}
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const optionValue = String(option.value);
                const active = optionValue === value;
                return (
                  <button
                    aria-selected={active}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-bold transition-colors ${
                      active
                        ? "bg-white/20 font-extrabold text-white"
                        : "text-white/85 hover:bg-white/10 hover:text-white"
                    } disabled:opacity-35`}
                    disabled={disabled || option.enabled === false}
                    key={option.value}
                    onClick={() => {
                      onChange(optionValue);
                      setSearch("");
                      setOpen(false);
                    }}
                    role="option"
                    type="button"
                  >
                    <span>
                      {option.label}
                      {option.enabled === false ? " - À venir" : ""}
                    </span>
                    {active ? <Check size={15} /> : null}
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-2 text-sm font-bold text-white/50">Aucun résultat</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
