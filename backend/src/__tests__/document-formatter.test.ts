import ExcelJS from 'exceljs';
import { matchAttendanceRows, normalizePersonName } from '../modules/document-formatter/document-formatter.match';
import { parseRawAttendanceBuffer } from '../modules/document-formatter/document-formatter.parser';
import { FormatterEmployee } from '../modules/document-formatter/document-formatter.types';

async function sampleWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('SIGNET');
  sheet.getCell('A1').value = 'SIGNET ENTERPRISES ATTENDANCE FOR THE MONTH OF SEP 2026 ASS';

  const headers = ['S.NO', 'CODE', 'NAME', 'FATHER NAME', 'BASIC', 'GWA'];
  for (let day = 1; day <= 30; day++) headers.push(String(day));
  headers.push('T.OT', 'T. DAY', 'NIGHT', 'N ALL', 'PUNCT.', 'O.ALL', '30');

  const headerRow = sheet.getRow(2);
  headers.forEach((header, index) => {
    headerRow.getCell(index + 1).value = header === '30' ? 30 : header;
  });

  const dayStart = 7;
  const totCol = dayStart + 30;
  const tdayCol = totCol + 1;
  const nightCol = tdayCol + 1;
  const nallCol = nightCol + 1;
  const punctCol = nallCol + 1;
  const bonusCol = punctCol + 1;

  const first = sheet.getRow(3);
  first.getCell(2).value = 'SS0001';
  first.getCell(3).value = 'AMAN KUMAR (SR1656)';
  first.getCell(4).value = 'RAW FATHER';
  first.getCell(5).value = 15221;
  first.getCell(6).value = 5454;
  first.getCell(dayStart).value = 3.5;
  first.getCell(dayStart + 1).value = 'A';
  first.getCell(dayStart + 2).value = 'W/O';
  first.getCell(totCol).value = 3.5;
  first.getCell(tdayCol).value = 2;
  first.getCell(nightCol).value = 4;
  first.getCell(nallCol).value = 200;
  first.getCell(punctCol).value = 600;
  first.getCell(bonusCol).value = 0;

  const second = sheet.getRow(4);
  second.getCell(2).value = 'SS0002';
  second.getCell(3).value = 'OTHER PERSON';
  second.getCell(5).value = 8000;
  second.getCell(dayStart).value = 2;
  second.getCell(dayStart + 1).value = 2;
  second.getCell(dayStart + 2).value = 'P/2';
  second.getCell(nightCol).value = 1;

  sheet.getRow(5).getCell(2).value = 'SALARY=16421';
  sheet.getRow(6).getCell(2).value = 'CODE';
  sheet.getRow(6).getCell(3).value = 'NAME';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe('document formatter', () => {
  it('reads present days, OT amount, night allowance, and punctuality from a raw register', async () => {
    const parsed = await parseRawAttendanceBuffer(await sampleWorkbook());

    expect(parsed.detectedMonth).toBe(9);
    expect(parsed.detectedYear).toBe(2026);
    expect(parsed.monthDays).toBe(30);
    expect(parsed.rows.map((row) => row.code)).toEqual(['SS0001', 'SS0002']);

    const aman = parsed.rows[0];
    expect(aman.presentDays).toBe(2);
    expect(aman.overtimeAmount).toBe(5454);
    expect(aman.nightAllowance).toBe(200);
    expect(aman.punctualityAward).toBe(600);
    expect(aman.bonus).toBe(0);

    const other = parsed.rows[1];
    expect(other.presentDays).toBe(2.5);
    expect(other.overtimeAmount).toBe(133);
    expect(other.nightAllowance).toBe(50);
    expect(other.punctualityAward).toBe(600);
    expect(other.bonus).toBe(0);
  });

  it('fills Emp ID from the employee list and the other columns from the raw sheet', async () => {
    const parsed = await parseRawAttendanceBuffer(await sampleWorkbook());
    const employees: FormatterEmployee[] = [
      {
        id: 'emp-1',
        employeeCode: 'SIG-000009',
        fullName: 'AMAN KUMAR',
        fatherName: 'OSPAL SINGH',
        softCode: 'ss0001',
      },
    ];

    const preview = matchAttendanceRows(parsed, employees, {
      clientId: 'client-1',
      clientName: 'RWA',
    });

    expect(preview.summary).toMatchObject({ matched: 1, unmatched: 1, needsReview: 0 });
    const matched = preview.rows.find((row) => row.sourceCode === 'SS0001');
    expect(matched).toMatchObject({
      status: 'matched',
      employeeCode: 'SIG-000009',
      employeeName: 'AMAN KUMAR',
      softCode: 'SS0001',
      fatherName: 'RAW FATHER',
      needsReview: false,
    });
    expect(preview.rows.find((row) => row.sourceCode === 'SS0002')?.status).toBe('unmatched');
  });

  it('copies template column names without recalculating them', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Attendance');
    sheet.addRow([
      'Emp ID',
      'Emp Name',
      'Soft Code',
      'Father Name',
      'Present Days',
      'OT Hours',
      'Night Allowance',
      'Punctuality Award',
      'Bonus',
    ]);
    sheet.addRow(['OLD-ID', 'AMAN KUMAR', 'SS0207', 'RAW FATHER', 30, 5454, 600, 800, 0]);

    const parsed = await parseRawAttendanceBuffer(Buffer.from(await workbook.xlsx.writeBuffer()));
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({
      code: 'SS0207',
      name: 'AMAN KUMAR',
      fatherName: 'RAW FATHER',
      presentDays: 30,
      overtimeAmount: 5454,
      nightAllowance: 600,
      punctualityAward: 800,
      bonus: 0,
    });
  });

  it('flags a name-only match for review', () => {
    const preview = matchAttendanceRows(
      {
        detectedMonth: 9,
        detectedYear: 2026,
        monthDays: 30,
        rows: [
          {
            rowNumber: 3,
            code: 'XX9999',
            name: 'AMAN KUMAR FG',
            fatherName: '',
            presentDays: 26,
            overtimeAmount: 100,
            nightAllowance: 0,
            punctualityAward: 0,
            bonus: 0,
            presentDaysCached: 26,
            presentDaysComputed: 26,
          },
        ],
      },
      [
        {
          id: 'emp-1',
          employeeCode: 'SIG-000009',
          fullName: 'Aman Kumar',
          fatherName: null,
          softCode: 'SS0207',
        },
      ],
      { clientId: 'client-1', clientName: 'RWA' },
    );

    expect(normalizePersonName('AMAN KUMAR (SR1656)')).toBe('AMAN KUMAR');
    expect(preview.rows[0]).toMatchObject({
      status: 'matched',
      needsReview: true,
      employeeCode: 'SIG-000009',
      employeeName: 'AMAN KUMAR FG',
      softCode: 'XX9999',
      fatherName: null,
    });
  });
});
