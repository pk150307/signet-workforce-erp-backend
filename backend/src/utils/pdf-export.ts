import PDFDocument from 'pdfkit';

export interface PdfTableExportOptions {
  title: string;
  subtitle?: string;
  headers: string[];
  rows: Array<Array<string | number | null | undefined>>;
  /** Landscape fits wide salary-style sheets better. */
  landscape?: boolean;
}

function cellText(value: string | number | null | undefined): string {
  if (value == null) return '';
  return String(value);
}

/** Build a simple multi-page PDF table buffer (shared by list exports). */
export async function buildPdfTableBuffer(options: PdfTableExportOptions): Promise<Buffer> {
  const { title, subtitle, headers, rows, landscape = true } = options;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: landscape ? 'landscape' : 'portrait',
      margin: 36,
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
    const colCount = Math.max(headers.length, 1);
    const colWidth = pageWidth / colCount;
    const fontSize = colCount > 12 ? 6 : colCount > 8 ? 7 : 8;
    const rowHeight = fontSize + 8;

    const drawHeaderBand = () => {
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#111').text(title, { continued: false });
      if (subtitle) {
        doc.moveDown(0.2);
        doc.fontSize(9).font('Helvetica').fillColor('#555').text(subtitle);
      }
      doc.moveDown(0.6);
    };

    const ensureSpace = (needed: number) => {
      const bottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y + needed > bottom) {
        doc.addPage();
        drawHeaderBand();
        drawTableHeader();
      }
    };

    const drawTableHeader = () => {
      const y = doc.y;
      doc.rect(doc.page.margins.left, y, pageWidth, rowHeight).fill('#F3F4F6');
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(fontSize);
      headers.forEach((header, i) => {
        const x = doc.page.margins.left + i * colWidth;
        doc.text(header, x + 2, y + 3, {
          width: colWidth - 4,
          height: rowHeight - 2,
          ellipsis: true,
          lineBreak: false,
        });
      });
      doc.y = y + rowHeight + 2;
      doc.fillColor('#111').font('Helvetica').fontSize(fontSize);
    };

    drawHeaderBand();
    drawTableHeader();

    for (const row of rows) {
      ensureSpace(rowHeight + 2);
      const y = doc.y;
      row.forEach((cell, i) => {
        const x = doc.page.margins.left + i * colWidth;
        doc.text(cellText(cell), x + 2, y + 2, {
          width: colWidth - 4,
          height: rowHeight - 2,
          ellipsis: true,
          lineBreak: false,
        });
      });
      doc.y = y + rowHeight;
      doc
        .strokeColor('#E5E7EB')
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.margins.left + pageWidth, doc.y)
        .stroke();
    }

    doc.end();
  });
}
