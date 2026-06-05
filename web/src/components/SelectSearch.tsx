"use client";

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
  placeholder = "Rechercher",
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
    <div className="block" ref={containerRef}>
      <span className="text-sm font-black">{label}</span>
      {helper ? (
        <span className="mt-1 block text-xs font-semibold text-black/55">{helper}</span>
      ) : null}
      <button
        className="mt-2 flex h-11 w-full items-center justify-between rounded-md border border-border px-3 text-left text-sm font-bold outline-none focus:border-primary disabled:bg-muted disabled:text-black/35"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>{selected?.label ?? placeholder}</span>
        <span aria-hidden="true" className="text-xs">
          {open ? "Fermer" : "Ouvrir"}
        </span>
      </button>
      {open ? (
        <div className="mt-2 rounded-md border border-border bg-white">
          <input
            className="h-10 w-full border-b border-border px-3 text-sm font-bold outline-none focus:border-primary"
            disabled={disabled}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={placeholder}
            type="search"
            value={search}
          />
          <div className="max-h-44 overflow-auto">
            {canCreate ? (
              <button
                className="block w-full border-b border-border px-3 py-2 text-left text-sm font-black text-primary disabled:text-black/35"
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
                {creating ? "Ajout..." : `${createLabel} "${search.trim()}"`}
              </button>
            ) : null}
            {filteredOptions.length ? (
              filteredOptions.map((option) => {
                const optionValue = String(option.value);
                const active = optionValue === value;
                return (
                  <button
                    className={`block w-full px-3 py-2 text-left text-sm font-bold ${
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
                    {option.label}
                    {option.enabled === false ? " - A venir" : ""}
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
