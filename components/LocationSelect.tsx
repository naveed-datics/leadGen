"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LocationChoice } from "@/lib/geo/cities";

type Props = {
  value: string;
  choices: LocationChoice[];
  disabled?: boolean;
  required?: boolean;
  allowClear?: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
};

function groupChoices(choices: LocationChoice[]): { group: string; options: LocationChoice[] }[] {
  const groups: { group: string; options: LocationChoice[] }[] = [];
  const index = new Map<string, LocationChoice[]>();
  for (const choice of choices) {
    let options = index.get(choice.group);
    if (!options) {
      options = [];
      index.set(choice.group, options);
      groups.push({ group: choice.group, options });
    }
    options.push(choice);
  }
  return groups;
}

export function LocationSelect({
  value,
  choices,
  disabled,
  required,
  allowClear,
  placeholder = "Type a state or city",
  onChange,
}: Props) {
  const canClear = Boolean(allowClear) && Boolean(value) && !disabled;
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);

  const selected = choices.find((choice) => choice.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return choices;
    const groupMatch = new Set(
      choices.filter((choice) => choice.group.toLowerCase().includes(q)).map((choice) => choice.group),
    );
    return choices.filter(
      (choice) =>
        groupMatch.has(choice.group) ||
        choice.label.toLowerCase().includes(q) ||
        choice.value.toLowerCase().includes(q),
    );
  }, [choices, query]);

  const grouped = useMemo(() => groupChoices(filtered), [filtered]);
  const flat = filtered;

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function pick(choice: LocationChoice) {
    onChange(choice.value);
    setQuery("");
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setHighlight((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      if (open && flat[highlight]) {
        event.preventDefault();
        pick(flat[highlight]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    } else if (event.key === "Backspace" && !open && value && !required) {
      onChange("");
    }
  }

  function clear() {
    onChange("");
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        disabled={disabled}
        required={required && !value}
        placeholder={placeholder}
        value={open ? query : selected?.label ?? value}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          if (!required && next.trim() === "") {
            onChange("");
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          if (!required && !query.trim() && !selected) {
            onChange("");
          }
        }}
        onKeyDown={onKeyDown}
        className={`w-full rounded-lg border border-zinc-300 bg-white py-2.5 text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 ${
          canClear ? "pl-3 pr-16" : "px-3"
        }`}
      />
      {canClear && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          Clear
        </button>
      )}
      {open && !disabled && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-950"
        >
          {grouped.length === 0 ? (
            <p className="px-3 py-2 text-sm text-zinc-500">No matching state or city</p>
          ) : (
            grouped.map((group) => (
              <div key={group.group}>
                <div className="sticky top-0 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                  {group.group}
                </div>
                {group.options.map((choice) => {
                  const index = flat.indexOf(choice);
                  const active = index === highlight;
                  const isSelected = choice.value === value;
                  const isState = choice.label.startsWith("All of ");
                  const nested = group.options.some((option) => option.label.startsWith("All of "));
                  return (
                    <button
                      key={choice.value}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlight(index)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(choice);
                      }}
                      className={`block w-full px-3 py-1.5 text-left text-sm ${
                        active
                          ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100"
                          : "text-zinc-800 dark:text-zinc-200"
                      } ${isState ? "font-medium" : nested ? "pl-5" : ""}`}
                    >
                      {choice.label}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
