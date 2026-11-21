"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { initials } from "@/lib/format";

type ProfilePhotoProps = {
  name: string;
  employeeId?: string | null;
  currentUser?: boolean;
  organizationAdmin?: boolean;
  className?: string;
  refreshKey?: number;
  conversationId?: string | null;
  style?: CSSProperties;
};

/** Shared, permission-scoped profile image used across workforce workspaces. */
export function ProfilePhoto({
  name,
  employeeId,
  currentUser = false,
  organizationAdmin = false,
  className = "user-avatar",
  refreshKey = 0,
  conversationId,
  style,
}: ProfilePhotoProps) {
  const [failed, setFailed] = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [eventVersion, setEventVersion] = useState(0);
  const imagePaths = useMemo(() => {
    if (organizationAdmin) return ["/api/backend/org/profile/photo"];
    const employeePhoto = employeeId
      ? `/api/backend/employees/${encodeURIComponent(employeeId)}/photo${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`
      : null;
    // Prefer the authenticated self endpoint for the current account, then
    // try the tenant-scoped employee endpoint if this profile is linked.
    if (currentUser) {
      return ["/api/backend/employees/me/photo", ...(employeePhoto ? [employeePhoto] : [])];
    }
    return employeePhoto ? [employeePhoto] : [];
  }, [organizationAdmin, currentUser, employeeId, conversationId]);
  const imageUrl = imagePaths[fallbackIndex]
    ? `${imagePaths[fallbackIndex]}${imagePaths[fallbackIndex].includes("?") ? "&" : "?"}v=${refreshKey + eventVersion}`
    : null;

  useEffect(() => {
    setFailed(false);
    setFallbackIndex(0);
  }, [imagePaths.join("|"), refreshKey]);

  useEffect(() => {
    const refresh = () => {
      setFailed(false);
      setFallbackIndex(0);
      setEventVersion((version) => version + 1);
    };
    window.addEventListener("hrms:profile-photo-updated", refresh);
    return () => window.removeEventListener("hrms:profile-photo-updated", refresh);
  }, []);

  return (
    <span className={`${className === "user-avatar" ? "user-avatar" : ""} profile-photo ${className === "user-avatar" ? "" : className || ""}`.trim()} style={style} aria-label={`${name || "Workforce member"} profile photo`} title={name || "Workforce member"}>
      {imageUrl && !failed ? (
        <img
          className="profile-photo-image"
          src={imageUrl}
          alt={`${name || "Workforce member"} profile`}
          onError={() => {
            if (fallbackIndex + 1 < imagePaths.length) setFallbackIndex((index) => index + 1);
            else setFailed(true);
          }}
        />
      ) : initials(name || "Workforce member")}
    </span>
  );
}
