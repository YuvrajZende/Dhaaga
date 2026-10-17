import React from "react";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import SearchExperience from "@/components/search/search-experience";
import StarField from "@/components/star-field";
import { Sparkles, ArrowRight, ShieldCheck } from "lucide-react";

import SiteNav from "@/components/navigation/site-nav";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [user, params] = await Promise.all([getSessionUser(), searchParams]);
  const initialQuery =
    typeof params.q === "string" ? params.q : undefined;

  return (
    <div className="relative min-h-screen bg-[var(--background)] text-[var(--text-primary)] antialiased overflow-x-hidden">
      {/* Background Starfield Canvas */}
      <StarField />

      {/* Unified static floating pill navigation with orange cursor effect */}
      <SiteNav user={user} />

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto w-full max-w-3xl px-5 pb-24 pt-28 sm:px-6 sm:pt-36">
        {user ? (
          <div className="space-y-6">
            <div className="text-center sm:text-left">
              <h1 className="type-title text-2xl font-bold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                Network Search
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[var(--text-secondary)]">
                Ask who can help — Happensten shows why they match, how you&apos;re
                connected, and what to do next.
              </p>
            </div>

            <SearchExperience viewerId={user.id} initialQuery={initialQuery} />
          </div>
        ) : (
          <div className="material-medium mx-auto mt-12 max-w-md rounded-2xl p-8 text-center shadow-2xl animate-materialize">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
              <ShieldCheck className="h-6 w-6 text-[var(--accent-find)]" />
            </div>

            <h1 className="type-title mt-4 text-xl font-semibold text-[var(--text-primary)]">
              Sign in to query your network
            </h1>

            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Your network data is encrypted and isolated. Sign in with Google to search contacts, warm paths, and introductions.
            </p>

            <a
              href="/api/auth/google"
              className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-find)] px-5 text-sm font-medium text-[var(--accent-on-find)] transition-transform duration-150 hover:brightness-110 active:scale-98 shadow-lg"
            >
              Continue with Google
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
