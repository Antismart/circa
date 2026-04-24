/**
 * GS1 GTIN-14 validation and check-digit helpers.
 *
 * GTIN-14 is the identifier format the GS1 Digital Link resolver URL uses:
 *   https://id.example.com/01/{14-digit-GTIN}/21/{serial}
 *
 * The 14th digit is a Mod-10 check computed over the first 13 digits with
 * alternating weights 3,1,3,1... starting from the rightmost data digit.
 */

const GTIN14_DIGITS = 14;

function onlyDigits(s: string): boolean {
  return /^[0-9]+$/.test(s);
}

export function gtinCheckDigit(first13: string): string {
  if (first13.length !== 13 || !onlyDigits(first13)) {
    throw new Error("gtinCheckDigit requires a 13-digit numeric string");
  }
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = first13.charCodeAt(i) - 48;
    const positionFromRight = 13 - i; // position 13 = rightmost data digit
    const weight = positionFromRight % 2 === 1 ? 3 : 1;
    sum += digit * weight;
  }
  const check = (10 - (sum % 10)) % 10;
  return String(check);
}

export function isValidGtin14(s: unknown): boolean {
  if (typeof s !== "string") return false;
  if (s.length !== GTIN14_DIGITS || !onlyDigits(s)) return false;
  const first13 = s.slice(0, 13);
  const expected = gtinCheckDigit(first13);
  return expected === s[13];
}

/**
 * Accepts a potentially messy GTIN string (whitespace, GTIN-8/12/13) and
 * returns a valid 14-digit form if possible, else null. Short GTINs are
 * left-padded with zeros to 14.
 */
export function normalizeGtin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.replace(/\s+/g, "");
  if (!onlyDigits(trimmed)) return null;
  if (trimmed.length > GTIN14_DIGITS) return null;
  const padded = trimmed.padStart(GTIN14_DIGITS, "0");
  return isValidGtin14(padded) ? padded : null;
}

/**
 * Assemble a valid GTIN-14 from a 13-digit prefix by computing the check
 * digit. Useful for seed/test data.
 */
export function makeGtin14(first13: string): string {
  return first13 + gtinCheckDigit(first13);
}
