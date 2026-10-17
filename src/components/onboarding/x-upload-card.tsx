"use client";

import { useState, useRef } from "react";
import { UploadCloud, CheckCircle2, AlertCircle, RefreshCw, HelpCircle, ChevronDown, ChevronUp } from "lucide-react";
import { XMark } from "@/components/landing/brand-marks";
import { AnimatedCheck, UploadedSuccessBadge } from "@/components/ui/animated-check";

interface XUploadCardProps {
  onNetworkUpdate?: () => void;
  initialStatus?: string;
  lastSyncedAt?: string | null;
}

export default function XUploadCard({
  onNetworkUpdate,
  initialStatus,
  lastSyncedAt,
}: XUploadCardProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [stagedCount, setStagedCount] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [done, setDone] = useState(initialStatus === "active");
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".zip")) {
      setError("Please select a valid ZIP file (your Twitter/X data archive).");
      return;
    }

    setError(null);
    setUploading(true);
    setDone(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 1. Upload & Fast Staging
      const res = await fetch("/api/import/x", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to upload X archive");
      }

      const data = await res.json();
      setStagedCount(data.staged);
      setUploading(false);
      setEmbedding(true);

      // 2. Drive client chunk loop
      let allDone = false;
      let ticks = 0;
      let count = 0;

      while (!allDone && ticks < 200) {
        ticks++;
        let chunkRes: Response | null = null;
        let retries = 0;

        while (retries < 3) {
          try {
            chunkRes = await fetch("/api/sync/chunk", { method: "POST" });
            if (chunkRes.ok) break;
            if (chunkRes.status === 401) throw new Error("Session expired. Please refresh.");
          } catch (e) {
            console.warn("Sync chunk network hiccup, retrying...", e);
          }
          retries++;
          await new Promise((r) => setTimeout(r, 800 * retries));
        }

        if (!chunkRes || !chunkRes.ok) {
          const errData = await chunkRes?.json().catch(() => ({}));
          throw new Error(errData?.error || "Indexing encountered an issue. Please try again.");
        }

        const chunkData = await chunkRes.json();
        if (chunkData.processed) {
          count += chunkData.processed;
          setProcessedCount(Math.min(count, data.staged));
        }

        if (chunkData.allComplete || (chunkData.done && chunkData.source === "x_import")) {
          allDone = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 100));
      }

      setProcessedCount(data.staged);
      setDone(true);
      onNetworkUpdate?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      setEmbedding(false);
    }
  }

  function onDrag(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
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
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#172019]/20 bg-[#172019] p-2.5 text-[#FFFEFA] shadow-sm">
              <XMark className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-serif text-[17px] font-normal text-[#172019]">
                X (Twitter)
              </h3>
              <p className="text-xs text-[#777872]">Followers & following accounts</p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <span className="rounded-full bg-[#172019]/10 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#172019]">
              ZIP Archive
            </span>
            {isConnected && (
              <UploadedSuccessBadge
                countText={stagedCount > 0 ? `Indexed ${stagedCount} accounts` : "Data Uploaded"}
              />
            )}
          </div>
        </div>

        {/* Description */}
        <p className="mt-4 text-xs leading-relaxed text-[#777872]">
          Ingest following and follower handles from your Twitter/X data archive to identify mutual connections and industry interests.
        </p>

        {/* How to export drawer */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowHelp(!showHelp)}
            className="flex items-center gap-1 text-[11.5px] font-medium text-[#172019] hover:underline"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span>How to export X archive</span>
            {showHelp ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {showHelp && (
            <div className="mt-2 rounded-2xl border border-[#E4E0D8] bg-[#F6F2E9]/70 p-3.5 text-xs text-[#172019] space-y-1.5">
              <p className="font-semibold text-xs">Steps to export:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11.5px] text-[#777872]">
                <li>Go to X <strong>Settings and privacy → Your account</strong></li>
                <li>Select <strong>Download an archive of your data</strong></li>
                <li>Confirm your password and wait for the download link</li>
                <li>Drop the downloaded <code className="rounded bg-white px-1 font-mono text-[#172019]">.zip</code> file here</li>
              </ol>
            </div>
          )}
        </div>

        {/* Upload Dropzone */}
        <div
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`mt-4 border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${
            dragActive
              ? "border-[#172019] bg-[#172019]/5"
              : "border-[#E4E0D8] hover:border-[#172019]/60 bg-[#F6F2E9]/30"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />

          {uploading ? (
            <div className="flex flex-col items-center gap-1.5">
              <RefreshCw className="h-6 w-6 animate-spin text-[#172019]" />
              <p className="text-xs font-semibold text-[#172019]">Unzipping archive in-memory…</p>
            </div>
          ) : embedding ? (
            <div className="flex flex-col items-center gap-1.5 max-w-xs mx-auto">
              <RefreshCw className="h-6 w-6 animate-spin text-[#183D32]" />
              <p className="text-xs font-semibold text-[#172019]">
                Vectorizing {processedCount} / {stagedCount}…
              </p>
              <div className="w-full h-1.5 rounded-full bg-[#E4E0D8] overflow-hidden mt-1">
                <div
                  className="h-full bg-[#172019] transition-all duration-200"
                  style={{
                    width: `${stagedCount > 0 ? Math.min(100, Math.round((processedCount / stagedCount) * 100)) : 10}%`,
                  }}
                />
              </div>
            </div>
          ) : isConnected ? (
            <div className="flex flex-col items-center gap-1.5 text-emerald-700">
              <AnimatedCheck size={26} />
              <p className="text-xs font-semibold text-[#183D32]">
                {stagedCount > 0 ? `Indexed ${stagedCount} X connections!` : "X Archive Connected & Synced"}
              </p>
              <p className="text-[10.5px] text-[#777872]">Drop another ZIP to update</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <UploadCloud className="h-6 w-6 text-[#777872]" />
              <p className="text-xs font-medium text-[#172019]">
                Drop Twitter/X <span className="font-semibold text-[#172019]">archive.zip</span> here or browse
              </p>
              <p className="text-[10.5px] text-[#777872]">Extracts following & followers</p>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 border-t border-[#E4E0D8]/60 pt-4 flex items-center justify-between text-[11px]">
        <span className="font-mono text-[#777872]">
          {lastSyncedAt ? `Uploaded ${new Date(lastSyncedAt).toLocaleDateString()}` : "Zero files saved on disk"}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="font-medium text-[#172019] hover:underline"
        >
          {isConnected ? "Replace ZIP" : "Select archive"}
        </button>
      </div>
    </div>
  );
}
