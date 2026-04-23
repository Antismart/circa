"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ROLES, ROLE_COOKIE_NAME, type Role } from "../../lib/roles";

const LABELS: Record<Role, string> = {
  manufacturer: "Manufacturer",
  consumer: "Consumer",
  repairer: "Repairer",
};

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
}

export function AccountSwitcher() {
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    const stored = readCookie(ROLE_COOKIE_NAME);
    if (stored && (ROLES as readonly string[]).includes(stored)) {
      setRole(stored as Role);
    } else {
      setRole("consumer");
      writeCookie(ROLE_COOKIE_NAME, "consumer");
    }
  }, []);

  if (!role) {
    return (
      <div className="h-[40px] w-[180px] border border-rule-strong" aria-hidden />
    );
  }

  return (
    <label className="flex items-end gap-3 cursor-pointer group">
      <span className="label hidden sm:inline">Signed as</span>
      <div className="relative">
        <select
          value={role}
          onChange={(e) => {
            const next = e.target.value as Role;
            writeCookie(ROLE_COOKIE_NAME, next);
            setRole(next);
            router.refresh();
          }}
          className="appearance-none bg-transparent pr-7 pl-0 pb-1 pt-1 border-b border-rule-strong group-hover:border-ink focus:border-accent outline-none text-[13px] font-medium tracking-[0.06em] cursor-pointer transition-colors"
          style={{ minWidth: "130px" }}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {LABELS[r]}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-0 bottom-2 text-ink-soft">
          ▾
        </span>
      </div>
    </label>
  );
}
