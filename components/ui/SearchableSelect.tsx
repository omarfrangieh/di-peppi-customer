"use client";

import { useState } from "react";

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "— Select —",
  size = "sm",
  allowCustom = false,
  disabled = false,
  onAddOption,
}: {
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  size?: "xs" | "sm";
  allowCustom?: boolean;
  disabled?: boolean;
  onAddOption?: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const sorted = [...options].sort((a, b) => a.localeCompare(b));
  // Include current value if it's not in the list (legacy/custom data)
  const allOptions = value && !sorted.includes(value) ? [value, ...sorted] : sorted;
  const filtered = allOptions.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const px = size === "xs" ? "px-2 py-1.5 text-xs" : "px-3 py-2 text-sm";
  // Show "add" option when allowCustom and search has text not matching any existing option
  const searchTrimmed = search.trim();
  const showAddNew = allowCustom && searchTrimmed.length > 0 && !allOptions.some(o => o.toLowerCase() === searchTrimmed.toLowerCase());

  return (
    <div className="relative">
      <div
        onClick={() => {
          if (disabled) return;
          setOpen(o => !o);
          setSearch("");
        }}
        className={`w-full flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded${size === "sm" ? "-lg" : ""} ${px} bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-gray-400"}`}
      >
        <span className={value ? "text-gray-900 dark:text-white" : "text-gray-400"}>{value || placeholder}</span>
        <span className="text-gray-400 text-xs ml-1">{open ? "▲" : "▼"}</span>
      </div>
      {open && !disabled && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setOpen(false); setSearch(""); }} />
          <div className="absolute z-50 mt-1 w-full min-w-max bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden">
            <div className="p-2 border-b border-gray-100 dark:border-gray-700">
              <input
                autoFocus
                type="text"
                placeholder="Search..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className={`w-full px-2 py-1.5 ${size === "xs" ? "text-xs" : "text-sm"} border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white dark:bg-gray-800 text-gray-900 dark:text-white`}
              />
            </div>
            <div className="max-h-52 overflow-y-auto">
              {value && (
                <div
                  onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
                  className={`px-3 py-2 ${size === "xs" ? "text-xs" : "text-sm"} cursor-pointer text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1.5 border-b border-gray-100 dark:border-gray-700`}
                >
                  <span>✕</span> Clear
                </div>
              )}
              {filtered.map(o => (
                <div
                  key={o}
                  onClick={() => { onChange(o); setOpen(false); setSearch(""); }}
                  className={`px-3 py-2 ${size === "xs" ? "text-xs" : "text-sm"} cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${o === value ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold" : "text-gray-800 dark:text-gray-200"}`}
                >
                  {o}
                </div>
              ))}
              {filtered.length === 0 && !showAddNew && (
                <div className={`px-3 py-3 ${size === "xs" ? "text-xs" : "text-sm"} text-gray-400 text-center`}>No options found</div>
              )}
              {showAddNew && (
                <div
                  onClick={() => {
                    const val = searchTrimmed.toUpperCase();
                    onChange(val);
                    onAddOption?.(val);
                    setOpen(false);
                    setSearch("");
                  }}
                  className={`px-3 py-2 ${size === "xs" ? "text-xs" : "text-sm"} cursor-pointer hover:bg-green-50 dark:hover:bg-green-900/20 text-green-700 dark:text-green-400 font-medium flex items-center gap-1.5 border-t border-gray-100 dark:border-gray-700`}
                >
                  <span>＋</span> Add "{searchTrimmed.toUpperCase()}"
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
