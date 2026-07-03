import { InvoicePrintDto } from './billing.types';
import { amountInWords } from '../../utils/amount-in-words';
import { round2 } from '../../utils/formatters';
import { formatBillingPeriodShort } from './billing-engine.invoice-lines';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatAmount(value: number): string {
  return Math.round(value).toLocaleString('en-IN');
}

function formatTaxAmount(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatInvoiceDate(dateStr: string): string {
  const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const monthIdx = Number(m[2]) - 1;
    const month = months[monthIdx] ?? m[2];
    return `${m[3]} ${month} ${m[1]}`;
  }
  return dateStr;
}

function brandInitials(name: string): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'IN';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

function companyHeader(company: InvoicePrintDto['company'], invoice: InvoicePrintDto): string {
  const name = escapeHtml(company?.legalName || company?.companyName || 'SIGNET CORPORATE SERVICES');
  const address = escapeHtml(
    [company?.address, [company?.city, company?.state, company?.pinCode].filter(Boolean).join(', ')]
      .filter(Boolean)
      .join(', '),
  );
  const contactBits = [company?.email, company?.phone].filter(Boolean).map(String).map(escapeHtml);
  const contactLine = contactBits.length ? `<p class="inv-head__contact">${contactBits.join('&nbsp;&nbsp;·&nbsp;&nbsp;')}</p>` : '';

  return `
    <header class="inv-head">
      <div class="inv-head__brand">
        <div class="inv-head__logo">${escapeHtml(brandInitials(name))}</div>
        <div class="inv-head__id">
          <h1>${name}</h1>
          <p class="inv-head__addr">${address}</p>
          ${contactLine}
        </div>
      </div>
      <div class="inv-head__doc">
        <span class="inv-head__doc-label">Tax Invoice</span>
        <span class="inv-head__doc-no">${escapeHtml(invoice.invoiceNumber)}</span>
        <span class="inv-head__doc-date">${formatInvoiceDate(invoice.invoiceDate)}</span>
        <span class="inv-head__doc-type">Original for Recipient</span>
      </div>
    </header>`;
}

function taxIdsHtml(company: InvoicePrintDto['company']): string {
  const gst = company?.gstNumber ? escapeHtml(company.gstNumber) : '—';
  const pan = company?.panNumber ? escapeHtml(company.panNumber) : '—';
  const pf = company?.pfEstablishmentCode ? escapeHtml(company.pfEstablishmentCode) : '—';
  const esic = company?.esicCode ? escapeHtml(company.esicCode) : '—';

  return `
    <div class="inv-ids">
      <div class="inv-ids__item"><span>GSTIN</span><strong>${gst}</strong></div>
      <div class="inv-ids__item"><span>PAN</span><strong>${pan}</strong></div>
      <div class="inv-ids__item"><span>PF Code</span><strong>${pf}</strong></div>
      <div class="inv-ids__item"><span>ESI Code</span><strong>${esic}</strong></div>
    </div>`;
}

function taxTotalsHtml(invoice: InvoicePrintDto): string {
  const cgstRate = invoice.cgstRate || round2(invoice.gstRate / 2);
  const sgstRate = invoice.sgstRate || round2(invoice.gstRate / 2);
  const cgstAmount = invoice.cgstAmount || 0;
  const sgstAmount = invoice.sgstAmount || 0;
  const igstAmount = invoice.igstAmount || 0;

  return `
    <div class="inv-totals__row"><span>Taxable Value</span><span>₹ ${formatAmount(invoice.taxableValue)}</span></div>
    <div class="inv-totals__row"><span>CGST <em>(${cgstRate}%)</em></span><span>₹ ${formatTaxAmount(cgstAmount)}</span></div>
    <div class="inv-totals__row"><span>SGST <em>(${sgstRate}%)</em></span><span>₹ ${formatTaxAmount(sgstAmount)}</span></div>
    <div class="inv-totals__row"><span>IGST <em>(${invoice.igstRate || invoice.gstRate}%)</em></span><span>₹ ${formatTaxAmount(igstAmount)}</span></div>
    <div class="inv-totals__grand"><span>Total Invoice Value</span><span>₹ ${formatAmount(invoice.totalAmount)}</span></div>`;
}

