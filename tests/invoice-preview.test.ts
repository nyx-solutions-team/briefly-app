import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInvoicePreviewData } from '../src/lib/invoice-preview-data.ts';

test('default invoice sample uses INR for the document and totals', () => {
  const sample = buildInvoicePreviewData();
  assert.equal(sample.currency, 'INR');
  assert.equal(sample.totals.currency, sample.currency);
});

test('item amounts, displayed GST lines and grand total reconcile', () => {
  const sample = buildInvoicePreviewData();
  for (const item of sample.items) {
    assert.equal(item.line_total, item.quantity * item.unit_price);
  }
  const subtotal = sample.items.reduce((sum, item) => sum + item.line_total, 0);
  assert.equal(sample.totals.subtotal, subtotal);
  assert.equal(sample.totals.cgst_rate, 9);
  assert.equal(sample.totals.sgst_rate, 9);
  assert.equal(sample.totals.cgst_amount, 360);
  assert.equal(sample.totals.sgst_amount, 360);
  assert.equal(sample.totals.tax_amount, sample.totals.cgst_amount + sample.totals.sgst_amount);
  assert.equal(sample.totals.total_amount, subtotal + sample.totals.tax_amount - sample.totals.discount);
  assert.equal(sample.totals.total_amount, 4720);
});

test('flat and nested template bindings have the same financial values', () => {
  const sample = buildInvoicePreviewData();
  for (const [key, amount] of Object.entries(sample.totals)) {
    assert.equal(sample[key as keyof typeof sample], amount, key);
  }
  assert.equal(sample.cgst, sample.cgst_amount);
  assert.equal(sample.sgst, sample.sgst_amount);
});

test('editing a preview sample does not affect later samples', () => {
  const sample = buildInvoicePreviewData();
  sample.items[0].line_total = 0;
  sample.totals.currency = 'USD';
  const next = buildInvoicePreviewData();
  assert.equal(next.items[0].line_total, 3200);
  assert.equal(next.totals.currency, 'INR');
});
