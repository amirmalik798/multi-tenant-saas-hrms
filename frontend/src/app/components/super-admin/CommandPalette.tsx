"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CommandPaletteCategory =
  | "Quick Actions"
  | "Navigation"
  | "Matching Organizations"
  | "Coming Soon";

export type CommandPaletteItem = {
  id: string;
  label: string;
  description: string;
  category: CommandPaletteCategory;
  href?: string;
  disabled?: boolean;
  organizationId?: string;
  status?: string;
};

export type CommandPaletteOrganization = {
  id: string;
  name: string;
  slug: string;
  status: string;
};

/** Shared command definitions so every Super Admin page has the same palette. */
export function buildSuperAdminCommandItems(
  organizations: CommandPaletteOrganization[],
): CommandPaletteItem[] {
  const staticItems: CommandPaletteItem[] = [
    {
      id: "create-organization",
      label: "Create new organization",
      description: "Register a new organization on the platform",
      category: "Quick Actions",
      href: "/dashboard/organizations?create=1",
    },
    {
      id: "invite-administrator",
      label: "Invite administrator",
      description: "Open Organizations and choose an organization to invite its admin",
      category: "Quick Actions",
      href: "/dashboard/organizations",
    },
    {
      id: "go-dashboard",
      label: "Dashboard",
      description: "Platform overview and key metrics",
      category: "Navigation",
      href: "/dashboard",
    },
    {
      id: "go-organizations",
      label: "Organizations",
      description: "Manage organizations, status, and administrator invitations",
      category: "Navigation",
      href: "/dashboard/organizations",
    },
    {
      id: "go-admins",
      label: "Organization Admins",
      description: "Review organization administrator accounts",
      category: "Navigation",
      href: "/dashboard/organization-admins",
    },
    {
      id: "go-payments",
      label: "Payments",
      description: "Review payment proofs, verify submissions, and manage organization licenses",
      category: "Navigation",
      href: "/dashboard/payments",
    },
    {
      id: "go-invitations",
      label: "Invitations",
      description: "Review invitation status and history",
      category: "Navigation",
      href: "/dashboard/invitations",
    },
    {
      id: "go-platform-support",
      label: "Platform Support Inbox",
      description: "Reply to support messages from organization administrators",
      category: "Navigation",
      href: "/dashboard/support",
    },
    {
      id: "go-system-health",
      label: "System Health",
      description: "Inspect database readiness and email configuration health",
      category: "Navigation",
      href: "/dashboard/system-health",
    },
    {
      id: "go-audit-logs",
      label: "Audit Logs",
      description: "Review platform audit events and inspect recorded changes",
      category: "Navigation",
      href: "/dashboard/audit-logs",
    },
  ];

  const organizationItems = organizations.map((organization): CommandPaletteItem => ({
    id: `organization-${organization.id}`,
    label: organization.name,
    description: organization.slug,
    category: "Matching Organizations",
    href: `/dashboard/organizations?organizationId=${encodeURIComponent(organization.id)}&panel=view`,
    organizationId: organization.id,
    status: organization.status,
  }));

  return [...staticItems, ...organizationItems];
}

export function CommandPaletteTrigger({
  onClick,
  compact = false,
}: {
  onClick: () => void;
  compact?: boolean;
}) {
  // The search field itself opens the palette. Keep this compatibility
  // component inert so older page layouts no longer render shortcut badges.
  void onClick;
  void compact;
  return null;
}

function PaletteIcon({ name, size = 18 }: { name: "search" | "building" | "arrow" | "dashboard" | "shield"; size?: number }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    building: <><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M9 21.5v-5h6v5M8 7h2m4 0h2M8 11h2m4 0h2" /></>,
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="11" width="7" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {paths[name]}
    </svg>
  );
}

function getStatusStyle(status: string) {
  switch (status) {
    case "ACTIVE": return "bg-emerald-500/10 text-emerald-300 ring-emerald-400/20";
    case "PENDING_SETUP": return "bg-amber-500/10 text-amber-300 ring-amber-400/20";
    case "SUSPENDED": return "bg-rose-500/10 text-rose-300 ring-rose-400/20";
    default: return "bg-white/[0.06] text-slate-300 ring-white/10";
  }
}

