"use client";

import { useMemo, useState } from "react";

import type { SelectOption } from "@/lib/api";

type SelectSearchProps = {
  label: string;
  helper?: string;
  options: SelectOption[];
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
};

export function SelectSearch({
  label,
  helper,
  options,
  value,
  placeholder = "Rechercher",
  disabled = false,
  onChange,
}: SelectSearchProps) {
  const [search, setSearch] = useState("");
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return options;
    }
    return options.filter((option) => option.label.toLowerCase().includes(normalized));
  }, [options, search]);

  return (
    <label className="block">
      <span className="text-sm font-black">{label}</span>
      {helper ? (
        <span className="mt-1 block text-xs font-semibold text-black/55">{helper}</span>
      ) : null}
      <input
        className="mt-2 h-11 w-full rounded-md border border-border px-3 text-sm font-bold outline-none focus:border-primary disabled:bg-muted"
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={selected?.label ?? placeholder}
        type="search"
        value={search}
      />
      <div className="mt-2 max-h-44 overflow-auto rounded-md border border-border bg-white">
        {filteredOptions.length ? (
          filteredOptions.map((option) => {
            const active = option.value === value;
            return (
              <button
                className={`block w-full px-3 py-2 text-left text-sm font-bold ${
                  active ? "bg-primary text-white" : "hover:bg-muted"
                } disabled:text-black/35`}
                disabled={disabled || option.enabled === false}
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setSearch("");
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
    </label>
  );
}
