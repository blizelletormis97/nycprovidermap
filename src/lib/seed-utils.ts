/** Shared helpers for the seed scripts. */

/** Format a 10-digit phone number as (212) 555-1234; returns other values unchanged. */
export function formatPhone(raw?: string): string | undefined {
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (ten.length !== 10) return raw.trim() || undefined;
  return `(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** Title-case an ALL CAPS street address while leaving mixed-case input alone. */
export function titleCaseAddress(raw?: string): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_m, n, suf) => n + suf.toLowerCase());
}
