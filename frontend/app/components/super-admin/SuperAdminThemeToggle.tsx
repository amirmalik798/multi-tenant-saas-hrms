"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function SuperAdminThemeToggle() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    let current: "dark" | "light" = "dark";
    try {
      const saved = window.localStorage.getItem("hrms-super-admin-theme");
      if (saved === "light" || saved === "dark") current = saved;
    } catch {
      // Theme switching remains available for the current session.
    }
    setTheme(current);
    document.documentElement.dataset.superAdminTheme = current;
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.superAdminTheme = next;
    try {
      window.localStorage.setItem("hrms-super-admin-theme", next);
    } catch {
      // Keep the updated theme for this session.
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "light"}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      className="super-admin-theme-toggle inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#182232]/90 text-slate-200 transition hover:border-[#75c7ff]/30 hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#75c7ff]"
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
