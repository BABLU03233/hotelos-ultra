import Papa from "papaparse";
import ExcelJS from "exceljs";

export interface ImportRow {
  name: string | null;
  phone: string;
}

export interface ImportResult {
  rows: ImportRow[];
  errors: string[];
  // Rows WhatsApp would otherwise have silently dropped at send time — a bare
  // 10-digit Indian mobile got its country code filled in. Surfaced so an
  // owner pasting their own number (nobody types their own country code)
  // sees it happened, instead of finding out when that one message never
  // arrives. See [[hotelos-whatsapp-bulk-send-country-code]] in memory.
  corrected: string[];
}

const PHONE_HEADERS = ["phone", "number", "mobile", "whatsapp", "whatsapp number", "phone number"];
const NAME_HEADERS = ["name", "guest name", "contact name"];

// Every hotel on this platform is Indian (₹ pricing, IVR-style booking codes
// throughout) — a bare 10-digit number starting 6-9 is always a local mobile
// missing its country code, never a foreign number that happens to be the
// same length. Revisit this the day the platform serves a hotel outside India.
const INDIA_COUNTRY_CODE = "91";
const INDIA_MOBILE_PATTERN = /^[6-9]\d{9}$/;

/**
 * Digits only (matches the waId/whatsappNumber format already used
 * everywhere else — no leading '+'), with the country code filled in for a
 * bare Indian mobile number. WhatsApp's Cloud API requires the full
 * E.164 digits and does not infer a country code — send it a 10-digit
 * number and it just fails for that one recipient, with everything else in
 * the same broadcast going out fine.
 */
export function normalizePhone(raw: string): { phone: string; corrected: boolean } | null {
  const digits = raw.trim().replace(/\D/g, "");
  if (INDIA_MOBILE_PATTERN.test(digits)) return { phone: INDIA_COUNTRY_CODE + digits, corrected: true };
  // Upper bound matches E.164's real max (country code + subscriber number);
  // without it a pasted non-phone string of any length "validated" as a number.
  if (digits.length >= 8 && digits.length <= 15) return { phone: digits, corrected: false };
  return null;
}

function buildRows(
  records: { name: string | null; rawPhone: string }[],
  rowLabel: (i: number) => string
): ImportResult {
  const errors: string[] = [];
  const corrected: string[] = [];
  const rows: ImportRow[] = [];
  const seen = new Set<string>();

  records.forEach(({ name, rawPhone }, i) => {
    const result = normalizePhone(rawPhone);
    if (!result) {
      errors.push(`${rowLabel(i)}: invalid phone number "${rawPhone}"`);
      return;
    }
    const { phone } = result;
    if (seen.has(phone)) return; // silent dedupe within the same file/paste
    seen.add(phone);
    if (result.corrected) corrected.push(`${rowLabel(i)}: ${rawPhone.trim()} → +${phone} (added the missing country code)`);
    rows.push({ name, phone });
  });

  return { rows, errors, corrected };
}

/** Parses an uploaded .csv file. Expects a header row with a phone/number/mobile/whatsapp column. */
export function parseImportCsv(csvText: string): ImportResult {
  const parsed = Papa.parse<Record<string, string>>(csvText.trim(), { header: true, skipEmptyLines: true });
  const fields = parsed.meta.fields ?? [];
  const phoneKey = fields.find((f) => PHONE_HEADERS.includes(f.toLowerCase().trim()));
  const nameKey = fields.find((f) => NAME_HEADERS.includes(f.toLowerCase().trim()));

  if (!phoneKey) {
    return { rows: [], errors: ["No phone/number/mobile/whatsapp column found in the file's header row."], corrected: [] };
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
  if (!sheet) return { rows: [], errors: ["The uploaded file has no sheets."], corrected: [] };

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => String(h ?? "").toLowerCase().trim());
  const phoneIdx = headers.findIndex((h) => PHONE_HEADERS.includes(h));
  const nameIdx = headers.findIndex((h) => NAME_HEADERS.includes(h));

  if (phoneIdx === -1) {
    return { rows: [], errors: ["No phone/number/mobile/whatsapp column found in the sheet's header row."], corrected: [] };
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
