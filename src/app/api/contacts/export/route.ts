import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import {
  ExportSegment,
  buildMetaCsv,
  isExportable,
  matchesSegment,
  splitName,
  toE164,
} from "@/lib/contacts/export";

const SEGMENTS: ExportSegment[] = ["all", "booked", "interested", "not-booked"];

const SEGMENT_LABEL: Record<ExportSegment, string> = {
  all: "all-contacts",
  booked: "guests-who-booked",
  interested: "interested-guests",
  "not-booked": "not-yet-booked",
};

/**
 * Downloads this hotel's contacts for Meta Ads.
 *
 * `format=csv` is the file Ads Manager's customer-list uploader expects —
 * Meta's own column names and nothing else. `format=xlsx` is the same people
 * with readable headings and booking context, for the hotel's own records.
 *
 * Opted-out contacts are excluded from both, unconditionally (see
 * isExportable): they asked the hotel to stop contacting them, and an ad
 * audience is the same intrusion through another channel.
 */
export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const requested = url.searchParams.get("segment") as ExportSegment | null;
  const segment: ExportSegment = requested && SEGMENTS.includes(requested) ? requested : "all";

  const contacts = await db.contact.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      name: true,
      phone: true,
      whatsappNumber: true,
      leadStatus: true,
      bookingStatus: true,
      createdAt: true,
      lastInboundAt: true,
      optedOutAt: true,
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `${SEGMENT_LABEL[segment]}-${stamp}`;

  if (format === "csv") {
    const csv = buildMetaCsv(contacts, segment);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}-meta.csv"`,
        // Guest contact details: never cacheable by anything shared.
        "Cache-Control": "private, no-store",
      },
    });
  }

  const rows = contacts.filter(isExportable).filter((c) => matchesSegment(c, segment));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Contacts");
  sheet.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "Phone (E.164)", key: "phone", width: 18 },
    { header: "First name", key: "fn", width: 16 },
    { header: "Last name", key: "ln", width: 16 },
    { header: "Country", key: "country", width: 10 },
    { header: "Lead status", key: "lead", width: 14 },
    { header: "Booking status", key: "booking", width: 15 },
    { header: "Last messaged", key: "last", width: 20 },
    { header: "First seen", key: "created", width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  for (const c of rows) {
    const { fn, ln } = splitName(c.name);
    sheet.addRow({
      name: c.name ?? "",
      // Forced to text: Excel otherwise reads a long digit string as a number
      // and renders it in scientific notation, which silently corrupts every
      // phone number in the file.
      phone: toE164(c.whatsappNumber || c.phone),
      fn,
      ln,
      country: "IN",
      lead: c.leadStatus,
      booking: c.bookingStatus,
      last: c.lastInboundAt ? c.lastInboundAt.toISOString().slice(0, 16).replace("T", " ") : "",
      created: c.createdAt.toISOString().slice(0, 16).replace("T", " "),
    });
  }
  sheet.getColumn("phone").numFmt = "@";

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  });
});
