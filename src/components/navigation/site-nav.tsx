"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/ui/wordmark";
import Cursor from "@/components/landing/cursor";

export interface NavUser {
  name: string;
  avatarUrl?: string | null;
}

interface SiteNavProps {
  user: NavUser | null;
}

export default function SiteNav({ user }: SiteNavProps) {
  const pathname = usePathname();

  const links = [
    { label: "Search", href: "/search" },
    { label: "Network", href: "/#context" },
    { label: "Sources", href: "/onboarding" },
  ];

  return (
    <>
      {/* Orange Cursor Effect */}
      <Cursor />

      {/* Floating Pill Navigation */}
      <header className="fixed inset-x-0 top-[max(1rem,env(safe-area-inset-top))] z-50 flex justify-center px-4">
        <nav
          aria-label="Primary"
          className="flex w-full max-w-[640px] items-center justify-between gap-1 rounded-full border border-[#E4E0D8] bg-[rgba(246,242,233,0.92)] py-1.5 pl-4 pr-1.5 shadow-[0_8px_30px_rgba(23,32,25,0.08)] backdrop-blur-md transition-all"
        >
          <Link href="/" className="flex items-center gap-2 py-1.5" data-cursor-pill>
            <Wordmark size={20} />
            <span className="text-[15px] font-semibold tracking-[-0.02em] text-[#0B1F3A]">
              Happensten
            </span>
          </Link>

          <div className="hidden items-center gap-0.5 sm:flex">
            {links.map((l) => {
              const active =
                l.href === "/search"
                  ? pathname === "/search"
                  : l.href === "/onboarding"
                    ? pathname === "/onboarding"
                    : false;

              return (
                <Link
                  key={l.label}
                  href={l.href}
                  data-cursor-pill
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors duration-150 ${
                    active
                      ? "bg-[rgba(23,32,25,0.08)] text-[#172019]"
                      : "text-[rgba(23,32,25,0.72)] hover:bg-[rgba(23,32,25,0.05)] hover:text-[#172019]"
                  }`}
                >
                  {l.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            {user ? (
              <Link
                href="/search"
                data-cursor-pill
                className="flex min-h-9 items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors duration-150 hover:bg-[rgba(23,32,25,0.05)]"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-7 w-7 rounded-full object-cover ring-1 ring-[#E4E0D8]"
                  />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B1F3A] text-[11px] font-semibold text-[#FFFEFA]">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="max-w-[10ch] truncate text-[13px] font-medium text-[#0B1F3A]">
                  {user.name.split(" ")[0]}
                </span>
              </Link>
            ) : (
              <Link
                href="/api/auth/google"
                data-cursor-pill
                className="inline-flex min-h-9 items-center rounded-full bg-[#0B1F3A] px-4 text-[13px] font-medium text-[#FFFEFA] shadow-sm transition-all hover:bg-[#1b3557] active:scale-[0.98]"
              >
                Sign in
              </Link>
            )}
          </div>
        </nav>
      </header>
    </>
  );
}
