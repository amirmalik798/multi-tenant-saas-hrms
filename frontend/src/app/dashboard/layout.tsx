"use client";

import { useEffect, type ReactNode } from "react";

export default function SuperAdminLayout({ children }: { children: ReactNode }) {
  useEffect(() => {
    let saved: "dark" | "light" = "dark";
    try {
      const value = window.localStorage.getItem("hrms-super-admin-theme");
      if (value === "light" || value === "dark") saved = value;
    } catch {
      // Default to Dark Mode when storage is unavailable.
    }
    document.documentElement.dataset.superAdminTheme = saved;
    return () => {
      delete document.documentElement.dataset.superAdminTheme;
    };
  }, []);

  return <div className="super-admin-theme-root min-h-screen">{children}</div>;
}
