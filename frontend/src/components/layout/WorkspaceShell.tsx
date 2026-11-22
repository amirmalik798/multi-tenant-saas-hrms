"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Activity, Bell, Building2, Check, ChevronDown, ChevronsLeft, ChevronsRight, LogOut, Menu, Moon, Search, Settings2, ShieldCheck, Sun, X } from "lucide-react";
import { useWorkspace } from "@/components/layout/WorkspaceGate";
import { workspaceNavigation, roleLabels, type NavItem } from "@/lib/workspace-config";
import { apiRequest, pickArray, stringValue } from "@/lib/api-client";
import { OrganizationMark } from "@/components/layout/OrganizationMark";
import { ProfilePhoto } from "@/components/ui/ProfilePhoto";
import { useSmartRefresh } from "@/lib/smart-refresh";
import { WorkspaceClock } from "@/components/layout/WorkspaceClock";
import type { WorkspaceRole } from "@/types/workspace";

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const { user, timeZone, timeZoneStatus } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [tabletCompactSidebar, setTabletCompactSidebar] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const commandPanelRef = useRef<HTMLElement | null>(null);
  const [commandQuery, setCommandQuery] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [alerts, setAlerts] = useState<Record<string, unknown>[]>([]);

  const groups = useMemo(() => workspaceNavigation[user.role].map((group) => ({
    ...group,
    items: group.items.filter((nav) => !nav.permission || user.permissions.includes(nav.permission) || user.role === "ORGANIZATION_ADMIN" || nav.section === "team"),
  })).filter((group) => group.items.length > 0), [user]);
  const allItems = groups.flatMap((group) => group.items);

  useEffect(() => {
    const saved = window.localStorage.getItem("hrms-theme");
    const initial = saved === "dark" ? "dark" : "light";
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);
  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("hrms-theme", next);
  };

  const loadAlerts = useCallback(async () => {
    try {
      const result = await apiRequest<unknown>("/notifications/summary");
      setAlerts(pickArray(result, "alerts", "notifications"));
    } catch { /* Notifications are supplemental; the page remains usable. */ }
  }, []);
  useEffect(() => { void loadAlerts(); }, [loadAlerts]);
  useSmartRefresh(loadAlerts);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      }
      if (event.key === "Escape") { setCommandOpen(false); setMobileOpen(false); setMenuOpen(false); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 761px) and (max-width: 1100px)");
    const syncCompactSidebar = () => setTabletCompactSidebar(media.matches);
    syncCompactSidebar();
    media.addEventListener("change", syncCompactSidebar);
    return () => media.removeEventListener("change", syncCompactSidebar);
  }, []);

  useEffect(() => {
    if (!commandOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const first = commandPanelRef.current?.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])");
      (first ?? commandPanelRef.current)?.focus();
    });
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !commandPanelRef.current) return;
      const focusable = Array.from(commandPanelRef.current.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'));
      if (!focusable.length) { event.preventDefault(); commandPanelRef.current.focus(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", trapFocus);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [commandOpen]);

  const filteredItems = allItems.filter((item) => `${item.label} ${item.href}`.toLowerCase().includes(commandQuery.toLowerCase()));
  const activeItem = allItems.find((item) => pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))) ?? allItems[0];
  const mobileItems = allItems.slice(0, 5);

  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError("");
    try {
      const endpoint = user.role === "ORGANIZATION_ADMIN" ? "/org/auth/logout" : "/employee-auth/logout";
      await apiRequest<unknown>(endpoint, { method: "POST" });
      router.replace("/");
      router.refresh();
    } catch (error) {
      setLogoutError(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
    } finally { setLogoutBusy(false); }
  }

  const unreadCount = alerts.reduce((sum, row) => sum + (Number(row.count ?? row.unreadCount ?? 0) || 0), 0);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""} ${mobileOpen ? "sidebar-mobile-open" : ""}`}>
        <Link href={roleHome(user.role)} className="brand">
          <span className="brand-mark"><Activity size={19} strokeWidth={2.3} /></span>
          <span className="brand-copy"><span className="brand-name">HRMS</span><span className="brand-caption">Workforce platform</span></span>
        </Link>
        <div className="sidebar-workspace" title={user.organizationName}>
          <OrganizationMark name={user.organizationName} />
          <span className="sidebar-workspace-copy"><span className="sidebar-workspace-name">{user.organizationName}</span><span className="sidebar-workspace-role">{roleLabels[user.role]}</span></span>
        </div>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {groups.map((group) => <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || (item.href.length > 1 && pathname.startsWith(`${item.href}/`));
              return <Link key={item.href} href={item.href} className={`nav-link ${active ? "nav-link-active" : ""}`} aria-current={active ? "page" : undefined} title={collapsed || tabletCompactSidebar ? item.label : undefined}>
                <span className="nav-icon"><Icon size={17} strokeWidth={1.85} /></span><span className="nav-label">{item.label}</span>
              </Link>;
            })}
          </div>)}
        </nav>
        <div className="sidebar-footer"><button type="button" className="sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>{collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}<span>{collapsed ? "Expand" : "Collapse sidebar"}</span></button></div>
      </aside>

      <div className={`main-region ${collapsed ? "main-region-expanded" : ""}`}>
        <header className="topbar">
          <div className="topbar-left">
            <button type="button" className="icon-button mobile-menu-button" onClick={() => setMobileOpen((value) => !value)} aria-label={mobileOpen ? "Close navigation" : "Open navigation"} aria-expanded={mobileOpen}>{mobileOpen ? <X size={19} /> : <Menu size={19} />}</button>
            <div className="topbar-org"><strong>{user.organizationName}</strong><span>{activeItem?.label ?? roleLabels[user.role]}</span></div>
            <span className="topbar-divider" />
            <button type="button" className="search-trigger" aria-haspopup="dialog" aria-expanded={commandOpen} onClick={() => setCommandOpen(true)}><Search size={15} /><span>Search workspace</span></button>
          </div>
          <div className="topbar-actions">
            <WorkspaceClock timeZone={timeZone} timeZoneStatus={timeZoneStatus} showAttendanceStatus={user.role !== "ORGANIZATION_ADMIN" && !(user.role === "EMPLOYEE" && pathname === "/employee/dashboard")} />
            <button type="button" className="icon-button" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button>
            <button type="button" className="icon-button" aria-label={`Notifications, ${unreadCount} pending`} onClick={() => router.push(user.role === "EMPLOYEE" ? "/employee/requests" : user.role === "DEPARTMENT_MANAGER" ? "/dm/reviews" : user.role === "HR_MANAGER" ? "/hr/work-queue" : "/org/attendance")} style={{ position: "relative" }}><Bell size={17} />{unreadCount > 0 ? <span style={{ position: "absolute", top: 4, right: 4, width: 7, height: 7, background: "#e05b5b", borderRadius: 99, border: "1px solid var(--surface)" }} /> : null}</button>
            <span className="topbar-divider" />
            <div style={{ position: "relative" }}>
              <button type="button" className="user-menu" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
                <ProfilePhoto name={user.displayName || user.organizationName} employeeId={user.employeeId} currentUser={user.role !== "ORGANIZATION_ADMIN"} organizationAdmin={user.role === "ORGANIZATION_ADMIN"} /><span className="user-menu-copy"><strong>{user.displayName || roleLabels[user.role]}</strong><span>{roleLabels[user.role]}</span></span><ChevronDown size={14} color="var(--muted)" />
              </button>
              {menuOpen ? <div className="panel" style={{ position: "absolute", top: 45, right: 0, zIndex: 50, width: 205, padding: 6, boxShadow: "var(--shadow)" }}>
                <Link className="command-result" href={profileHref(user.role)} onClick={() => setMenuOpen(false)}><Settings2 size={15} /> Profile & preferences</Link>
                <button className="command-result" style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }} onClick={() => void logout()} disabled={logoutBusy}><LogOut size={15} /> {logoutBusy ? "Signing out…" : "Sign out"}</button>
              </div> : null}
            </div>
          </div>
        </header>
        <main className="page-content">
          {logoutError ? <div className="form-error workspace-toast" role="alert"><span>{logoutError}</span><button type="button" className="button button-sm button-ghost" onClick={() => setLogoutError("")}>Dismiss</button></div> : null}
          {children}
        </main>
      </div>

      {mobileOpen ? <button aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} style={{ position: "fixed", zIndex: 34, inset: 0, background: "rgba(15,23,42,.32)", border: 0 }} /> : null}
      <nav className="mobile-bottom-nav" aria-label="Quick navigation">
        {mobileItems.map((item) => { const Icon = item.icon; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <Link key={item.href} className={active ? "active" : ""} href={item.href}><Icon size={17} /><span>{item.label}</span></Link>; })}
      </nav>

      {commandOpen ? <div className="command-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandOpen(false); }}>
        <section className="command-panel" role="dialog" aria-modal="true" aria-label="Search workspace" ref={commandPanelRef} tabIndex={-1}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingRight: 10 }}><input autoFocus style={{ flex: 1, minWidth: 0 }} className="command-input" aria-label="Search a page or task" placeholder="Search a page or task…" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && filteredItems[0]) { router.push(filteredItems[0].href); setCommandOpen(false); setCommandQuery(""); } }} /><button type="button" className="icon-button" aria-label="Close workspace search" onClick={() => setCommandOpen(false)}><X size={16} /></button></div>
          <div className="command-results">{filteredItems.length ? filteredItems.map((item) => { const Icon = item.icon; return <button type="button" key={item.href} className="command-result" style={{ width: "100%", border: 0, background: "transparent", textAlign: "left" }} onClick={() => { router.push(item.href); setCommandOpen(false); setCommandQuery(""); }}><Icon size={16} /><span>{item.label}</span><span style={{ marginLeft: "auto", color: "var(--subtle)", fontSize: 12 }}>{item.href}</span></button>; }) : <div className="empty-state"><h3>No matching pages</h3><p>Try a different keyword.</p></div>}</div>
        </section>
      </div> : null}
    </div>
  );
}

function roleHome(role: WorkspaceRole) {
  if (role === "ORGANIZATION_ADMIN") return "/org/dashboard";
  if (role === "HR_MANAGER") return "/hr/dashboard";
  if (role === "DEPARTMENT_MANAGER") return "/dm/dashboard";
  return "/employee/dashboard";
}
function profileHref(role: WorkspaceRole) {
  if (role === "ORGANIZATION_ADMIN") return "/org/profile";
  if (role === "HR_MANAGER") return "/hr/profile";
  if (role === "DEPARTMENT_MANAGER") return "/dm/profile";
  return "/employee/profile";
}
