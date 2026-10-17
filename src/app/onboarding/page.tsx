import React from "react";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import OnboardingDashboard from "@/components/onboarding/onboarding-dashboard";
import { ArrowRight, ShieldCheck } from "lucide-react";
import SiteNav from "@/components/navigation/site-nav";

export default async function OnboardingPage() {
  const user = await getSessionUser();

  return (
    <div className="lp-root lp-grain relative min-h-screen bg-[#F6F2E9] text-[#172019] antialiased selection:bg-[#DCE8D9] selection:text-[#172019]">
      {/* Unified floating navigation with orange cursor effect */}
      <SiteNav user={user} />

      {/* Main Container */}
      <main className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-28 pt-28 sm:px-6 sm:pt-36">
        {user ? (
          <OnboardingDashboard initialUser={user} />
        ) : (
          <div className="mx-auto mt-12 max-w-lg rounded-3xl border border-[#E4E0D8] bg-[#FFFEFA] p-8 text-center shadow-[0_12px_40px_rgba(23,32,25,0.06)] sm:p-10">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#DCE8D9] text-[#183D32]">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <h1 className="mt-5 font-serif text-2xl font-normal tracking-tight text-[#172019] sm:text-3xl">
              Sign in to connect your network
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-[#777872]">
              Happensten is private to you. Sign in with Google to connect and sync your contacts, emails, and data archives into your private relationship graph.
            </p>
            <a
              href="/api/auth/google"
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#FF4D2D] px-6 text-[15px] font-semibold text-[#FFFEFA] shadow-[0_4px_16px_rgba(255,77,45,0.25)] transition-all hover:bg-[#e03f21] hover:shadow-[0_6px_20px_rgba(255,77,45,0.35)] active:scale-[0.98]"
            >
              <span>Continue with Google</span>
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        )}
      </main>
    </div>
  );
}
