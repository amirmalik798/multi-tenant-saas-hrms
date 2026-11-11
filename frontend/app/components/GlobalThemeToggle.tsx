"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";

type Theme = "dark" | "light";

export default function GlobalThemeToggle() {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("dark");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let initial: Theme = "dark";
    try {
      const saved = window.localStorage.getItem("hrms-global-theme");
      if (saved === "light" || saved === "dark") initial = saved;
    } catch {
      // The theme preference is optional.
    }
    setTheme(initial);
    document.documentElement.dataset.hrmsTheme = initial;
    setReady(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.hrmsTheme = next;
    try {
      window.localStorage.setItem("hrms-global-theme", next);
    } catch {
      // Keep the selected theme for the current session.
    }
  }

  if (pathname.startsWith("/employee") || pathname.startsWith("/org")) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!ready}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="hrms-global-theme-toggle fixed bottom-5 right-5 z-[120] inline-flex h-11 items-center gap-2 rounded-full border border-slate-600/70 bg-slate-900 px-4 text-sm font-semibold text-slate-100 shadow-xl shadow-black/20 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:opacity-60"
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
      <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
