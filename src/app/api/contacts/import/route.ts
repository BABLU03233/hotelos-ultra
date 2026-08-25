import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { queueCampaignSend } from "@/lib/campaigns/send";
import { ImportRow, parseImportCsv, parseImportWorkbook, parseManualEntries } from "@/lib/contacts/import";
import { prisma } from "@/lib/prisma";

/**
 * Bulk contact import for cold re-engagement — either a `.csv`/`.xlsx`/`.xls`
 * file upload or freeform pasted `manualText`, both funneled through the
 * same row-parsing logic (src/lib/contacts/import.ts). Optionally kicks off
 * an approved-template re-engagement campaign to everyone in the batch in
 * the same step, so the owner doesn't have to come back and build a
 * campaign separately afterward.
 */
export const POST = apiRoute(async (req: NextRequest) => {
  const { session } = requireTenantDb(req);
  const form = await req.formData();

  const file = form.get("file");
  const manualText = form.get("manualText");
  const templateName = String(form.get("templateName") ?? "").trim() || null;
  const metaTemplateId = String(form.get("metaTemplateId") ?? "").trim() || null;
  const templateVariableValuesRaw = String(form.get("templateVariableValues") ?? "").trim();
  const templateVariableValues = templateVariableValuesRaw ? JSON.parse(templateVariableValuesRaw) : null;

  if (metaTemplateId) {
    const template = await prisma.metaTemplate.findFirst({ where: { id: metaTemplateId, tenantId: session.tenantId } });
    if (!template) throw new ApiError(400, "That template wasn't found for this hotel.");
  }

  let rows: ImportRow[];
  let errors: string[];
  let corrected: string[];

  if (file instanceof File) {
    const name = file.name.toLowerCase();
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await parseImportWorkbook(buffer).catch(() => ({
        rows: [] as ImportRow[],
        errors: ["Couldn't read this file — make sure it's a valid .xlsx or .xls spreadsheet."],
        corrected: [] as string[],
      }));
      rows = result.rows;
      errors = result.errors;
      corrected = result.corrected;
    } else {
      const text = await file.text();
      ({ rows, errors, corrected } = parseImportCsv(text));
    }
  } else if (typeof manualText === "string" && manualText.trim()) {
    ({ rows, errors, corrected } = parseManualEntries(manualText));
  } else {
    throw new ApiError(400, "Provide a file (.csv/.xlsx/.xls) or paste numbers manually");
  }

  if (!rows.length) {
    return NextResponse.json({ imported: 0, skipped: 0, errors, corrected, campaignId: null, contactIds: [] });
  }

  const phones = rows.map((r) => r.phone);
  const existing = await prisma.contact.findMany({
    where: { tenantId: session.tenantId, whatsappNumber: { in: phones } },
    select: { id: true, whatsappNumber: true },
  });
  const existingByPhone = new Map(existing.map((c) => [c.whatsappNumber, c.id]));

  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const contactIds: string[] = [];

  for (const row of rows) {
    const contact = await prisma.contact.upsert({
      where: { tenantId_whatsappNumber: { tenantId: session.tenantId, whatsappNumber: row.phone } },
      create: {
        tenantId: session.tenantId,
        name: row.name,
        phone: row.phone,
        whatsappNumber: row.phone,
        leadSource: "COLD_IMPORT",
        sourceDetail: `Imported ${today}`,
      },
      // Never overwrite an existing contact's name/source/status — importing
      // the same list twice (or a number that already messaged in) is safe.
      update: existingByPhone.has(row.phone) ? {} : { name: row.name ?? undefined },
      select: { id: true },
    });
    contactIds.push(contact.id);
  }

  const imported = rows.length - existingByPhone.size;
  const skipped = existingByPhone.size;

  let campaignId: string | null = null;
  if (templateName || metaTemplateId) {
    const campaign = await prisma.campaign.create({
      data: {
        tenantId: session.tenantId,
        name: `Cold re-engagement — ${today}`,
        type: "cold_reengagement",
        messageType: "TEMPLATE",
        templateName,
        metaTemplateId,
        templateVariableValues,
        recipients: { createMany: { data: contactIds.map((contactId) => ({ contactId })) } },
      },
    });
    await queueCampaignSend(campaign.id);
    campaignId = campaign.id;
  }

  return NextResponse.json({ imported, skipped, errors, corrected, campaignId, contactIds }, { status: 201 });
});
