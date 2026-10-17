"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle, Sparkles, Terminal, ChevronDown, ChevronUp } from "lucide-react";
import { GoogleMark, GmailMark } from "@/components/landing/brand-marks";

import { AnimatedCheck, UploadedSuccessBadge } from "@/components/ui/animated-check";

interface GoogleSyncCardProps {
  onNetworkUpdate?: () => void;
  initialStatus?: string;
  lastSyncedAt?: string | null;
}

export default function GoogleSyncCard({
  onNetworkUpdate,
  initialStatus,
  lastSyncedAt,
}: GoogleSyncCardProps) {
  const [syncing, setSyncing] = useState(false);
  const [done, setDone] = useState(initialStatus === "active");
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [currentSource, setCurrentSource] = useState<string | null>(null);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [showLogs, setShowLogs] = useState(false);

  function addLog(msg: string) {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    setLogs((prev) => [...prev.slice(-9), `[${time}] ${msg}`]);
  }

  async function handleStartSync() {
    setSyncing(true);
    setDone(false);
    setError(null);
    setTotalProcessed(0);
    setLogs([]);
    setShowLogs(true);
    addLog("Initializing Google sync jobs (Contacts, Gmail, Calendar)…");

    try {
      // 1. Create sync jobs
      const startRes = await fetch("/api/sync/start", { method: "POST" });
      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || "Failed to start Google sync");
      }
      addLog("Sync jobs queued. Starting chunk loop…");

      // 2. Drive chunk loop until allComplete
      let allDone = false;
      let ticks = 0;
      let processedSum = 0;

      while (!allDone && ticks < 200) {
        ticks++;
        const chunkRes = await fetch("/api/sync/chunk", { method: "POST" });
        if (!chunkRes.ok) {
          const err = await chunkRes.json();
          throw new Error(err.error || "Sync chunk failed");
        }

        const data = await chunkRes.json();
        if (data.source) {
          setCurrentSource(data.source);
        }

        if (data.processed) {
          processedSum += data.processed;
          setTotalProcessed(processedSum);
          addLog(`Processed +${data.processed} items from ${data.source || "source"} (Embeddings drained)`);
        }

        if (data.allComplete || (data.done && !data.source)) {
          allDone = true;
          break;
        }

        // Small breather between chunks
        await new Promise((r) => setTimeout(r, 200));
      }

      setDone(true);
      addLog("✅ Google sync complete! Network graph and embeddings up to date.");
      onNetworkUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync encountered an error");
      addLog(`❌ Error: ${err instanceof Error ? err.message : "Sync failed"}`);
    } finally {
      setSyncing(false);
      setCurrentSource(null);
    }
  }

  const isConnected = done || initialStatus === "active";

  return (
    <div
      className={`flex flex-col justify-between rounded-3xl border p-6 transition-all sm:p-7 ${
        isConnected
          ? "border-emerald-600/35 bg-[#FFFEFA] ring-1 ring-emerald-500/15 shadow-[0_4px_20px_rgba(24,61,50,0.06)]"
          : "border-[#E4E0D8] bg-[#FFFEFA] shadow-[0_2px_12px_rgba(23,32,25,0.03)] hover:border-[#183D32]/40 hover:shadow-[0_8px_24px_rgba(23,32,25,0.06)]"
      }`}
    >
      <div>
        {/* Top Header: Platform Icon, Badge & Status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/60 p-2 shadow-sm">
              <GoogleMark className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-[17px] font-normal text-[#172019]">
                  Google Workspace
                </h3>
              </div>
              <p className="text-xs text-[#777872]">Contacts, Gmail & Calendar</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <span className="rounded-full bg-[#183D32]/10 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#183D32]">
              OAuth 2.0
            </span>
            {isConnected && (
              <UploadedSuccessBadge countText="Connected & Synced" />
            )}
          </div>
        </div>

        {/* Description */}
        <p className="mt-4 text-xs leading-relaxed text-[#777872]">
          Syncs contacts, measures relationship strength from email interaction frequency (metadata only), and maps meeting co-occurrences.
        </p>

        {/* Feature Pills */}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full bg-[#F6F2E9] px-2.5 py-0.5 font-medium text-[#172019]">
            Google Contacts
          </span>
          <span className="rounded-full bg-[#F6F2E9] px-2.5 py-0.5 font-medium text-[#172019]">
            Gmail Metadata
          </span>
          <span className="rounded-full bg-[#F6F2E9] px-2.5 py-0.5 font-medium text-[#172019]">
            Calendar Meetings
          </span>
        </div>

        {/* Telemetry drawer */}
        {logs.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowLogs(!showLogs)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-[#183D32] hover:underline"
            >
              <Terminal className="h-3 w-3" />
              <span>{showLogs ? "Hide sync telemetry" : "View sync telemetry"}</span>
              {showLogs ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showLogs && (
              <div className="mt-2 rounded-2xl bg-[#172019] p-3 text-[11px] font-mono text-[#DCE8D9] shadow-inner">
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5 mb-2 text-[10px] text-[#777872]">
                  <span>LIVE SYNC STREAM</span>
                  {currentSource && <span className="text-[#5fd4d0]">ACTIVE: {currentSource}</span>}
                </div>
                <div className="max-h-28 overflow-y-auto space-y-1">
                  {logs.map((log, idx) => (
                    <p key={idx} className={idx === logs.length - 1 ? "text-[#5fd4d0]" : "text-white/70"}>
                      {log}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Footer: Action & Privacy note */}
      <div className="mt-5 border-t border-[#E4E0D8]/60 pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[11px] text-[#777872]">
            {lastSyncedAt
              ? `Synced ${new Date(lastSyncedAt).toLocaleDateString()}`
              : isConnected
                ? "Active & synced"
                : "Ready to connect"}
          </span>

          <button
            type="button"
            onClick={handleStartSync}
            disabled={syncing}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#183D32] px-4 py-2 text-xs font-semibold text-[#FFFEFA] shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
          >
            {syncing ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Syncing…</span>
              </>
            ) : isConnected ? (
              <>
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Re-sync</span>
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5 text-[#FF4D2D]" />
                <span>Start Sync</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