function formatStatus(status: string) {
  return status.toLowerCase().split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function CommandPalette({
  open,
  onOpenChange,
  items,
  onSelect,
  blocked = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: CommandPaletteItem[];
  onSelect: (item: CommandPaletteItem) => void;
  blocked?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [activeCommandId, setActiveCommandId] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  const visibleItems = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (item: CommandPaletteItem) => {
      const haystack = `${item.label} ${item.description} ${item.category} ${item.status ?? ""}`.toLowerCase();
      return tokens.length === 0 || tokens.every((token) => haystack.includes(token));
    };
    const matchingStatic = items.filter((item) => item.category !== "Matching Organizations" && matches(item));
    const matchingOrganizations = items
      .filter((item) => item.category === "Matching Organizations" && matches(item))
      .slice(0, tokens.length > 0 ? 8 : 5);
    return [...matchingStatic, ...matchingOrganizations];
  }, [items, query]);

  const activePaletteItem = visibleItems.find(
    (item) => item.id === activeCommandId && !item.disabled && Boolean(item.href),
  ) ?? visibleItems.find((item) => !item.disabled && Boolean(item.href));

  const closePalette = useCallback(() => {
    setQuery("");
    setActiveCommandId("");
    onOpenChange(false);
  }, [onOpenChange]);

  const selectItem = useCallback((item: CommandPaletteItem) => {
    if (item.disabled || !item.href) return;
    closePalette();
    onSelect(item);
  }, [closePalette, onSelect]);

  // Global shortcut and keyboard-first navigation are shared by all pages using this component.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (blocked) return;
        if (open) closePalette();
        else {
          setQuery("");
          setActiveCommandId("");
          onOpenChange(true);
        }
        return;
      }
      if (!open) return;

      if (event.key === "Escape") {
        event.preventDefault();
        closePalette();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const enabled = visibleItems.filter((item) => !item.disabled && Boolean(item.href));
        if (enabled.length === 0) return;
        event.preventDefault();
        const currentIndex = enabled.findIndex((item) => item.id === (activePaletteItem?.id ?? activeCommandId));
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = currentIndex < 0
          ? (direction === 1 ? 0 : enabled.length - 1)
          : (currentIndex + direction + enabled.length) % enabled.length;
        setActiveCommandId(enabled[nextIndex].id);
      } else if (event.key === "Enter") {
        const selected = visibleItems.find((item) => item.id === (activePaletteItem?.id ?? activeCommandId));
        if (selected && !selected.disabled && selected.href) {
          event.preventDefault();
          selectItem(selected);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeCommandId, activePaletteItem?.id, blocked, closePalette, onOpenChange, open, selectItem, visibleItems]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const animationFrame = window.requestAnimationFrame(() => inputRef.current?.focus());

    function trapTabKey(event: KeyboardEvent) {
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", trapTabKey);
    return () => {
      document.removeEventListener("keydown", trapTabKey);
      window.cancelAnimationFrame(animationFrame);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  const categories: CommandPaletteCategory[] = ["Quick Actions", "Navigation", "Matching Organizations", "Coming Soon"];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 px-4 pb-8 pt-[8vh] backdrop-blur-md sm:pt-[10vh]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) closePalette(); }}
    >
      <section
        ref={dialogRef}
        id="command-palette-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-palette-title"
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/15 bg-[#182232]/95 shadow-[0_24px_64px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#75c7ff]/10 text-[#75c7ff]">
            <PaletteIcon name="search" size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="command-palette-title" className="sr-only">Command Palette</h2>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setActiveCommandId(""); }}
              placeholder="Type a command or search organizations and logs..."
              aria-label="Search commands and organizations"
              aria-controls="command-palette-results"
              aria-activedescendant={activePaletteItem ? `command-result-${activePaletteItem.id.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined}
              role="combobox"
              aria-expanded="true"
              aria-autocomplete="list"
              className="w-full border-0 bg-transparent text-base text-white outline-none placeholder:text-slate-500 focus:ring-0 sm:text-lg"
            />
          </div>
          <kbd className="hidden shrink-0 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold text-slate-400 sm:inline-block">ESC</kbd>
          <button type="button" onClick={closePalette} aria-label="Close command palette" className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30">Close</button>
        </div>

        <div id="command-palette-results" role="listbox" aria-label="Command results" className="max-h-[min(65vh,560px)] overflow-y-auto p-2 [scrollbar-width:thin] [scrollbar-color:rgba(100,116,139,0.75)_transparent]">
          {categories.map((category) => {
            const groupItems = visibleItems.filter((item) => item.category === category);
            if (groupItems.length === 0) return null;
            return (
              <section key={category} role="group" aria-label={category} className="mb-2 last:mb-0">
                <p className="px-3 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{category}</p>
                {groupItems.map((item) => {
                  const highlighted = item.id === activePaletteItem?.id;
                  const iconName = item.category === "Matching Organizations" ? "building" : item.category === "Quick Actions" ? "arrow" : item.category === "Navigation" ? "dashboard" : "shield";
                  const resultId = `command-result-${item.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
                  return (
                    <button
                      type="button"
                      role="option"
                      id={resultId}
                      key={item.id}
                      aria-selected={highlighted}
                      aria-disabled={item.disabled || undefined}
                      disabled={item.disabled}
                      onMouseEnter={() => { if (!item.disabled && item.href) setActiveCommandId(item.id); }}
                      onClick={() => selectItem(item)}
                      className={`flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${item.disabled ? "cursor-not-allowed text-slate-500 opacity-75" : highlighted ? "bg-[#75c7ff]/[0.10] text-white ring-1 ring-inset ring-[#75c7ff]/20" : "text-slate-200 hover:bg-white/[0.06]"}`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${highlighted && !item.disabled ? "bg-[#75c7ff]/10 text-[#b9e2ff]" : "bg-white/[0.04] text-slate-300"}`}>
                        <PaletteIcon name={iconName} size={18} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-400">{item.description}</span>
                      </span>
                      {item.status ? (
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ${getStatusStyle(item.status)}`}>{formatStatus(item.status)}</span>
                      ) : item.disabled ? (
                        <span className="shrink-0 rounded border border-white/10 px-1.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-500">Unavailable</span>
                      ) : (
                        <kbd className="shrink-0 rounded border border-white/10 px-1.5 py-1 text-[10px] text-slate-500">↵</kbd>
                      )}
                    </button>
                  );
                })}
              </section>
            );
          })}
          {visibleItems.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">No matching commands or organizations.</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#0f1724]/80 px-4 py-3 text-[10px] text-slate-400 sm:px-5">
          <span>Navigate with ↑ ↓ and open with Enter</span>
          <span className="flex items-center gap-2"><kbd className="rounded border border-white/10 px-1.5 py-0.5">ESC</kbd><span>to close</span></span>
        </div>
      </section>
    </div>
  );
}