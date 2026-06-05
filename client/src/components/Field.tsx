import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

export function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <input
        className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-neon"
        {...props}
      />
    </label>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="grid gap-2 text-sm text-zinc-300">
      {label}
      <select
        className="rounded-md border border-white/10 bg-black/30 px-3 py-2 text-white outline-none transition focus:border-neon"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
