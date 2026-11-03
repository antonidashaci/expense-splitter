import assert from 'node:assert/strict';
import { test } from 'node:test';

import { exponentOf, formatMinor, parseAmount } from './money.js';

test('parses the way a Turkish user types', () => {
  assert.equal(parseAmount('347,65', 'TRY'), 34765);
  assert.equal(parseAmount('1.250,50', 'TRY'), 125050);
  assert.equal(parseAmount('1.250', 'TRY'), 125000);
  assert.equal(parseAmount('347', 'TRY'), 34700);
});

test('parses the way a British user types', () => {
  assert.equal(parseAmount('347.65', 'GBP'), 34765);
  assert.equal(parseAmount('1,250.50', 'GBP'), 125050);
  assert.equal(parseAmount('1,250', 'GBP'), 125000);
});

test('ignores currency symbols and spaces', () => {
  assert.equal(parseAmount(' ₺347,65 ', 'TRY'), 34765);
  assert.equal(parseAmount('$1,250.50', 'USD'), 125050);
});

test('rounds past the currency precision', () => {
  assert.equal(parseAmount('1.234,567', 'TRY'), 123457);
  assert.equal(parseAmount('1.234,564', 'TRY'), 123456);
});

test('currencies without a minor unit', () => {
  assert.equal(exponentOf('JPY'), 0);
  assert.equal(parseAmount('1250', 'JPY'), 1250);
  assert.equal(parseAmount('1250,5', 'JPY'), 1251);
});

test('returns null rather than a wrong number', () => {
  assert.equal(parseAmount('', 'TRY'), null);
  assert.equal(parseAmount('abc', 'TRY'), null);
  assert.equal(parseAmount('1.2500', 'TRY'), null);
  assert.equal(parseAmount(null, 'TRY'), null);
  assert.equal(parseAmount(12.5, 'TRY'), null);
});

test('negative amounts, for a refund', () => {
  assert.equal(parseAmount('-20,00', 'TRY'), -2000);
});

test('format round-trips what parse reads', () => {
  for (const [currency, locale] of [['TRY', 'tr-TR'], ['USD', 'en-US'], ['EUR', 'de-DE']]) {
    const text = formatMinor(34765, currency, locale);
    assert.equal(parseAmount(text, currency), 34765, `${currency} ${text}`);
  }
});
