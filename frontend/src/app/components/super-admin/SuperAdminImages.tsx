"use client";

type SharedImageProps = {
  organizationId: string;
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const sizeClasses = {
  sm: "h-8 w-8 rounded-lg text-[10px]",
  md: "h-10 w-10 rounded-xl text-xs",
  lg: "h-14 w-14 rounded-xl text-lg",
} as const;

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "—";
}

export function SuperAdminOrganizationLogo({
  organizationId,
  name,
  size = "md",
  className = "",
}: SharedImageProps) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-[#75c7ff]/20 bg-gradient-to-br from-[#1b344d] to-[#142033] font-bold tracking-wide text-[#bfe5ff] shadow-sm ${sizeClasses[size]} ${className}`}
      aria-label={`${name} logo`}
    >
      <span aria-hidden="true">{initials(name)}</span>
      <img
        src={`/api/backend/organizations/${encodeURIComponent(organizationId)}/logo`}
        alt={`${name} logo`}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full bg-[#111a28] object-contain p-1"
        onError={(event) => { event.currentTarget.style.display = "none"; }}
      />
    </span>
  );
}

export function SuperAdminUserAvatar({
  organizationId,
  userId,
  name,
  size = "md",
  className = "",
}: SharedImageProps & { userId: string }) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden border border-[#37506a] bg-[#17304a] font-bold text-[#b9e2ff] shadow-sm ${sizeClasses[size]} ${className}`}
      aria-label={`${name} profile image`}
    >
      <span aria-hidden="true">{initials(name)}</span>
      <img
        src={`/api/backend/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(userId)}/photo`}
        alt={`${name} profile`}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full bg-[#111a28] object-cover"
        onError={(event) => { event.currentTarget.style.display = "none"; }}
      />
    </span>
  );
}
