/**
 * Cryptographic & Validation helpers for CalcChat Account Authentication & Identity Secrets
 * 
 * Rules:
 * - Password & Identity Secrets must contain ONLY: 0-9, +, -, %, *
 * - Length: 4 to 10 characters
 * - Account Code: e.g. CX742981 (2 uppercase letters + 6 uppercase numbers/alphanumeric characters)
 *   Avoids confusing characters (0, 1, I, L, O)
 * - Recovery Key: e.g. REC-7X42-98B1-K72D
 */

export const ALLOWED_SECRET_CHARS_REGEX = /^[0-9+\-%*]+$/;
export const ACCOUNT_CODE_REGEX = /^[a-zA-Z0-9_-]+$/;

// Unambiguous character pools (strictly excluding O, 0, I, 1, L)
const UNAMBIGUOUS_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // 23 letters
const UNAMBIGUOUS_DIGITS = '23456789'; // 8 digits
const UNAMBIGUOUS_ALPHANUMERIC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // 31 characters

/**
 * Validates password or identity unlock secret according to exact rules:
 * - Allowed: 0-9, +, -, %, *
 * - Length: 4 to 10 characters
 */
export function validatePasswordOrSecret(val: string, fieldName = 'Password'): string | null {
  if (!val) {
    return `${fieldName} is required.`;
  }
  if (val.length < 4 || val.length > 10) {
    return `${fieldName} must be between 4 and 10 characters.`;
  }
  if (!ALLOWED_SECRET_CHARS_REGEX.test(val)) {
    return `${fieldName} must contain only numbers (0-9) and math symbols (+, -, %, *).`;
  }
  return null;
}

/**
 * Validates an Account Code format
 */
export function validateAccountCode(code: string): string | null {
  if (!code || code.trim().length === 0) {
    return 'Account Code is required.';
  }
  const trimmed = code.trim();
  if (trimmed.length < 3 || trimmed.length > 20) {
    return 'Account Code must be between 3 and 20 characters.';
  }
  if (!ACCOUNT_CODE_REGEX.test(trimmed)) {
    return 'Account Code can only contain letters, numbers, hyphens (-), and underscores (_).';
  }
  return null;
}

/**
 * Generates an easy-to-type, unambiguous Account Code in the format:
 * Two uppercase letters + 6 uppercase digits/alphanumeric characters (e.g. CX742981, KP583192, MR716428).
 * Total length = 8 characters. Excludes ambiguous characters (O, 0, I, 1, L).
 */
export function generateRandomAccountCode(): string {
  // First 2 characters: uppercase letters (e.g. CX, KP, MR)
  const l1 = UNAMBIGUOUS_LETTERS.charAt(Math.floor(Math.random() * UNAMBIGUOUS_LETTERS.length));
  const l2 = UNAMBIGUOUS_LETTERS.charAt(Math.floor(Math.random() * UNAMBIGUOUS_LETTERS.length));

  // Next 6 characters: numbers & uppercase alphanumeric
  let digits = '';
  for (let i = 0; i < 6; i++) {
    digits += UNAMBIGUOUS_ALPHANUMERIC.charAt(
      Math.floor(Math.random() * UNAMBIGUOUS_ALPHANUMERIC.length)
    );
  }

  return `${l1}${l2}${digits}`;
}

/**
 * Generates a high-entropy Master Account Recovery Key:
 * Format: REC-XXXX-XXXX-XXXX
 */
export function generateRecoveryKey(): string {
  const segment = (len: number) => {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += UNAMBIGUOUS_ALPHANUMERIC.charAt(
        Math.floor(Math.random() * UNAMBIGUOUS_ALPHANUMERIC.length)
      );
    }
    return s;
  };
  return `REC-${segment(4)}-${segment(4)}-${segment(4)}`;
}

/**
 * Validates a recovery key format
 */
export function validateRecoveryKey(key: string): boolean {
  if (!key) return false;
  const clean = key.trim().toUpperCase();
  return clean.length >= 10;
}

/**
 * Generates a cryptographically secure random salt hex string
 */
export function generateSalt(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Salted SHA-256 Hash using standard Web Crypto API
 */
export async function hashSecret(secret: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`calcchat_vault_v2_${salt.trim()}_${secret.trim()}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify secret against salted SHA-256 hash
 */
export async function verifySecret(
  secret: string,
  salt: string,
  expectedHash: string
): Promise<boolean> {
  if (!secret || !expectedHash) return false;
  const computedHash = await hashSecret(secret, salt);
  return computedHash === expectedHash;
}

/**
 * Aliases for backwards compatibility in components
 */
export const validatePin = validatePasswordOrSecret;
export const hashPin = hashSecret;
export const verifyPin = verifySecret;
export const hashPassword = hashSecret;
export const verifyPassword = verifySecret;

