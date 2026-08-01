import Papa from "papaparse";
import ExcelJS from "exceljs";

export interface ImportRow {
  name: string | null;
  phone: string;
}

export interface ImportResult {
  rows: ImportRow[];
  errors: string[];
}

const PHONE_HEADERS = ["phone", "number", "mobile", "whatsapp", "whatsapp number", "phone number"];
const NAME_HEADERS = ["name", "guest name", "contact name"];

/** Digits only (matches the waId/whatsappNumber format already used everywhere else — no leading '+'). */
export function normalizePhone(raw: string): string | null {
  const digits = raw.trim().replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

function buildRows(
  records: { name: string | null; rawPhone: string }[],
  rowLabel: (i: number) => string
): ImportResult {
  const errors: string[] = [];
  const rows: ImportRow[] = [];
  const seen = new Set<string>();

  records.forEach(({ name, rawPhone }, i) => {
    const phone = normalizePhone(rawPhone);
    if (!phone) {
      errors.push(`${rowLabel(i)}: invalid phone number "${rawPhone}"`);
      return;
    }
    if (seen.has(phone)) return; // silent dedupe within the same file/paste
    seen.add(phone);
    rows.push({ name, phone });
  });

  return { rows, errors };
}

/** Parses an uploaded .csv file. Expects a header row with a phone/number/mobile/whatsapp column. */
export function parseImportCsv(csvText: string): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), { header: true, skipEmptyLines: true });
  const fields = parsed.meta.fields ?? [];
  const phoneKey = fields.find((f) => PHONE_HEADERS.includes(f.toLowerCase().trim()));
  const nameKey = fields.find((f) => NAME_HEADERS.includes(f.toLowerCase().trim()));

  if (!phoneKey) {
    return { rows: [], errors: ["No phone/number/mobile/whatsapp column found in the file's header row."] };
  }

  return buildRows(
    parsed.data.map((record) => ({
      name: nameKey ? record[nameKey]?.trim() || null : null,
      rawPhone: record[phoneKey] ?? "",
    })),
    (i) => `Row ${i + 2}` // +1 for header, +1 for 1-indexing
  );
}

/** Parses an uploaded .xlsx/.xls workbook — same header rules as parseImportCsv, first sheet only. */
export async function parseImportWorkbook(buffer: Buffer): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  // exceljs's bundled types resolve `Buffer` against a different (older)
  // nested @types/node than this project's, so the two are structurally
  // incompatible nominal types even though it's the same object at
  // runtime — cast through the function's own parameter type instead of
  // naming a Buffer type ourselves.
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { rows: [], errors: ["The uploaded file has no sheets."] };

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => String(h ?? "").toLowerCase().trim());
  const phoneIdx = headers.findIndex((h) => PHONE_HEADERS.includes(h));
  const nameIdx = headers.findIndex((h) => NAME_HEADERS.includes(h));

  if (phoneIdx === -1) {
    return { rows: [], errors: ["No phone/number/mobile/whatsapp column found in the sheet's header row."] };
  }

  const records: { name: string | null; rawPhone: string }[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    records.push({
      name: nameIdx !== -1 ? String(row.getCell(nameIdx).value ?? "").trim() || null : null,
      rawPhone: String(row.getCell(phoneIdx).value ?? ""),
    });
  });

  return buildRows(records, (i) => `Row ${i + 2}`);
}

/** Parses freeform pasted text — no header required. Each line is "Name, Phone" or just "Phone". */
export function parseManualEntries(text: string): ImportResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return buildRows(
    lines.map((line) => {
      const parts = line.split(",").map((p) => p.trim()).filter(Boolean);
      return parts.length >= 2
        ? { name: parts[0], rawPhone: parts[1] }
        : { name: null, rawPhone: parts[0] ?? "" };
    }),
    (i) => `Line ${i + 1}`
  );
}
