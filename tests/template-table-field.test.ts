import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableColumnTemplate } from '../src/lib/template-table-field.ts';
import { applyPreviewFilters } from '../src/lib/template-preview-filters.ts';

const filters = ['default(item.amount)', 'money(currency)'];

test('filtered amount fields become row-scoped expressions for all three templates', () => {
  for (const collection of ['items', 'order.items', 'quote.items']) {
    for (const path of ['line_total', 'item.line_total', `${collection}.line_total`, `${collection}[].line_total`]) {
      assert.equal(
        getTableColumnTemplate(`${path} | ${filters.join(' | ')}`, collection),
        '{{ item.line_total | default(item.amount) | money(currency) }}',
      );
    }
  }
});

test('simple fields, existing Jinja and literal text retain their behavior', () => {
  assert.equal(getTableColumnTemplate('description', 'items'), '{{ item.description }}');
  assert.equal(getTableColumnTemplate('loop.index', 'items'), '{{ loop.index }}');
  assert.equal(getTableColumnTemplate('{{ item.line_total | money(currency) }}', 'items'), '{{ item.line_total | money(currency) }}');
  assert.equal(getTableColumnTemplate('Not applicable', 'items'), 'Not applicable');
});

test('browser fallback resolves missing item amount and formats the document currency', () => {
  const resolve = (path: string) => ({ 'item.amount': 3200, currency: 'INR' })[path];
  assert.equal(applyPreviewFilters(800, filters, resolve), '₹800');
  assert.equal(applyPreviewFilters(undefined, filters, resolve), '₹3,200');
  assert.equal(applyPreviewFilters(null, filters, resolve), '₹3,200');
  assert.equal(applyPreviewFilters(0, filters, resolve), '₹0');
  assert.equal(applyPreviewFilters(12.5, ['money("USD")'], resolve), 'USD 12.50');
  assert.equal(applyPreviewFilters(undefined, ['default(0)', 'money(currency)'], resolve), '₹0');
});

test('unavailable values never display the fallback formula or NaN', () => {
  assert.equal(applyPreviewFilters(undefined, filters, () => undefined), '');
  assert.equal(applyPreviewFilters('Not available', ['money(currency)'], () => 'INR'), 'Not available');
  assert.equal(applyPreviewFilters(undefined, ['default("No amount")'], () => undefined), 'No amount');
  assert.equal(applyPreviewFilters(['Line one', 'Line two'], ['join("\\n")'], () => undefined), 'Line one\nLine two');
});
