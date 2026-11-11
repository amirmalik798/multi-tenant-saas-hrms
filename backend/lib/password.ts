import bcrypt from "bcryptjs";

/**
 * Shared password policy for new and changed passwords.
 *
 * bcrypt accepts at most 72 UTF-8 bytes. Always reject longer inputs before
 * hashing so two different passwords cannot silently hash to the same prefix.
 * Keep the cost factor consistent with existing account hashes.
 */
export const BCRYPT_COST_FACTOR = 12;
export const MIN_PASSWORD_CHARACTERS = 15;
export const MAX_PASSWORD_UTF8_BYTES = 72;

// Local blocklist of common or widely published weak passwords and phrases.
// This is intentionally a small application-level denylist, not a claim to be
// a complete database of every password exposed in prior breaches.
const COMMON_PASSWORDS = new Set<string>([
  "passwordpassword",
  "password123456789",
  "passw0rdpassw0rd",
  "psswordpssword",
  "qwertyuiop123456",
  "qwertyuiopasdfgh",
  "123456789012345",
  "1234567890123456",
  "0123456789012345",
  "111111111111111",
  "000000000000000",
  "abcdefghijklmno",
  "abcdefghijklmnop",
  "adminadminadmin",
  "welcome123456789",
  "letmeinletmein",
  "changemechangeme",
  "iloveyouiloveyou",
  "monkeymonkeymonkey",
  "correcthorsebatterystaple",
  "trustnoonetrustnoone",
]);

function compactForBlocklist(password: string): string {
  return password
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

/** Returns a human-readable validation error, or null when acceptable. */
export function getNewPasswordValidationError(
  password: unknown,
): string | null {
  if (typeof password !== "string" || password.length === 0) {
    return "Enter a password.";
  }

  const characterCount = Array.from(password).length;

  if (characterCount < MIN_PASSWORD_CHARACTERS) {
    return `Password must contain at least ${MIN_PASSWORD_CHARACTERS} characters.`;
  }

  const byteLength = Buffer.byteLength(password, "utf8");

  if (byteLength > MAX_PASSWORD_UTF8_BYTES) {
    return `Password must not exceed ${MAX_PASSWORD_UTF8_BYTES} UTF-8 bytes because the application uses bcrypt.`;
  }

  if (password.trim().length === 0) {
    return "Password cannot consist only of whitespace.";
  }

  const compactPassword = compactForBlocklist(password);

  if (
    COMMON_PASSWORDS.has(compactPassword) ||
    /^(.)\1{14,}$/u.test(compactPassword) ||
    /^(?:0123456789|1234567890|abcdefghijklmnopqrstuvwxyz|qwertyuiopasdfghjklzxcvbnm)+$/u.test(
      compactPassword,
    )
  ) {
    return "Choose a less common password that is harder to guess.";
  }

  return null;
}

/** Hash a new password after enforcing the shared policy. */
export async function hashNewPassword(password: string): Promise<string> {
  const validationError = getNewPasswordValidationError(password);

  if (validationError) {
    throw new Error(validationError);
  }

  return bcrypt.hash(password, BCRYPT_COST_FACTOR);
}

/**
 * Verify a stored bcrypt hash. Overlong inputs are rejected before comparison
 * to avoid bcrypt's 72-byte truncation behavior. Do not apply the new-password
 * minimum length here; legacy accounts may have older password policies.
 */
export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (
    typeof password !== "string" ||
    typeof passwordHash !== "string" ||
    password.length === 0 ||
    Buffer.byteLength(password, "utf8") > MAX_PASSWORD_UTF8_BYTES
  ) {
    return false;
  }

  try {
    return await bcrypt.compare(password, passwordHash);
  } catch {
    return false;
  }
}