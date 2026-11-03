/**
 * Minimal money formatting and parsing for the UI.
 *
 * `Intl` formats but will not parse, and a Turkish user types "347,65" while a
 * British one types "347.65". Both have to work.
 */

/** Currencies whose minor unit is not 1/100. */
const EXPONENTS = { JPY: 0, KRW: 0, ISK: 0, KWD: 3, BHD: 3, OMR: 3, TND: 3 };

/** @param {string} currency @returns {number} */
export function exponentOf(currency) {
  return EXPONENTS[String(currency).toUpperCase()] ?? 2;
}

/**
 * @param {number} minor
 * @param {string} currency
 * @param {string} [locale]
 * @returns {string}
 */
export function formatMinor(minor, currency, locale = undefined) {
  const exponent = exponentOf(currency);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minor / 10 ** exponent);
}

/**
 * Parse a typed amount into minor units. Returns null when the string is not
 * something we can read confidently - a wrong number is worse than a rejected
 * one when it is someone's share of a bill.
 *
 * @param {string} input
 * @param {string} currency
 * @returns {number|null}
 *
 * @example parseAmount('347,65', 'TRY')  // 34765
 * @example parseAmount('1.250,50', 'TRY') // 125050
 * @example parseAmount('1,250.50', 'USD') // 125050
 */
export function parseAmount(input, currency) {
  if (typeof input !== 'string') return null;
  const text = input.trim().replace(/[^\d.,-]/g, '');
  if (!/^-?[\d.,]+$/.test(text)) return null;

  const negative = text.startsWith('-');
  const digits = negative ? text.slice(1) : text;
  const separators = digits.match(/[.,]/g) ?? [];
  const lastIndex = Math.max(digits.lastIndexOf('.'), digits.lastIndexOf(','));
  const strip = (s) => s.replace(/[.,]/g, '');

  let whole = strip(digits);
  let fraction = '';

  if (separators.length) {
    const tail = digits.slice(lastIndex + 1);
    const mixed = new Set(separators).size > 1;
    const once = separators.length === 1;
    // One or two trailing digits is a decimal; three is a thousands group,
    // unless the two separator characters differ, which settles it.
    if (tail.length >= 1 && tail.length <= 3 && (mixed || (once && tail.length <= 2))) {
      whole = strip(digits.slice(0, lastIndex));
      fraction = tail;
    } else if (tail.length > 3) {
      return null;
    }
  }

  if (!whole && !fraction) return null;

  const exponent = exponentOf(currency);
  const padded = (fraction + '0'.repeat(exponent)).slice(0, exponent);
  const minor = Number(whole || '0') * 10 ** exponent + Number(padded || '0');
  if (!Number.isSafeInteger(minor)) return null;

  const extra = fraction.slice(exponent);
  const bump = extra && Number(extra[0]) >= 5 ? 1 : 0;
  return (negative ? -1 : 1) * (minor + bump);
}
