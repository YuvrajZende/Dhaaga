"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Users,
  CheckCircle2,
  Circle,
  ShieldCheck,
  Lock,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import GoogleSyncCard from "./google-sync-card";
import LinkedInUploadCard from "./linkedin-upload-card";
import PersonalDataUploadCard from "./personal-data-upload-card";
import XUploadCard from "./x-upload-card";
import InstagramUploadCard from "./instagram-upload-card";
import FacebookUploadCard from "./facebook-upload-card";
import { AnimatedCheck } from "@/components/ui/animated-check";

interface SourceRecord {
  type: string;
  status: string;
  lastSyncedAt: string | null;
}

interface OnboardingDashboardProps {
  initialUser: {
    id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
  };
}

export default function OnboardingDashboard({ initialUser }: OnboardingDashboardProps) {
  const [totalPeople, setTotalPeople] = useState<number | null>(null);
  const [sourcesList, setSourcesList] = useState<SourceRecord[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  const refreshStats = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setTotalPeople(Number(data.stats?.totalPeople || 0));
        setSourcesList(data.sources || []);
      }
    } catch {
      // Ignore background stats failure
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // Derive source statuses from real database records
  const googleStatus = useMemo(() => {
    const s = sourcesList.find(
      (src) => src.type === "contacts" || src.type === "gmail" || src.type === "calendar"
    );
    return s?.status || "disconnected";
  }, [sourcesList]);

  const googleLastSynced = useMemo(() => {
    const s = sourcesList.find(
      (src) => src.type === "contacts" || src.type === "gmail" || src.type === "calendar"
    );
    return s?.lastSyncedAt || null;
  }, [sourcesList]);

  const linkedinStatus = useMemo(() => {
    return sourcesList.find((src) => src.type === "linkedin_import")?.status || "disconnected";
  }, [sourcesList]);

  const linkedinLastSynced = useMemo(() => {
    return sourcesList.find((src) => src.type === "linkedin_import")?.lastSyncedAt || null;
  }, [sourcesList]);

  const xStatus = useMemo(() => {
    return sourcesList.find((src) => src.type === "x_import")?.status || "disconnected";
  }, [sourcesList]);

  const xLastSynced = useMemo(() => {
    return sourcesList.find((src) => src.type === "x_import")?.lastSyncedAt || null;
  }, [sourcesList]);

  const instagramStatus = useMemo(() => {
    return sourcesList.find((src) => src.type === "instagram_import")?.status || "disconnected";
  }, [sourcesList]);

  const instagramLastSynced = useMemo(() => {
    return sourcesList.find((src) => src.type === "instagram_import")?.lastSyncedAt || null;
  }, [sourcesList]);

  const facebookStatus = useMemo(() => {
    return sourcesList.find((src) => src.type === "facebook_import")?.status || "disconnected";
  }, [sourcesList]);

  const facebookLastSynced = useMemo(() => {
    return sourcesList.find((src) => src.type === "facebook_import")?.lastSyncedAt || null;
  }, [sourcesList]);

  // Real connected sources count
  const activeSourcesCount = useMemo(() => {
    const activeTypes = new Set(
      sourcesList
        .filter((s) => s.status === "active" || s.status === "syncing")
        .map((s) => (["contacts", "gmail", "calendar"].includes(s.type) ? "google" : s.type))
    );
    return activeTypes.size;
  }, [sourcesList]);

  // Real three-stage progress derivation
  const stage1Completed = (totalPeople ?? 0) > 0;
  const stage2Completed = activeSourcesCount > 0;
  const stage3Ready = stage1Completed || stage2Completed;

  return (
    <div className="space-y-16 sm:space-y-20">
      {/* ===================================================================
          1. WELCOME HEADER & SETUP PROGRESS
          =================================================================== */}
      <section className="space-y-8">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#FF4D2D]" />
              <span className="font-mono text-xs font-semibold tracking-[0.14em] text-[#777872] uppercase">
                YOUR NETWORK STARTS HERE
              </span>
            </div>
            <h1 className="mt-3 font-serif text-3xl font-normal tracking-tight text-[#172019] sm:text-4xl lg:text-[42px] lg:leading-[1.12]">
              Bring your world together.
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#777872] sm:text-base">
              Connect the people you know across your inbox, professional network, and social accounts. Happensten brings those relationships into one private, searchable graph.
            </p>
          </div>

          {/* Compact Real Summary Badge */}
          <div className="flex shrink-0 items-center gap-4 rounded-3xl border border-[#E4E0D8] bg-[#FFFEFA] p-3.5 shadow-[0_2px_12px_rgba(23,32,25,0.04)]">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#DCE8D9] text-[#183D32]">
              <Users className="h-5 w-5" />
            </div>
            <div className="pr-2">
              <div className="font-mono text-xl font-bold tracking-tight text-[#172019]">
                {loadingStats ? "…" : (totalPeople ?? 0).toLocaleString()}
              </div>
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#777872]">
                People Indexed · {activeSourcesCount} {activeSourcesCount === 1 ? "Source" : "Sources"}
              </div>
            </div>
          </div>
        </div>

        {/* Three-Stage Progress Stepper derived from real state */}
        <div className="rounded-3xl border border-[#E4E0D8] bg-[#FFFEFA] p-5 shadow-[0_2px_8px_rgba(23,32,25,0.02)] sm:p-6">
          <div className="grid gap-4 sm:grid-cols-3 sm:gap-6">
            {/* Stage 1 */}
            <div className="relative flex items-center gap-3.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                  stage1Completed
                    ? "bg-[#DCE8D9] text-[#183D32]"
                    : "border-2 border-[#E4E0D8] text-[#777872]"
                }`}
              >
                {stage1Completed ? (
                  <AnimatedCheck size={16} />
                ) : (
                  <span className="font-mono text-xs font-semibold">1</span>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#777872]">
                  Stage 01
                </div>
                <div className="text-[14.5px] font-medium text-[#172019]">Add people</div>
                <div className="text-[11.5px] text-[#777872]">
                  {stage1Completed ? `${totalPeople} contacts indexed` : "Add or upload contacts"}
                </div>
              </div>
            </div>

            {/* Stage 2 */}
            <div className="relative flex items-center gap-3.5 border-t border-[#E4E0D8]/60 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                  stage2Completed
                    ? "bg-[#DCE8D9] text-[#183D32]"
                    : "border-2 border-[#E4E0D8] text-[#777872]"
                }`}
              >
                {stage2Completed ? (
                  <AnimatedCheck size={16} />
                ) : (
                  <span className="font-mono text-xs font-semibold">2</span>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#777872]">
                  Stage 02
                </div>
                <div className="text-[14.5px] font-medium text-[#172019]">Connect sources</div>
                <div className="text-[11.5px] text-[#777872]">
                  {stage2Completed
                    ? `${activeSourcesCount} platform${activeSourcesCount === 1 ? "" : "s"} connected`
                    : "Google, LinkedIn, X, Meta"}
                </div>
              </div>
            </div>

            {/* Stage 3 */}
            <div className="relative flex items-center gap-3.5 border-t border-[#E4E0D8]/60 pt-4 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                  stage3Ready
                    ? "bg-[#FF4D2D] text-[#FFFEFA]"
                    : "border-2 border-[#E4E0D8] text-[#777872]"
                }`}
              >
                {stage3Ready ? (
                  <Sparkles className="h-4 w-4" />
                ) : (
                  <span className="font-mono text-xs font-semibold">3</span>
                )}
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-[#777872]">
                  Stage 03
                </div>
                <div className="text-[14.5px] font-medium text-[#172019]">Start searching</div>
                <div className="text-[11.5px] text-[#777872]">
                  {stage3Ready ? "Graph ready to explore" : "Awaiting data input"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================
          2. PERSONAL NETWORK WORKSPACE
          =================================================================== */}
      <section className="space-y-4">
        <PersonalDataUploadCard onNetworkUpdate={refreshStats} />
      </section>

      {/* ===================================================================
          3. INTEGRATIONS GRID (PRIMARY FOCUS)
          =================================================================== */}
      <section className="space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-[#FF4D2D]" />
            <span className="font-mono text-xs font-semibold tracking-[0.14em] text-[#777872] uppercase">
              CONNECTED PLATFORMS
            </span>
          </div>
          <h2 className="mt-2 font-serif text-2xl font-normal text-[#172019] sm:text-3xl">
            Connect your sources
          </h2>
          <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-[#777872]">
            Ingest your real-world connections across email, professional networks, and social platforms. Every connection is unified into your single private graph.
          </p>
        </div>

        {/* Responsive Grid: 2 Columns on Desktop, Stacked on Mobile */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Google Workspace */}
          <GoogleSyncCard
            onNetworkUpdate={refreshStats}
            initialStatus={googleStatus}
            lastSyncedAt={googleLastSynced}
          />

          {/* LinkedIn */}
          <LinkedInUploadCard
            onNetworkUpdate={refreshStats}
            initialStatus={linkedinStatus}
            lastSyncedAt={linkedinLastSynced}
          />

          {/* X (Twitter) */}
          <XUploadCard
            onNetworkUpdate={refreshStats}
            initialStatus={xStatus}
            lastSyncedAt={xLastSynced}
          />

          {/* Instagram */}
          <InstagramUploadCard
            onNetworkUpdate={refreshStats}
            initialStatus={instagramStatus}
            lastSyncedAt={instagramLastSynced}
          />

          {/* Facebook */}
          <div className="md:col-span-2">
            <FacebookUploadCard
              onNetworkUpdate={refreshStats}
              initialStatus={facebookStatus}
              lastSyncedAt={facebookLastSynced}
            />
          </div>
        </div>
      </section>

      {/* ===================================================================
          4. PRIVACY & DATA-HANDLING SECTION
          =================================================================== */}
      <section className="rounded-3xl border border-[#E4E0D8] bg-[#F6F2E9]/60 p-6 sm:p-8">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#183D32]" />
            <span className="font-mono text-xs font-semibold tracking-[0.14em] text-[#183D32] uppercase">
              DATA PRIVACY & ARCHITECTURE
            </span>
          </div>
          <h2 className="mt-2 font-serif text-2xl font-normal text-[#172019]">
            Private by architecture, not just policy.
          </h2>
          <p className="mt-1.5 text-sm leading-relaxed text-[#777872]">
            Happensten is architected around minimal data ingestion, in-memory parsing, and isolated local processing.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {/* Pillar 1 */}
          <div className="rounded-2xl border border-[#E4E0D8] bg-[#FFFEFA] p-5 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCE8D9] text-[#183D32]">
              <Layers className="h-4 w-4" />
            </div>
            <h4 className="mt-3.5 text-sm font-semibold text-[#172019]">Metadata Only</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-[#777872]">
              We analyze sender, recipient, and timestamps to calculate interaction frequency. Message bodies, attachments, and email contents are never read or stored.
            </p>
          </div>

          {/* Pillar 2 */}
          <div className="rounded-2xl border border-[#E4E0D8] bg-[#FFFEFA] p-5 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCE8D9] text-[#183D32]">
              <Lock className="h-4 w-4" />
            </div>
            <h4 className="mt-3.5 text-sm font-semibold text-[#172019]">In-Memory Processing</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-[#777872]">
              Uploaded ZIP archives and CSV files are parsed transiently in-memory to stage relationship records, then immediately discarded. No raw archive files are stored on disk.
            </p>
          </div>

          {/* Pillar 3 */}
          <div className="rounded-2xl border border-[#E4E0D8] bg-[#FFFEFA] p-5 shadow-sm">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#DCE8D9] text-[#183D32]">
              <Cpu className="h-4 w-4" />
            </div>
            <h4 className="mt-3.5 text-sm font-semibold text-[#172019]">Local Vector Embeddings</h4>
            <p className="mt-1.5 text-xs leading-relaxed text-[#777872]">
              Relationship context and career profiles are converted into vector representations using a local ONNX model without transmitting personal bios to third-party AI APIs.
            </p>
          </div>
        </div>
      </section>

      {/* ===================================================================
          5. FINAL CALL TO ACTION BOARD
          =================================================================== */}
      <section className="relative overflow-hidden rounded-3xl bg-[#183D32] p-8 text-[#FFFEFA] shadow-[0_12px_40px_rgba(24,61,50,0.18)] sm:p-12">
        <div className="relative z-10 flex flex-col justify-between gap-8 md:flex-row md:items-center">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-[#DCE8D9] backdrop-blur-sm">
              <Sparkles className="h-3.5 w-3.5 text-[#FF4D2D]" />
              <span>{stage3Ready ? "Network ready to explore" : "Ready when you are"}</span>
            </div>
            <h2 className="mt-4 font-serif text-2xl font-normal leading-tight text-[#FFFEFA] sm:text-3xl lg:text-4xl">
              Your connections are closer than you think.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#DCE8D9]/80 sm:text-[15px]">
              Your network is ready to explore. Find the right people, discover useful places, and uncover meaningful introduction paths.
            </p>
          </div>

          <div className="flex shrink-0 flex-col items-start gap-3 sm:items-center md:items-end">
            <Link
              href="/search"
              className="inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-[#FF4D2D] px-8 text-base font-semibold text-[#FFFEFA] shadow-[0_4px_20px_rgba(255,77,45,0.35)] transition-all hover:bg-[#e03f21] hover:shadow-[0_6px_24px_rgba(255,77,45,0.45)] hover:scale-[1.02] active:scale-[0.98]"
            >
              <span>Launch Search</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
            <span className="font-mono text-xs text-[#DCE8D9]/70">
              {stage3Ready
                ? `${(totalPeople ?? 0).toLocaleString()} people indexed`
                : "Search enabled anytime"}
            </span>
          </div>
        </div>

        {/* Subtle decorative circles */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/[0.03] blur-2xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-[#FF4D2D]/10 blur-3xl"
        />
      </section>
    </div>
  );
}
