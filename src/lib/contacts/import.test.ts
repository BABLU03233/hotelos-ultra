import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { normalizePhone, parseImportCsv, parseImportWorkbook, parseManualEntries } from "./import";

describe("normalizePhone", () => {
  it("strips spaces, dashes, parens, and a leading +", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
    expect(normalizePhone("(987) 654-3210")).toBe("9876543210");
  });

  it("rejects anything under 8 digits", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("parseImportCsv", () => {
  it("parses name+phone columns, case-insensitive header matching", () => {
    const csv = "Name,Phone\nAnanya,+919876543210\nRahul,9123456789\n";
    const { rows, errors } = parseImportCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { name: "Ananya", phone: "919876543210" },
      { name: "Rahul", phone: "9123456789" },
    ]);
  });

  it("accepts alternate phone-column header names and works with no name column", () => {
    const csv = "whatsapp\n9876543210\n";
    const { rows, errors } = parseImportCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([{ name: null, phone: "9876543210" }]);
  });

  it("errors when no recognizable phone column exists", () => {
    const csv = "Name,Email\nAnanya,a@example.com\n";
    const { rows, errors } = parseImportCsv(csv);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/no phone/i);
  });

  it("reports a per-row error for malformed numbers instead of failing the whole import", () => {
    const csv = "Name,Phone\nAnanya,919876543210\nBad,123\n";
    const { rows, errors } = parseImportCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Row 3/);
  });

  it("dedupes repeated numbers within the same file", () => {
    const csv = "Name,Phone\nAnanya,919876543210\nAnanya Again,+91 98765 43210\n";
    const { rows } = parseImportCsv(csv);
    expect(rows).toHaveLength(1);
  });
});

describe("parseManualEntries", () => {
  it("accepts 'Name, Phone' lines", () => {
    const { rows, errors } = parseManualEntries("Ananya, 919876543210\nRahul, 9123456789");
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { name: "Ananya", phone: "919876543210" },
      { name: "Rahul", phone: "9123456789" },
    ]);
  });

  it("accepts phone-only lines with no name", () => {
    const { rows } = parseManualEntries("919876543210\n9123456789");
    expect(rows).toEqual([
      { name: null, phone: "919876543210" },
      { name: null, phone: "9123456789" },
    ]);
  });

  it("reports malformed lines without dropping the whole batch", () => {
    const { rows, errors } = parseManualEntries("919876543210\nnot-a-number");
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Line 2/);
  });

  it("ignores blank lines", () => {
    const { rows } = parseManualEntries("919876543210\n\n\n9123456789\n");
    expect(rows).toHaveLength(2);
  });
});

describe("parseImportWorkbook", () => {
  async function buildXlsx(rows: (string | number)[][]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Contacts");
    rows.forEach((row) => sheet.addRow(row));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it("reads name+phone columns from the first sheet", async () => {
    const buffer = await buildXlsx([
      ["Name", "Phone"],
      ["Ananya", "919876543210"],
      ["Rahul", "9123456789"],
    ]);
    const { rows, errors } = await parseImportWorkbook(buffer);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { name: "Ananya", phone: "919876543210" },
      { name: "Rahul", phone: "9123456789" },
    ]);
  });

  it("errors when no sheet has a recognizable phone column", async () => {
    const buffer = await buildXlsx([["Name", "Email"], ["Ananya", "a@example.com"]]);
    const { rows, errors } = await parseImportWorkbook(buffer);
    expect(rows).toHaveLength(0);
    expect(errors[0]).toMatch(/no phone/i);
  });
});