function bankDetailsHtml(company: InvoicePrintDto['company']): string {
  if (!company?.bankName && !company?.bankAccountNumber) {
    return '<div class="inv-bank inv-bank--empty"></div>';
  }
  return `
    <div class="inv-bank">
      <h4>Bank Details</h4>
      ${company.bankName ? `<div class="inv-bank__row"><span>Bank</span><strong>${escapeHtml(company.bankName)}</strong></div>` : ''}
      ${company.bankAccountNumber ? `<div class="inv-bank__row"><span>A/C No.</span><strong>${escapeHtml(company.bankAccountNumber)}</strong></div>` : ''}
      ${company.bankIfsc ? `<div class="inv-bank__row"><span>IFSC</span><strong>${escapeHtml(company.bankIfsc)}</strong></div>` : ''}
      ${company.bankBranch ? `<div class="inv-bank__row"><span>Branch</span><strong>${escapeHtml(company.bankBranch)}</strong></div>` : ''}
    </div>`;
}

export function renderInvoiceHtml(invoice: InvoicePrintDto): string {
  const company = invoice.company;
  const clientAddress = escapeHtml(
    invoice.clientAddress ?? [invoice.clientCity, invoice.clientState].filter(Boolean).join(', '),
  );
  const clientGst = escapeHtml(invoice.clientGstNumber ?? '—');
  const clientState = escapeHtml(invoice.clientState ?? invoice.placeOfSupply ?? '—');
  const periodLabel = formatBillingPeriodShort(invoice.month, invoice.year);
  const natureOfService = escapeHtml(invoice.natureOfService || 'Manpower Supply Services');
  const placeOfSupply = escapeHtml(invoice.placeOfSupply ?? invoice.clientState ?? '—');
  const companyName = escapeHtml(company?.companyName || company?.legalName || 'SIGNET CORPORATE SERVICES');

  const rows = invoice.lineItems
    .map(
      (item, index) => `
      <tr>
        <td class="center muted">${index + 1}</td>
        <td>${escapeHtml(item.description)}</td>
        <td class="center">${escapeHtml(item.hsnSacCode ?? invoice.sacCode)}</td>
        <td class="num muted">—</td>
        <td class="num strong">₹ ${formatAmount(item.amount)}</td>
      </tr>`,
    )
    .join('');

  const cgstWords = invoice.cgstAmount > 0 ? amountInWords(invoice.cgstAmount) : '';
  const sgstWords = invoice.sgstAmount > 0 ? amountInWords(invoice.sgstAmount) : '';
  const igstWords = invoice.igstAmount > 0 ? amountInWords(invoice.igstAmount) : '';
  const totalWords = amountInWords(invoice.totalAmount);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(invoice.invoiceNumber)} — Tax Invoice</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <style>
    @page { size: A4; margin: 0; }
    :root {
      --ink: #0f172a;
      --ink-soft: #475569;
      --ink-faint: #94a3b8;
      --line: #e7ebf1;
      --line-strong: #d3dae5;
      --brand: #0f2a52;
      --brand-2: #1d4ed8;
      --accent: #c79a3a;
      --bg-soft: #f6f8fc;
      --bg-zebra: #fafbfe;
    }
    body {
      margin: 0;
      padding: 0;
      background: #eef1f6;
      color: var(--ink);
      font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .inv-sheet, .inv-sheet * { box-sizing: border-box; }
    .inv-sheet {
      position: relative;
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      background: #fff;
      padding: 16mm 14mm 14mm;
      font-size: 11px;
      line-height: 1.5;
      overflow: hidden;
    }
    .inv-sheet::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      background: linear-gradient(90deg, var(--brand) 0%, var(--brand-2) 60%, var(--accent) 100%);
    }

    /* Header */
    .inv-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--line);
    }
    .inv-head__brand { display: flex; align-items: center; gap: 14px; }
    .inv-head__logo {
      flex: 0 0 auto;
      width: 52px;
      height: 52px;
      border-radius: 13px;
      background: linear-gradient(145deg, var(--brand) 0%, var(--brand-2) 100%);
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.5px;
      box-shadow: 0 6px 14px rgba(15, 42, 82, 0.28);
    }
    .inv-head__id h1 {
      margin: 0 0 3px;
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.2px;
      color: var(--brand);
      text-transform: uppercase;
    }
    .inv-head__addr { margin: 0; font-size: 10.5px; color: var(--ink-soft); max-width: 320px; }
    .inv-head__contact { margin: 3px 0 0; font-size: 10px; color: var(--ink-faint); }
    .inv-head__doc {
      flex: 0 0 auto;
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 2px;
    }
    .inv-head__doc-label {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 3px;
      text-transform: uppercase;
      color: var(--accent);
    }
    .inv-head__doc-no {
      font-size: 20px;
      font-weight: 800;
      color: var(--ink);
      letter-spacing: 0.3px;
    }
    .inv-head__doc-date { font-size: 10.5px; color: var(--ink-soft); }
    .inv-head__doc-type {
      margin-top: 6px;
      display: inline-block;
      padding: 3px 9px;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      background: var(--bg-soft);
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--ink-soft);
    }

    /* Tax IDs strip */
    .inv-ids {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1px;
      margin: 14px 0 18px;
      background: var(--line);
      border: 1px solid var(--line);
      border-radius: 10px;
      overflow: hidden;
    }
    .inv-ids__item {
      background: var(--bg-soft);
      padding: 8px 12px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .inv-ids__item span {
      font-size: 8.5px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--ink-faint);
    }
    .inv-ids__item strong { font-size: 11px; font-weight: 700; color: var(--ink); }

    /* Parties */
    .inv-parties {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-bottom: 18px;
    }
    .inv-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px 16px;
      background: #fff;
    }
    .inv-card--accent { border-left: 3px solid var(--brand-2); }
    .inv-card h3 {
      margin: 0 0 10px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.4px;
      text-transform: uppercase;
      color: var(--brand-2);
    }
    .inv-card__name { font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 2px; }
    .inv-card__addr { font-size: 10.5px; color: var(--ink-soft); margin-bottom: 8px; white-space: pre-line; }
    .inv-kv {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 3px 0;
      font-size: 10.5px;
    }
    .inv-kv + .inv-kv { border-top: 1px dashed var(--line); }
    .inv-kv span { color: var(--ink-faint); }
    .inv-kv b { color: var(--ink); font-weight: 600; text-align: right; }

    /* Items */
    .inv-items {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-bottom: 18px;
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
    }
    .inv-items thead th {
      background: var(--brand);
      color: #fff;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      padding: 10px 12px;
      text-align: left;
    }
    .inv-items thead th.num { text-align: right; }
    .inv-items thead th.center { text-align: center; }
    .inv-items tbody td {
      padding: 9px 12px;
      font-size: 10.5px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
    }
    .inv-items tbody tr:nth-child(even) td { background: var(--bg-zebra); }
    .inv-items tbody tr:last-child td { border-bottom: none; }
    .inv-items td.num { text-align: right; font-variant-numeric: tabular-nums; }
    .inv-items td.center { text-align: center; }
    .inv-items td.strong { font-weight: 700; color: var(--ink); }
    .inv-items td.muted { color: var(--ink-faint); }
    .inv-items tfoot td {
      padding: 10px 12px;
      background: var(--bg-soft);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--ink);
      text-align: right;
      border-top: 1.5px solid var(--line-strong);
    }
    .inv-items tfoot td.num { font-variant-numeric: tabular-nums; }

    /* Summary */
    .inv-summary {
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 14px;
      margin-bottom: 22px;
      align-items: start;
    }
    .inv-words {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px 16px;
      background: var(--bg-soft);
      min-height: 100%;
    }
    .inv-words h4 {
      margin: 0 0 8px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.4px;
      text-transform: uppercase;
      color: var(--brand-2);
    }
    .inv-words__line { font-size: 10.5px; color: var(--ink-soft); margin-bottom: 5px; }
    .inv-words__line b { color: var(--ink); font-weight: 600; }
    .inv-words__total {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--line-strong);
      font-size: 11px;
      color: var(--ink);
    }
    .inv-words__total span {
      display: block;
      font-size: 8.5px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--ink-faint);
      margin-bottom: 3px;
    }
    .inv-words__total b { font-weight: 700; }

    .inv-totals {
      border: 1px solid var(--line);
      border-radius: 12px;
      overflow: hidden;
    }
    .inv-totals__row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 9px 16px;
      font-size: 10.5px;
      color: var(--ink-soft);
      border-bottom: 1px solid var(--line);
    }
    .inv-totals__row span:last-child { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
    .inv-totals__row em { font-style: normal; color: var(--ink-faint); font-size: 9.5px; }
    .inv-totals__grand {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 13px 16px;
      background: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
      color: #fff;
    }
    .inv-totals__grand span:first-child {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      opacity: 0.85;
    }
    .inv-totals__grand span:last-child { font-size: 16px; font-weight: 800; font-variant-numeric: tabular-nums; }

    /* Footer */
    .inv-foot {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 20px;
      padding-top: 16px;
      border-top: 1px solid var(--line);
      align-items: end;
    }
    .inv-bank h4 {
      margin: 0 0 8px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1.4px;
      text-transform: uppercase;
      color: var(--brand-2);
    }
    .inv-bank__row { display: flex; gap: 8px; font-size: 10.5px; margin-bottom: 3px; }
    .inv-bank__row span { color: var(--ink-faint); min-width: 56px; }
    .inv-bank__row strong { color: var(--ink); font-weight: 600; }
    .inv-bank--empty { min-height: 1px; }
    .inv-sign { text-align: center; }
    .inv-sign__company {
      font-size: 10.5px;
      font-weight: 700;
      color: var(--ink);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .inv-sign__space { height: 46px; }
    .inv-sign__line {
      border-top: 1.5px solid var(--ink);
      padding-top: 6px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--ink-soft);
    }

    .inv-note {
      text-align: center;
      margin: 22px 0 0;
      font-size: 9px;
      letter-spacing: 0.5px;
      color: var(--ink-faint);
    }

    @media print {
      body { background: #fff; }
      .inv-sheet {
        width: auto;
        min-height: auto;
        margin: 0;
        padding: 14mm 12mm;
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="inv-sheet">
    ${companyHeader(company, invoice)}

    ${taxIdsHtml(company)}

    <section class="inv-parties">
      <div class="inv-card inv-card--accent">
        <h3>Billed To</h3>
        <div class="inv-card__name">${escapeHtml(invoice.clientName)}</div>
        <div class="inv-card__addr">${clientAddress}</div>
        <div class="inv-kv"><span>State Name</span><b>${clientState}</b></div>
        <div class="inv-kv"><span>GSTIN</span><b>${clientGst}</b></div>
      </div>
      <div class="inv-card">
        <h3>Invoice Details</h3>
        <div class="inv-kv"><span>Invoice No.</span><b>${escapeHtml(invoice.invoiceNumber)}</b></div>
        <div class="inv-kv"><span>Invoice Date</span><b>${formatInvoiceDate(invoice.invoiceDate)}</b></div>
        <div class="inv-kv"><span>Place of Supply</span><b>${placeOfSupply}</b></div>
        <div class="inv-kv"><span>State Name</span><b>${clientState}</b></div>
        <div class="inv-kv"><span>Nature of Service</span><b>${natureOfService}</b></div>
        <div class="inv-kv"><span>Period of Supply</span><b>${periodLabel}</b></div>
      </div>
    </section>

    <table class="inv-items">
      <thead>
        <tr>
          <th class="center">S.No.</th>
          <th>Description of Services</th>
          <th class="center">SAC Code</th>
          <th class="num">Taxable Rate</th>
          <th class="num">Taxable Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4">Total Taxable Value</td>
          <td class="num">₹ ${formatAmount(invoice.taxableValue)}</td>
        </tr>
      </tfoot>
    </table>

    <section class="inv-summary">
      <div class="inv-words">
        <h4>Amount in Words</h4>
        ${cgstWords ? `<div class="inv-words__line"><b>CGST:</b> ${escapeHtml(cgstWords)}</div>` : ''}
        ${sgstWords ? `<div class="inv-words__line"><b>SGST:</b> ${escapeHtml(sgstWords)}</div>` : ''}
        ${igstWords ? `<div class="inv-words__line"><b>IGST:</b> ${escapeHtml(igstWords)}</div>` : ''}
        <div class="inv-words__total">
          <span>Total Invoice Value</span>
          <b>${escapeHtml(totalWords)}</b>
        </div>
      </div>
      <div class="inv-totals">
        ${taxTotalsHtml(invoice)}
      </div>
    </section>

    <footer class="inv-foot">
      ${bankDetailsHtml(company)}
      <div class="inv-sign">
        <div class="inv-sign__company">For ${companyName}</div>
        <div class="inv-sign__space"></div>
        <div class="inv-sign__line">Authorised Signatory</div>
      </div>
    </footer>

    <p class="inv-note">This is a computer-generated invoice and does not require a physical signature.</p>
  </div>
</body>
</html>`;
}
