import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireOwner, requireTenantDb } from "@/lib/auth/require-session";
import { metaTemplateSchema } from "@/lib/validation/meta-template";
import { buildCreateComponents, createMetaTemplate, uploadHeaderImage } from "@/lib/whatsapp/meta-templates";
import { getWhatsAppCredentials } from "@/lib/whatsapp/tenant-credentials";
import { storeImage } from "@/lib/storage/media-store";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
  const templates = await db.metaTemplate.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ templates });
});

/**
 * Accepts multipart/form-data: a `payload` JSON field (validated by
 * metaTemplateSchema) and, when the header type is "image", a `headerImage`
 * file — uploaded both to our own object storage (for the builder/list
 * preview) and to Meta's Resumable Upload API (for the actual template
 * submission, which needs an asset handle, not a URL).
 */
export const POST = apiRoute(async (req: NextRequest) => {
  const session = requireOwner(req);
  const { db } = requireTenantDb(req);

  const form = await req.formData();
  const payloadRaw = form.get("payload");
  if (typeof payloadRaw !== "string") throw new ApiError(400, "Missing payload");
  const input = metaTemplateSchema.parse(JSON.parse(payloadRaw));

  const creds = await getWhatsAppCredentials(session.tenantId);
  if (!creds) throw new ApiError(400, "Connect WhatsApp in Settings before creating a template.");

  let headerHandle: string | undefined;
  let headerMediaUrl: string | null = null;
  if (input.header.type === "image") {
    const file = form.get("headerImage");
    if (!(file instanceof File)) throw new ApiError(400, "A header image file is required for an image header.");
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "image/jpeg";
    headerHandle = await uploadHeaderImage(creds, buffer, mimeType);
    // storeImage, not uploadObject: this deployment has no object storage
    // configured, so the S3 call always failed and every template built here
    // ended up with no header preview at all. The media store falls back to
    // the mounted uploads volume, which is also what the campaign composer
    // uses. Still non-fatal — Meta already has the image via the asset
    // handle above, so a failed preview copy must not lose the template.
    headerMediaUrl = await storeImage(session.tenantId, buffer, mimeType, file.name, "wa-templates").catch((err) => {
      console.error("Header image preview copy failed (non-fatal, template still submitted to Meta):", err);
      return null;
    });
  }

  const components = buildCreateComponents(input, headerHandle);
  let metaTemplateId: string;
  let status: string;
  try {
    const created = await createMetaTemplate(creds, {
      name: input.name,
      category: input.category,
      language: input.language,
      components,
    });
    metaTemplateId = created.id;
    status = created.status;
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : "Meta rejected this template.");
  }

  const template = await db.metaTemplate.create({
    data: {
      tenantId: session.tenantId,
      name: input.name,
      category: input.category,
      language: input.language,
      status,
      metaTemplateId,
      components: components as Prisma.InputJsonValue,
      headerType: input.header.type.toUpperCase(),
      headerMediaUrl,
      bodyVariableSlots: input.bodyVariableSlots,
      lastStatusCheckAt: new Date(),
    },
  });

  return NextResponse.json({ template }, { status: 201 });
});
