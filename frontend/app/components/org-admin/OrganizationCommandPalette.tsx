"use client";

import { createPortal } from "react-dom";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

type PaletteContext = "dashboard" | "employees" | "departments" | "organization-chart" | "invitations" | "communications" | "support" | "settings" | "profile";

type IconName =
  | "dashboard"
  | "users"
  | "layers"
  | "hierarchy"
  | "mail"
  | "settings"
  | "credit-card"
  | "search"
  | "plus"
  | "arrow"
  | "close";

type Command = {
  id: string;
  label: string;
  description: string;
  keywords: string;
  icon: IconName;
  section: "Workspace" | "Actions";
  href?: string;
  action?: "create";
};

type OrganizationCommandPaletteProps = {
  context: PaletteContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate?: () => boolean | void;
  /** Return false to block navigation, e.g. when a drawer contains unsaved changes. */
  onNavigateRequest?: (href: string) => boolean | void;
};

function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  const artwork: Record<IconName, ReactNode> = {
    dashboard: (
      <>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="14" y="3" width="7" height="5" rx="1.5" />
        <rect x="14" y="11" width="7" height="10" rx="1.5" />
        <rect x="3" y="14" width="8" height="7" rx="1.5" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    hierarchy: (
      <>
        <rect x="9" y="3" width="6" height="5" rx="1" />
        <rect x="2" y="16" width="6" height="5" rx="1" />
        <rect x="16" y="16" width="6" height="5" rx="1" />
        <path d="M12 8v4M5 16v-2h14v2M19 14v2" />
      </>
    ),
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m4 7 8 6 8-6" />
      </>
    ),
    settings: (
      <>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="2" y1="14" x2="6" y2="14" />
        <line x1="10" y1="8" x2="14" y2="8" />
        <line x1="18" y1="16" x2="22" y2="16" />
      </>
    ),
    "credit-card": (
      <>
        <rect x="2.5" y="5" width="19" height="14" rx="2" />
        <path d="M2.5 10h19M7 15h3" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrow: <path d="M7 17 17 7M7 7h10v10" />,
    close: <path d="m18 6-12 12M6 6l12 12" />,
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 ${className}`}
    >
      {artwork[name]}
    </svg>
  );
}

const workspaceCommands: Command[] = [
  {
    id: "dashboard",
    label: "Dashboard overview",
    description: "Open your organization workspace overview",
    keywords: "home overview workspace metrics dashboard main",
    icon: "dashboard",
    section: "Workspace",
    href: "/org/dashboard",
  },
  {
    id: "my-profile",
    label: "My Profile",
    description: "View your Organization Admin account and upload your profile photo",
    keywords: "my profile account avatar photo picture organization admin",
    icon: "settings",
    section: "Workspace",
    href: "/org/profile",
  },
  {
    id: "employees",
    label: "Employee directory",
    description: "Browse employee records and reporting relationships",
    keywords: "employees people staff directory team employee records people operations",
    icon: "users",
    section: "Workspace",
    href: "/org/employees",
  },
  {
    id: "departments",
    label: "Departments",
    description: "Review department structure and staffing",
    keywords: "departments teams structure groups organization chart staffing organization",
    icon: "layers",
    section: "Workspace",
    href: "/org/departments",
  },
  {
    id: "organization-chart",
    label: "Organization chart",
    description: "View reporting relationships across your organization",
    keywords: "organization chart org chart hierarchy reporting lines managers team structure reporting tree",
    icon: "hierarchy",
    section: "Workspace",
    href: "/org/organization-chart",
  },
  {
    id: "invitations",
    label: "Workforce invitations",
    description: "Review pending, accepted, expired, and revoked workforce invitations",
    keywords: "invitation invitations onboarding activation email expired accepted revoked pending history logs",
    icon: "mail",
    section: "Workspace",
    href: "/org/invitations",
  },
  {
    id: "communications",
    label: "Messages",
    description: "Reply to conversations from your HR Manager",
    keywords: "messages communication inbox chat HR manager",
    icon: "mail",
    section: "Workspace",
    href: "/org/communications",
  },
  {
    id: "platform-support",
    label: "Platform Support",
    description: "Message the Platform Super Admin and review replies",
    keywords: "platform support super admin help message contact inbox",
    icon: "mail",
    section: "Workspace",
    href: "/org/support",
  },
  {
    id: "settings",
    label: "Organization Profile & Settings",
    description: "Manage regional preferences, working schedule, and legal details",
    keywords:
      "settings configuration preferences timezone locale currency date format working days country legal entity organization",
    icon: "settings",
    section: "Workspace",
    href: "/org/settings",
  },
  {
    id: "license-payments",
    label: "License & Payments",
    description: "View your organization's license, expiry date, and payment history",
    keywords: "license licensing subscription payment payments billing renewal receipt proof activation expiry expired days",
    icon: "credit-card",
    section: "Workspace",
    href: "/org/license",
  },
  {
    id: "change-password",
    label: "Change password",
    description: "Update your Organization Admin sign-in password",
    keywords: "account security password credentials sign-in login access",
    icon: "settings",
    section: "Workspace",
    href: "/account/change-password",
  },
];

export function OrganizationCommandPalette({
  context,
  open,
  onOpenChange,
  onCreate,
  onNavigateRequest,
}: OrganizationCommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);

  const currentHref =
    context === "dashboard"
      ? "/org/dashboard"
      : context === "employees"
        ? "/org/employees"
        : context === "departments"
          ? "/org/departments"
          : context === "organization-chart"
            ? "/org/organization-chart"
            : context === "invitations"
              ? "/org/invitations"
              : context === "communications"
                ? "/org/communications"
                : context === "support"
                  ? "/org/support"
                  : context === "profile"
                    ? "/org/profile"
                    : "/org/settings";

  const commands = useMemo(() => {
    const actions: Command[] = [];

    if (context === "employees") {
      if (onCreate) {
        actions.push({
          id: "create-employee",
          label: "Create employee",
          description: "Open the employee creation drawer",
          keywords: "new add create staff employee person",
          icon: "plus",
          section: "Actions",
          action: "create",
        });
      }


    }



    if (context === "departments") {
      if (onCreate) {
        actions.push({
          id: "create-department",
          label: "Create department",
          description: "Open the department creation drawer",
          keywords: "new add create department team",
          icon: "plus",
          section: "Actions",
          action: "create",
        });
      }


    }

    return [...workspaceCommands, ...actions];
  }, [context, onCreate]);

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) return commands;

    return commands.filter((command) =>
      `${command.label} ${command.description} ${command.keywords}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    function handleGlobalShortcuts(event: globalThis.KeyboardEvent) {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        onOpenChange(!open);
      } else if (open && event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
      }
    }

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousActive =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    document.body.style.overflow = "hidden";
    setQuery("");
    setActiveIndex(0);

    const focusFrame = window.requestAnimationFrame(() =>
      inputRef.current?.focus(),
    );

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;

      if (previousActive?.isConnected) previousActive.focus();
    };
  }, [open]);

  function activate(command: Command) {
    if (command.href) {
      // Selecting the current page should only dismiss the palette, not close
      // an open details/edit drawer or trigger its unsaved-changes guard.
      if (command.href === currentHref) {
        onOpenChange(false);
        return;
      }

      const allowed = onNavigateRequest?.(command.href);
      onOpenChange(false);

      if (allowed === false) return;

      router.push(command.href);
      return;
    }

    if (command.action === "create") {
      const allowed = onCreate?.();
      onOpenChange(false);

      if (allowed === false) return;

      return;
    }


  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) =>
        filteredCommands.length ? (index + 1) % filteredCommands.length : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        filteredCommands.length
          ? (index - 1 + filteredCommands.length) % filteredCommands.length
          : 0,
      );
      return;
    }

    if (event.key === "Enter" && filteredCommands[activeIndex]) {
      event.preventDefault();
      activate(filteredCommands[activeIndex]);
      return;
    }

    if (event.key === "Tab" && dialogRef.current) {
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (!focusable.length) return;

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
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="Control+K Meta+K"
        aria-label="Search workspace pages and actions"
        className="flex h-[43px] w-full min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-[#111a28] px-4 text-left text-sm text-slate-300 outline-none transition hover:border-[#75c7ff]/40 hover:bg-[#182232] focus:border-[#75c7ff] focus:ring-2 focus:ring-[#75c7ff]/20 focus-visible:ring-2 focus-visible:ring-[#75c7ff]/30"
      >
        <Icon name="search" size={20} className="text-slate-300" />
        <span className="min-w-0 flex-1 truncate text-slate-300">
          Search pages and actions…
        </span>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) onOpenChange(false);
            }}
          >
            <section
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="organization-command-title"
              aria-describedby="organization-command-description"
              tabIndex={-1}
              onKeyDown={handleKeyDown}
              className="organization-command-dialog w-full max-w-xl overflow-hidden rounded-2xl border border-[#34485e] bg-[#101925] text-[#f2f7fc] shadow-[0_28px_90px_rgba(0,0,0,0.65)]"
            >
              <div className="flex items-center gap-3 border-b border-[#29384b] px-4 py-4 sm:px-5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#75c7ff]/20 bg-[#75c7ff]/[0.08] text-[#8bcaff]">
                  <Icon name="search" size={18} />
                </span>

                <div className="min-w-0 flex-1">
                  <h2
                    id="organization-command-title"
                    className="text-sm font-semibold text-white"
                  >
                    Command palette
                  </h2>
                  <p
                    id="organization-command-description"
                    className="mt-0.5 text-[11px] text-slate-500"
                  >
                    Navigate your workspace or run a page action.
                  </p>
                </div>

                <kbd className="rounded border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-slate-500">
                  ESC
                </kbd>

                <button
                  type="button"
                  aria-label="Close command palette"
                  onClick={() => onOpenChange(false)}
                  className="rounded-md border border-white/[0.08] p-1.5 text-slate-400 transition hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
                >
                  <Icon name="close" size={15} />
                </button>
              </div>

              <div className="border-b border-[#29384b] px-4 py-3 sm:px-5">
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-2.5 text-slate-500">
                    <Icon name="search" size={16} />
                  </span>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search dashboard, employees, departments, invitations, settings, actions…"
                    className="h-10 w-full rounded-lg border border-white/10 bg-[#0b111b] py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#75c7ff]/60 focus:ring-2 focus:ring-[#75c7ff]/10"
                    aria-label="Search workspace commands"
                    aria-controls="organization-command-results"
                    aria-activedescendant={
                      filteredCommands[activeIndex]
                        ? `organization-command-option-${filteredCommands[activeIndex].id}`
                        : undefined
                    }
                    autoComplete="off"
                  />
                </div>
              </div>

              <div
                id="organization-command-results"
                role="listbox"
                aria-label="Workspace commands"
                className="max-h-[min(58vh,480px)] overflow-y-auto p-2"
              >
                {filteredCommands.length ? (
                  filteredCommands.map((command, index) => (
                    <div key={command.id}>
                      {(index === 0 ||
                        filteredCommands[index - 1]?.section !==
                          command.section) && (
                        <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">
                          {command.section === "Workspace"
                            ? "Workspace navigation"
                            : "Page actions"}
                        </p>
                      )}

                      <button
                        id={`organization-command-option-${command.id}`}
                        type="button"
                        role="option"
                        aria-selected={index === activeIndex}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => activate(command)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff] ${
                          index === activeIndex
                            ? "border-[#75c7ff]/20 bg-[#75c7ff]/[0.08]"
                            : "border-transparent hover:bg-white/[0.035]"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                            index === activeIndex
                              ? "bg-[#75c7ff]/10 text-[#8bcaff]"
                              : "bg-white/[0.04] text-slate-400"
                          }`}
                        >
                          <Icon name={command.icon} size={18} />
                        </span>

                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-100">
                            {command.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-slate-400">
                            {command.description}
                          </span>
                        </span>

                        {command.href === currentHref && (
                          <span className="rounded-full border border-[#75c7ff]/20 bg-[#75c7ff]/[0.07] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-[#a8ddff]">
                            Current
                          </span>
                        )}

                        {index === activeIndex && (
                          <kbd className="hidden text-[10px] text-[#a8ddff] sm:inline">
                            Enter ↵
                          </kbd>
                        )}
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-10 text-center">
                    <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-400">
                      <Icon name="search" size={20} />
                    </span>
                    <p className="mt-3 text-sm font-semibold text-slate-200">
                      No matching commands
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Try Dashboard, Employees, Departments, Organization Chart, Organization Profile & Settings, or Create.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#29384b] bg-[#0d141f] px-4 py-3 text-[10px] text-slate-500 sm:px-5">
                <span>
                  <kbd className="rounded border border-white/10 px-1.5 py-0.5">
                    ↑
                  </kbd>{" "}
                  <kbd className="rounded border border-white/10 px-1.5 py-0.5">
                    ↓
                  </kbd>{" "}
                  navigate
                </span>
                <span>
                  <kbd className="rounded border border-white/10 px-1.5 py-0.5">
                    Enter
                  </kbd>{" "}
                  select
                </span>
                <span className="ml-auto">Organization workspace</span>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </>
  );
}