import { InvoiceDetailDto } from './billing.types';
import { round2 } from '../../utils/formatters';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(value: number): string {
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function renderInvoiceHtml(invoice: InvoiceDetailDto): string {
  const company = invoice.company;
  const companyName = escapeHtml(company?.companyName ?? 'Signet Workforce Services Pvt Ltd');
  const companyAddress = escapeHtml(
    company
      ? [company.address, [company.city, company.state, company.pinCode].filter(Boolean).join(', ')].filter(Boolean).join('\n')
      : '123 Business Park, Andheri East, Mumbai 400093',
  );
  const companyGst = escapeHtml(company?.gstNumber ?? '27AABCS1429B1Z5');
  const companyPan = company?.panNumber ? escapeHtml(company.panNumber) : '';
  const clientAddress = escapeHtml(invoice.billingAddress ?? '');
  const clientGst = escapeHtml(invoice.clientGstNumber ?? '—');
  const terms = escapeHtml(invoice.termsAndConditions ?? '');
  const notes = escapeHtml(invoice.notes ?? '');

  const rows = invoice.lineItems
    .map(
      (item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="num">${escapeHtml(item.hsnSacCode ?? '998519')}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${formatMoney(item.unitRate)}</td>
        <td class="num">${formatMoney(item.amount)}</td>
      </tr>`,
    )
    .join('');

  const amountInWords = escapeHtml(`${formatMoney(invoice.totalAmount)} only`);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Inter, Arial, sans-serif; color: #1a2332; margin: 0; padding: 24px; background: #fff; }
    .invoice { max-width: 900px; margin: 0 auto; border: 1px solid #dbe2ea; border-radius: 12px; overflow: hidden; }
    .header { display: flex; justify-content: space-between; gap: 24px; padding: 28px 32px; background: linear-gradient(135deg, #0f1c35 0%, #1565c0 100%); color: #fff; }
    .header h1 { margin: 0 0 8px; font-size: 22px; }
    .header p { margin: 2px 0; font-size: 12px; opacity: 0.92; }
    .tax-title { text-align: right; }
    .tax-title h2 { margin: 0; font-size: 28px; letter-spacing: 1px; }
    .meta { padding: 20px 32px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; background: #f8fafc; border-bottom: 1px solid #e0e4ea; }
    .meta-block span { display: block; font-size: 10px; text-transform: uppercase; color: #8b96a9; letter-spacing: 0.5px; }
    .meta-block strong { font-size: 14px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 24px 32px; }
    .party h3 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #1565c0; letter-spacing: 0.6px; }
    .party pre { margin: 0; white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.5; }
    table.items { width: calc(100% - 64px); margin: 0 32px 24px; border-collapse: collapse; }
    table.items th { background: #1565c0; color: #fff; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; padding: 10px 12px; text-align: left; }
    table.items td { padding: 10px 12px; border-bottom: 1px solid #eef2f6; font-size: 13px; vertical-align: top; }
    table.items td.num { text-align: right; white-space: nowrap; }
    .totals { margin: 0 32px 24px; display: flex; justify-content: flex-end; }
    .totals-box { width: 320px; border: 1px solid #dbe2ea; border-radius: 8px; overflow: hidden; }
    .totals-row { display: flex; justify-content: space-between; padding: 10px 16px; font-size: 13px; border-bottom: 1px solid #eef2f6; }
    .totals-row.grand { background: #1565c0; color: #fff; font-size: 16px; font-weight: 700; border-bottom: none; }
    .footer { padding: 16px 32px 28px; border-top: 1px solid #e0e4ea; font-size: 11px; color: #5a6478; }
    .amount-words { padding: 0 32px 16px; font-size: 13px; }
    @media print { body { padding: 0; } .invoice { border: none; border-radius: 0; } }
  </style>
</head>
<body>
  <div class="invoice">
    <div class="header">
      <div>
        <h1>${companyName}</h1>
        <p>${companyAddress.replace(/\n/g, '<br/>')}</p>
        <p>GSTIN: ${companyGst}${companyPan ? ` · PAN: ${companyPan}` : ''}</p>
      </div>
      <div class="tax-title">
        <h2>TAX INVOICE</h2>
        <p><strong>${escapeHtml(invoice.invoiceNumber)}</strong></p>
      </div>
    </div>

    <div class="meta">
      <div class="meta-block"><span>Invoice Date</span><strong>${escapeHtml(invoice.invoiceDate)}</strong></div>
      <div class="meta-block"><span>Due Date</span><strong>${escapeHtml(invoice.dueDate)}</strong></div>
      <div class="meta-block"><span>Billing Period</span><strong>${invoice.month}/${invoice.year}</strong></div>
      <div class="meta-block"><span>Site</span><strong>${escapeHtml(invoice.siteName ?? '—')}</strong></div>
      <div class="meta-block"><span>Place of Supply</span><strong>${escapeHtml(invoice.clientState ?? '—')}</strong></div>
      <div class="meta-block"><span>Status</span><strong>${invoice.status}</strong></div>
    </div>

    <div class="parties">
      <div class="party">
        <h3>Bill To</h3>
        <strong>${escapeHtml(invoice.clientName)}</strong>
        <pre>${clientAddress}</pre>
        <p>GSTIN: ${clientGst}</p>
      </div>
      <div class="party">
        <h3>Service Details</h3>
        <p>Site Code: ${escapeHtml(invoice.siteCode ?? '—')}</p>
        <p>Taxable Value: ${formatMoney(invoice.subTotal)}</p>
        <p>GST @ ${invoice.gstRate}%: ${formatMoney(invoice.gstAmount)}</p>
        <p>Balance Due: ${formatMoney(invoice.balanceAmount)}</p>
      </div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th>#</th>
          <th>Description of Services</th>
          <th>HSN/SAC</th>
          <th>Qty</th>
          <th>Rate</th>
          <th>Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="amount-words"><strong>Amount in words:</strong> ${amountInWords}</div>

    <div class="totals">
      <div class="totals-box">
        <div class="totals-row"><span>Subtotal</span><span>${formatMoney(invoice.subTotal)}</span></div>
        <div class="totals-row"><span>CGST (${round2(invoice.gstRate / 2)}%)</span><span>${formatMoney(invoice.gstAmount / 2)}</span></div>
        <div class="totals-row"><span>SGST (${round2(invoice.gstRate / 2)}%)</span><span>${formatMoney(invoice.gstAmount / 2)}</span></div>
        <div class="totals-row"><span>Total GST</span><span>${formatMoney(invoice.gstAmount)}</span></div>
        <div class="totals-row grand"><span>Grand Total</span><span>${formatMoney(invoice.totalAmount)}</span></div>
      </div>
    </div>

    ${notes ? `<div class="footer"><strong>Notes:</strong> ${notes}</div>` : ''}
    ${terms ? `<div class="footer"><strong>Terms:</strong> ${terms}</div>` : ''}
    <div class="footer">This is a computer-generated tax invoice. For payment queries contact ${escapeHtml(company?.email ?? 'billing@signetworkforce.com')}.</div>
  </div>
</body>
</html>`;
}
