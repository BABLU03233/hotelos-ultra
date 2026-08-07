import { NextRequest, NextResponse } from "next/server";
import { notFound, apiRoute } from "@/lib/api-error";
import { requireOwner, requireTenantDb } from "@/lib/auth/require-session";
import { deleteMetaTemplate } from "@/lib/whatsapp/meta-templates";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const DELETE = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const session = requireOwner(req);
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const template = await db.metaTemplate.findUnique({ where: { id } });
  if (!template) throw notFound("Template not found");

  const creds = await getWhatsAppCredentials(session.tenantId);
  if (creds) {
    // Best-effort — if WhatsApp got disconnected since this template was
    // created, still let the owner clear the local row rather than getting stuck.
    await deleteMetaTemplate(creds, template.name).catch((err) => console.error("Meta template delete failed:", err));
  }

  await db.metaTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
