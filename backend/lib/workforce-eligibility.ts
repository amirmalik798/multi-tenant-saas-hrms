/** Shared role normalization for workforce targets managed by HR workflows. */
export function normalizeWorkforceRole(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "")
    : "";
}

export function isExcludedHrTargetRole(
  value: unknown,
  options: { allowHrManager?: boolean } = {},
): boolean {
  const role = normalizeWorkforceRole(value);
  const isHrManager = role === "HR_MANAGER" || role === "HRMANAGER" ||
    role.startsWith("HR_MANAGER_") || role.startsWith("HRMANAGER_");
  if (isHrManager && options.allowHrManager) return false;

  return role === "ORG_ADMIN" || role === "ORGANIZATION_ADMIN" ||
    role === "ORGANIZATIONADMIN" || role === "ORGANIZATION_ADMINISTRATOR" || role === "ORGANIZATION_OWNER" || role === "ORG_OWNER" || role === "TENANT_ADMIN" || role === "ADMINISTRATOR" ||
    isHrManager ||
    role.startsWith("ORG_ADMIN_") || role.startsWith("ORGANIZATION_ADMIN_") ||
    role.startsWith("ORGANIZATIONADMIN_") || role.startsWith("ORGANIZATION_OWNER_") ||
    role.startsWith("ORG_OWNER_") || role.startsWith("TENANT_ADMIN_");
}
