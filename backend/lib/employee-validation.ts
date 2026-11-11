/**
 * Employee master-data normalization and validation helpers.
 * The employee creation endpoint must enforce the same employee-code policy.
 */
export const EMPLOYEE_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,49}$/;

export const EMPLOYEE_CODE_VALIDATION_MESSAGE =
  "Employee code must start with a letter or number and contain only letters, numbers, hyphens or underscores (maximum 50 characters).";

/** Trim input and collapse repeated whitespace without changing name casing. */
export function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Employee codes are case-insensitive at the application boundary. */
export function normalizeEmployeeCode(value: string): string {
  return normalizeWhitespace(value).toUpperCase();
}

export function isValidEmployeeCode(value: string): boolean {
  return EMPLOYEE_CODE_PATTERN.test(value);
}