import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { listMetaTemplates } from "@/lib/whatsapp/meta-templates";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";

/**
 * The approved templates this tenant can actually send right now, read live
 * from Meta rather than from our own MetaTemplate table.
 *
 * Meta is the source of truth here and our table is only a record of what was
 * submitted through this app. In production the two had completely diverged:
 * the table held zero rows while the WABA had an approved "hello_world", so
 * the one template the hotel could legally send to a lapsed guest was
 * invisible to every screen we render.
 *
 * Only APPROVED entries are returned — a PENDING or REJECTED template cannot
 * be sent, and offering one would produce exactly the silent failure this
 * whole area has been suffering from.
 */
export const GET = apiRoute(async (req: NextRequest) => {
  const { session } = requireTenantDb(req);

  const creds = await getWhatsAppCredentials(session.tenantId);
  if (!creds) return NextResponse.json({ templates: [] });

  try {
    const all = await listMetaTemplates(creds);
    const templates = all
      .filter((t) => t.status === "APPROVED")
      .map((t) => {
        // The BODY component's text, so staff can see what they are about to
        // send rather than picking a template by its internal name.
        const body =
          (t.components as { type?: string; text?: string }[] | undefined)?.find((c) => c.type === "BODY")?.text ?? "";
        return {
          name: t.name,
          language: t.language,
          category: t.category,
          body,
          // How many {{n}} placeholders the body has. Anything above zero
          // needs values at send time, which this screen does not collect —
          // see the picker, which shows those but does not let them be sent.
          variables: (body.match(/\{\{\d+\}\}/g) ?? []).length,
        };
      });
    return NextResponse.json({ templates });
  } catch (err) {
    // A Meta outage must not break the chat screen; an empty list degrades to
    // "no templates available" rather than an error page.
    console.error("Approved-template list failed:", err);
    return NextResponse.json({ templates: [] });
  }
});
