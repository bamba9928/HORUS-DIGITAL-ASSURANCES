"use client";

import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SelectOption } from "@/lib/api";

type SelectSearchProps = {
  label: string;
  helper?: string;
  options: SelectOption[];
  value: string;
  placeholder?: string;
  disabled?: boolean;
  createLabel?: string;
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
  onCreate,
  onChange,
}: SelectSearchProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
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
      <span className="text-xs font-extrabold uppercase text-black/52">{label}</span>
      {helper ? (
        <span className="mt-1 block text-xs font-semibold text-black/48">{helper}</span>
      ) : null}
      <button
        className="app-field mt-1.5 flex items-center justify-between text-left"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className={selected ? "" : "text-black/40"}>{selected?.label ?? placeholder}</span>
        <ChevronDown className={`shrink-0 text-black/45 transition ${open ? "rotate-180" : ""}`} size={17} />
      </button>
      {open ? (
        <div className="absolute inset-x-0 top-full z-40 mt-1.5 overflow-hidden rounded-md border border-border bg-white shadow-xl">
          <label className="relative block border-b border-border">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/38" size={16} />
            <input
              autoFocus
              className="h-11 w-full pl-9 pr-3 text-sm font-bold outline-none"
              disabled={disabled}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher dans la liste"
              type="search"
              value={search}
            />
          </label>
          <div className="max-h-44 overflow-auto">
            {canCreate ? (
              <button
                className="flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left text-sm font-extrabold text-primary hover:bg-muted disabled:text-black/35"
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
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-bold ${
                      active ? "bg-primary text-white" : "hover:bg-muted"
                    } disabled:text-black/35`}
                    disabled={disabled || option.enabled === false}
                    key={option.value}
                    onClick={() => {
                      onChange(optionValue);
                      setSearch("");
                      setOpen(false);
                    }}
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
              <p className="px-3 py-2 text-sm font-bold text-black/45">Aucun resultat</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
