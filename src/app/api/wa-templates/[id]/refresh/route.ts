import { NextRequest, NextResponse } from "next/server";
import { ApiError, notFound, apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { getMetaTemplateStatus } from "@/lib/whatsapp/meta-templates";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Re-polls Meta for this template's current review status. */
export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { session, db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const existing = await db.metaTemplate.findUnique({ where: { id } });
  if (!existing) throw notFound("Template not found");
  if (!existing.metaTemplateId) throw new ApiError(400, "This template has no Meta template id yet.");

  const creds = await getWhatsAppCredentials(session.tenantId);
  if (!creds) throw new ApiError(400, "WhatsApp isn't connected for this hotel.");

  const { status, rejectedReason } = await getMetaTemplateStatus(creds, existing.metaTemplateId);

  const template = await db.metaTemplate.update({
    where: { id },
    data: { status, rejectionReason: rejectedReason, lastStatusCheckAt: new Date() },
  });

  return NextResponse.json({ template });
});
