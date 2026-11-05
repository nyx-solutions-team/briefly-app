/** Default demonstration data for the INR invoice template with two 9% tax lines. */
export function buildInvoicePreviewData() {
  const currency = 'INR';
  const items = [
    { description: 'Implementation Sprint', quantity: 1, unit_price: 3200 },
    { description: 'Support Retainer', quantity: 1, unit_price: 800 },
  ].map((item) => ({ ...item, line_total: item.quantity * item.unit_price }));
  const subtotal = items.reduce((sum, item) => sum + item.line_total, 0);
  const cgstRate = 9;
  const sgstRate = 9;
  const cgstAmount = Math.round(subtotal * cgstRate) / 100;
  const sgstAmount = Math.round(subtotal * sgstRate) / 100;
  const discount = 0;
  const totals = {
    currency,
    subtotal,
    cgst_rate: cgstRate,
    sgst_rate: sgstRate,
    cgst_amount: cgstAmount,
    sgst_amount: sgstAmount,
    // Support templates binding either cgst/sgst or cgst_amount/sgst_amount.
    cgst: cgstAmount,
    sgst: sgstAmount,
    tax_rate: cgstRate + sgstRate,
    tax_amount: cgstAmount + sgstAmount,
    discount,
    total_amount: subtotal + cgstAmount + sgstAmount - discount,
  };
  const seller = { name: 'Acme Labs', address: '12 Market Street', email: 'billing@acme.com', phone: '+1 555 100 2000' };
  const buyer = { name: 'Northwind LLC', address: '44 Pine Avenue', email: 'accounts@northwind.com', phone: '+1 555 400 5000' };

  return {
    template_type: 'invoice',
    template_id: 'invoice',
    doc_type: 'invoice',
    invoice_number: 'INV-2026-001',
    date: '2026-02-27',
    due_date: '2026-03-29',
    payment_terms: 'Net 30',
    ...totals,
    seller,
    buyer,
    seller_name: seller.name,
    seller_address: seller.address,
    seller_email: seller.email,
    seller_phone: seller.phone,
    buyer_name: buyer.name,
    buyer_address: buyer.address,
    buyer_email: buyer.email,
    buyer_phone: buyer.phone,
    items,
    totals,
    left_content: 'Billing contact details',
    right_content: 'Shipping and delivery notes',
  };
}
