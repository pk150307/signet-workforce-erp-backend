import PDFDocument from 'pdfkit';

export const EXPORT_ROWS_PER_PAGE = 15;

export interface PdfTableExportOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  /** Landscape fits wide salary-style sheets better. */
  landscape?: boolean;
  /** Header labels to drop from the PDF only (Excel callers keep the full set). */
  omitHeaders?: string[];
}

const PDF_HEADER_LABELS: Record<string, string> = {
  'Employee Code': 'Emp Code',
  employeeCode: 'Emp Code',
  'Aadhaar Number': 'Aadhaar',
  'UAN Number': 'UAN',
  'ESIC Number': 'ESIC',
  'PAN Number': 'PAN',
  'Father Name': 'Father',
  fatherName: 'Father',
  'Full Name': 'Name',
  firstName: 'First Name',
  lastName: 'Last Name',
  'Gross Earnings': 'Gross Earn',
  'Earning Basic': 'Earn Basic',
  'Earning HRA': 'Earn HRA',
  'Fixed Total': 'Fixed',
  'Month Days': 'M.Days',
  'Pay Days': 'P.Days',
  'OT Hours': 'OT Hrs',
  'OT Amount': 'OT Amt',
  'ATT/AW AFD': 'ATT/AW',
  'Gross Total': 'Gross Tot',
  'Payment Date': 'Paid On',
  'Payment Amount': 'Paid Amt',
  'Payment Notes': 'Notes',
  'Total Advance': 'Advance',
  'Salary Net Pay': 'Salary Net',
  'Payable (Net − Advance)': 'Payable',
  'Present Days': 'Present',
  'Night Allowance': 'Night',
  'Punctuality Award': 'PA',
  'Created At': 'Created',
  'Entity Type': 'Entity',
  'Entity ID': 'Entity ID',
  'IP Address': 'IP',
  'Operating System': 'OS',
  'Created By': 'Created By',
  joiningDate: 'Joined',
  basicSalary: 'Basic',
  grossSalary: 'Gross',
  softCode: 'Soft Code',
  email: 'Email',
  phone: 'Phone',
  department: 'Dept',
  designation: 'Designation',
  site: 'Site',
};

function cellText(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value);
}

function displayHeader(header: string): string {
  return PDF_HEADER_LABELS[header] ?? header;
}

export function omitExportColumns(
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  omitHeaders: string[] = [],
): { headers: string[]; rows: Array<Array<string | number | null | undefined>> } {
  if (!omitHeaders.length) return { headers, rows };
  const omit = new Set(omitHeaders);
  const keep = headers.map((header, index) => ({ header, index })).filter((col) => !omit.has(col.header));
  return {
    headers: keep.map((col) => col.header),
    rows: rows.map((row) => keep.map((col) => row[col.index])),
  };
}

function computeColumnWidths(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
  pageWidth: number,
  fontSize: number,
): number[] {
  doc.font('Helvetica').fontSize(fontSize);
  const padding = 8;
  const measured = headers.map((header, index) => {
    let width = doc.widthOfString(displayHeader(header));
    for (const row of rows) {
      const cellWidth = doc.widthOfString(cellText(row[index]));
      if (cellWidth > width) width = cellWidth;
    }
    return Math.max(width + padding, 28);
  });
  const total = measured.reduce((sum, width) => sum + width, 0);
  if (total <= pageWidth) {
    const extra = pageWidth - total;
    return measured.map((width) => width + extra * (width / total));
  }
  return measured.map((width) => (width / total) * pageWidth);
}

function xOffsets(colWidths: number[], left: number): number[] {
  const offsets: number[] = [];
  let x = left;
  for (const width of colWidths) {
    offsets.push(x);
    x += width;
  }
  return offsets;
}

/** Build a simple multi-page PDF table buffer (shared by list exports). */
export async function buildPdfTableBuffer(options: PdfTableExportOptions): Promise<Buffer> {
  const {
    title,
    subtitle,
    landscape = true,
  } = options;
  const omitted = omitExportColumns(options.headers, options.rows, options.omitHeaders);
  const headers = omitted.headers;
  const rows = omitted.rows;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: landscape ? 'landscape' : 'portrait',
      margin: 24,
      info: {
        Title: title,
        Author: 'Signet Workforce ERP',
        Creator: 'Signet Workforce ERP',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const pageBottom = () => doc.page.height - doc.page.margins.bottom;
    const colCount = Math.max(headers.length, 1);
    const fontSize = colCount > 18 ? 6.5 : colCount > 12 ? 7.5 : colCount > 8 ? 8.5 : 10;
    const headerBandHeight = subtitle ? 44 : 28;
    const tableHeaderHeight = Math.max(20, fontSize + 10);
    const availableForRows =
      pageBottom() - doc.page.margins.top - headerBandHeight - tableHeaderHeight - 6;
    const rowHeight = Math.max(22, Math.floor(availableForRows / EXPORT_ROWS_PER_PAGE));
    const colWidths = computeColumnWidths(doc, headers, rows, pageWidth, fontSize);
    const xs = xOffsets(colWidths, doc.page.margins.left);

    const drawHeaderBand = () => {
      doc.y = doc.page.margins.top;
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#111').text(title, { continued: false });
      if (subtitle) {
        doc.moveDown(0.12);
        doc.fontSize(9).font('Helvetica').fillColor('#555').text(subtitle);
      }
      doc.moveDown(0.35);
    };

    const drawTableHeader = () => {
      const y = doc.y;
      doc.rect(doc.page.margins.left, y, pageWidth, tableHeaderHeight).fill('#F3F4F6');
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(fontSize);
      headers.forEach((header, i) => {
        doc.text(displayHeader(header), xs[i] + 3, y + 4, {
          width: colWidths[i] - 6,
          height: tableHeaderHeight - 4,
          ellipsis: true,
          lineBreak: false,
        });
      });
      doc.y = y + tableHeaderHeight;
    };

    const startPage = () => {
      drawHeaderBand();
      drawTableHeader();
    };

    startPage();
    let rowsOnPage = 0;

    for (const row of rows) {
      if (rowsOnPage >= EXPORT_ROWS_PER_PAGE) {
        doc.addPage();
        startPage();
        rowsOnPage = 0;
      }

      const y = doc.y;
      if (rowsOnPage % 2 === 1) {
        doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#FAFAFA');
      }
      doc.fillColor('#111').font('Helvetica').fontSize(fontSize);
      row.forEach((cell, i) => {
        doc.text(cellText(cell), xs[i] + 3, y + 6, {
          width: colWidths[i] - 6,
          height: rowHeight - 8,
          ellipsis: true,
          lineBreak: false,
        });
      });
      doc
        .strokeColor('#E5E7EB')
        .moveTo(doc.page.margins.left, y + rowHeight)
        .lineTo(doc.page.margins.left + pageWidth, y + rowHeight)
        .stroke();
      doc.y = y + rowHeight;
      rowsOnPage += 1;
    }

    doc.end();
  });
}
