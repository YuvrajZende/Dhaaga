import React from "react";

interface AnimatedCheckProps {
  size?: number;
  className?: string;
  label?: string;
}

export function AnimatedCheck({ size = 18, className = "", label }: AnimatedCheckProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="relative flex h-5 w-5 items-center justify-center rounded-full bg-[#DCE8D9] text-[#183D32] shadow-sm animate-pop-in">
        <svg
          width={size}
          height={size}
          viewBox="0 0 20 20"
          fill="none"
          className="overflow-visible"
        >
          <path
            d="M5 10.5L8.5 14L15 6.5"
            stroke="#183D32"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 24,
              strokeDashoffset: 0,
              animation: "drawCheck 0.45s cubic-bezier(0.16, 1, 0.3, 1) forwards",
            }}
          />
        </svg>
      </span>
      {label && <span className="text-xs font-semibold text-[#183D32]">{label}</span>}
      <style jsx>{`
        @keyframes drawCheck {
          0% {
            stroke-dashoffset: 24;
            opacity: 0;
          }
          40% {
            opacity: 1;
          }
          100% {
            stroke-dashoffset: 0;
            opacity: 1;
          }
        }
      `}</style>
    </span>
  );
}

export function UploadedSuccessBadge({
  countText,
  className = "",
}: {
  countText?: string;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-emerald-300/80 bg-[#DCE8D9]/90 px-3 py-1 shadow-[0_2px_8px_rgba(24,61,50,0.08)] transition-all animate-pop-in ${className}`}
    >
      <AnimatedCheck size={14} />
      <span className="text-[11.5px] font-semibold text-[#183D32]">
        {countText || "Data Uploaded"}
      </span>
    </div>
  );
}
