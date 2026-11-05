import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeDocumentDate, getDocumentDateError } from '../src/lib/document-date.ts';

test('impossible dates are rejected rather than rolled over or silently omitted', () => {
  for (const date of ['2026-13-45', '2026-02-30', '2026-02-29', '2026-04-31', '2026-00-10', '2026-01-00', '1900-02-29', '0000-01-01', 'not a date']) {
    assert.throws(() => normalizeDocumentDate(date), /real calendar date/, date);
    assert.ok(getDocumentDateError(date), date);
  }
});

test('valid dates and leap years preserve the entered calendar date', () => {
  for (const date of ['2026-01-01', '2026-02-28', '2024-02-29', '2000-02-29', '2026-12-31']) {
    assert.equal(normalizeDocumentDate(date), date);
    assert.equal(getDocumentDateError(date), null);
  }
});

test('optional dates can be cleared and supported legacy date formats still work', () => {
  for (const value of ['', '   ', null, undefined]) assert.equal(normalizeDocumentDate(value), null);
  assert.equal(normalizeDocumentDate(' 2026-02-28 '), '2026-02-28');
  assert.equal(normalizeDocumentDate('28.2.2026'), '2026-02-28');
  assert.equal(normalizeDocumentDate('2/28/2026'), '2026-02-28');
  assert.equal(normalizeDocumentDate('28 February 2026'), '2026-02-28');
  assert.throws(() => normalizeDocumentDate('30.2.2026'), /real calendar date/);
});
