import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { listMetaTemplates } from "@/lib/whatsapp/meta-templates";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";

/**
 * Imports every template Meta already has on file for this tenant's WABA —
 * covers templates approved directly in Meta Business Manager before this
 * feature existed, or created outside this app. Synced templates land with
 * empty bodyVariableSlots (we have no way to know which {{n}} maps to a
 * guest's name vs. a custom value from Meta's response alone) — they're
 * fully sendable as static-body templates, but won't offer personalization
 * until an owner recreates them through the builder if that's needed.
 */
export const POST = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);

  const creds = await getWhatsAppCredentials(session.tenantId);
  if (!creds) throw new ApiError(400, "Connect WhatsApp in Settings before syncing templates.");

  const remote = await listMetaTemplates(creds);

  let imported = 0;
  let updated = 0;
  for (const t of remote) {
    const header = t.components.find((c) => String(c.type).toUpperCase() === "HEADER") as { format?: string } | undefined;
    const existing = await db.metaTemplate.findUnique({
      where: { tenantId_name_language: { tenantId: session.tenantId, name: t.name, language: t.language } },
    });

    if (existing) {
      await db.metaTemplate.update({
        where: { id: existing.id },
        data: { status: t.status, metaTemplateId: t.id, components: t.components as Prisma.InputJsonValue, lastStatusCheckAt: new Date() },
      });
      updated++;
    } else {
      await db.metaTemplate.create({
        data: {
          tenantId: session.tenantId,
          name: t.name,
          category: (["MARKETING", "UTILITY", "AUTHENTICATION"].includes(t.category) ? t.category : "MARKETING") as
            | "MARKETING"
            | "UTILITY"
            | "AUTHENTICATION",
          language: t.language,
          status: t.status,
          metaTemplateId: t.id,
          components: t.components as Prisma.InputJsonValue,
          headerType: header ? (header.format ?? "TEXT").toUpperCase() : "NONE",
          bodyVariableSlots: [],
          lastStatusCheckAt: new Date(),
        },
      });
      imported++;
    }
  }

  return NextResponse.json({ imported, updated, total: remote.length });
});
