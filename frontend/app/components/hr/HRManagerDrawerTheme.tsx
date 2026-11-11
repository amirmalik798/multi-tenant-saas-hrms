"use client";

export function HRManagerDrawerTheme() {
  return (
    <style jsx global>{`
      /*
       * Executive Titanium drawer system.
       * Scoped to HR Manager side drawers; centered confirmation dialogs
       * and other role workspaces are intentionally not restyled.
       */
      aside[role="dialog"] {
        width: min(100vw, 760px) !important;
        max-width: 760px !important;
        min-width: 0;
        height: 100dvh;
        color: #E8EEF7 !important;
        background:
          radial-gradient(ellipse at 100% 0%, rgba(59, 130, 246, 0.10), transparent 36%),
          linear-gradient(180deg, #182232 0%, #111927 48%, #0B0F17 100%) !important;
        border-left: 1px solid rgba(148, 163, 184, 0.22) !important;
        box-shadow: -24px 0 72px rgba(0, 0, 0, 0.48) !important;
        animation: hrms-drawer-enter 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
        overscroll-behavior: contain;
      }

      aside[role="dialog"] > header {
        min-height: 84px;
        flex-shrink: 0;
        gap: 1rem;
        padding: 1.15rem clamp(1rem, 3vw, 2rem) !important;
        border-bottom: 1px solid rgba(148, 163, 184, 0.18) !important;
        background: linear-gradient(
          110deg,
          rgba(59, 130, 246, 0.16),
          rgba(30, 41, 59, 0.62) 52%,
          rgba(11, 15, 23, 0.22)
        ) !important;
        backdrop-filter: blur(14px);
      }

      aside[role="dialog"] > header h2 {
        color: #F8FAFC !important;
        letter-spacing: -0.025em;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }

      aside[role="dialog"] > header p,
      aside[role="dialog"] > header [class*="text-slate-400"],
      aside[role="dialog"] > header [class*="text-gray-400"] {
        color: #AAB8CA !important;
      }

      aside[role="dialog"] > header > button {
        display: inline-flex;
        width: 40px;
        height: 40px;
        flex-shrink: 0;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(148, 163, 184, 0.24) !important;
        border-radius: 10px !important;
        background: rgba(11, 15, 23, 0.72) !important;
        color: #C7D2E0 !important;
        transition: background-color 140ms ease, border-color 140ms ease, color 140ms ease;
      }

      aside[role="dialog"] > header > button:hover:not(:disabled) {
        border-color: rgba(96, 165, 250, 0.55) !important;
        background: rgba(37, 99, 235, 0.18) !important;
        color: #FFFFFF !important;
      }

      aside[role="dialog"] > div.flex-1.overflow-y-auto {
        min-height: 0;
        padding: clamp(1rem, 3vw, 1.75rem) !important;
        overscroll-behavior: contain;
        scrollbar-color: rgba(100, 116, 139, 0.55) transparent;
        scrollbar-width: thin;
      }

      aside[role="dialog"] section.rounded-2xl {
        border: 1px solid rgba(100, 116, 139, 0.28) !important;
        border-radius: 16px !important;
        background: linear-gradient(145deg, rgba(30, 41, 59, 0.84), rgba(17, 25, 39, 0.96)) !important;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16) !important;
      }

      aside[role="dialog"] label {
        color: #D6DFEA;
      }

      aside[role="dialog"] input:not([aria-invalid="true"]),
      aside[role="dialog"] select:not([aria-invalid="true"]),
      aside[role="dialog"] textarea:not([aria-invalid="true"]) {
        border-color: rgba(148, 163, 184, 0.32) !important;
        background-color: #0B111C !important;
        color: #F1F5F9 !important;
        border-radius: 10px;
      }

      aside[role="dialog"] input[aria-invalid="true"],
      aside[role="dialog"] select[aria-invalid="true"],
      aside[role="dialog"] textarea[aria-invalid="true"] {
        border-color: rgba(248, 113, 113, 0.88) !important;
        box-shadow: 0 0 0 1px rgba(248, 113, 113, 0.14);
      }

      aside[role="dialog"] input::placeholder,
      aside[role="dialog"] textarea::placeholder {
        color: #8493A7;
      }

      aside[role="dialog"] input,
      aside[role="dialog"] select,
      aside[role="dialog"] textarea {
        max-width: 100%;
      }

      aside[role="dialog"] input:focus-visible,
      aside[role="dialog"] select:focus-visible,
      aside[role="dialog"] textarea:focus-visible,
      aside[role="dialog"] button:focus-visible,
      aside[role="dialog"] a:focus-visible {
        outline: 2px solid #60A5FA;
        outline-offset: 2px;
      }

      aside[role="dialog"] > footer {
        flex-shrink: 0;
        gap: 0.75rem;
        padding: 1rem clamp(1rem, 3vw, 2rem) !important;
        border-top: 1px solid rgba(148, 163, 184, 0.18) !important;
        background: rgba(11, 15, 23, 0.94) !important;
        box-shadow: 0 -12px 32px rgba(0, 0, 0, 0.18) !important;
        backdrop-filter: blur(14px);
      }

      /* Align legacy blue utility classes in shared HR components with cobalt. */
      .text-blue-50 { color: #F8FAFC !important; }
      .text-blue-100 { color: #E2EAF5 !important; }
      .text-blue-200 { color: #C7D9F2 !important; }
      .text-blue-300 { color: #93C5FD !important; }
      .text-blue-400 { color: #60A5FA !important; }
      .text-blue-500 { color: #3B82F6 !important; }
      .bg-blue-400 { background-color: #60A5FA !important; }
      .bg-blue-500 { background-color: #2563EB !important; }
      [class~="bg-blue-500/10"] { background-color: rgb(59 130 246 / 0.12) !important; }
      [class~="bg-blue-500/15"] { background-color: rgb(59 130 246 / 0.16) !important; }
      [class~="bg-blue-500/20"] { background-color: rgb(59 130 246 / 0.20) !important; }
      [class~="bg-blue-500/[0.07]"] { background-color: rgb(59 130 246 / 0.08) !important; }
      [class~="bg-blue-400/10"],
      [class~="bg-blue-400/[0.07]"],
      [class~="bg-blue-300/[0.04]"],
      [class~="bg-blue-500/[0.08]"],
      [class~="bg-blue-500/[0.035]"] { background-color: rgb(59 130 246 / 0.09) !important; }
      [class~="border-blue-400/20"],
      [class~="border-blue-400/15"],
      [class~="border-blue-300/15"],
      [class~="border-blue-500/15"],
      [class~="border-blue-500/20"],
      [class~="border-blue-500/30"] { border-color: rgb(96 165 250 / 0.30) !important; }
      [class~="border-t-blue-500"] { border-top-color: #3B82F6 !important; }
      [class~="ring-blue-500/20"],
      [class~="ring-blue-500/30"],
      [class~="ring-blue-400/20"],
      [class~="ring-blue-400/15"] { --tw-ring-color: rgb(96 165 250 / 0.32) !important; }
      [class~="focus:border-blue-500"]:focus,
      [class~="focus:border-blue-400/40"]:focus,
      [class~="focus:border-blue-300/40"]:focus { border-color: #60A5FA !important; }
      [class~="focus:ring-blue-500/20"]:focus,
      [class~="focus:ring-blue-300/10"]:focus,
      [class~="focus:ring-blue-400/10"]:focus { --tw-ring-color: rgb(96 165 250 / 0.36) !important; }
      [class~="hover:bg-blue-400"]:hover { background-color: #60A5FA !important; }
      [class~="hover:bg-blue-500/20"]:hover { background-color: rgb(59 130 246 / 0.24) !important; }
      [class~="hover:bg-blue-300"]:hover { background-color: #93C5FD !important; }
      [class~="hover:border-blue-500/50"]:hover { border-color: rgb(96 165 250 / 0.52) !important; }
      [class~="hover:text-blue-200"]:hover,
      [class~="hover:text-blue-300"]:hover,
      [class~="hover:text-blue-400"]:hover { color: #DBEAFE !important; }
      .group:hover [class~="group-hover:text-blue-300"] { color: #DBEAFE !important; }
      [class~="focus-visible:ring-blue-400"]:focus-visible,
      [class~="focus-visible:ring-blue-300"]:focus-visible,
      [class~="focus-visible:ring-blue-500/30"]:focus-visible { --tw-ring-color: #60A5FA !important; }
      .accent-blue-400 { accent-color: #3B82F6 !important; }

      @keyframes hrms-drawer-enter {
        from { transform: translateX(24px); opacity: 0.65; }
        to { transform: translateX(0); opacity: 1; }
      }

      @media (max-width: 640px) {
        aside[role="dialog"] {
          width: 100vw !important;
          max-width: 100vw !important;
          border-left: 0 !important;
        }
        aside[role="dialog"] > header { min-height: 76px; }
      }

      @media (prefers-reduced-motion: reduce) {
        aside[role="dialog"] { animation: none !important; }
      }
    `}</style>
  );
}
