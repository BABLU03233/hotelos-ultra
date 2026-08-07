import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { campaignCreateSchema } from "@/lib/validation/campaign";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recipients: true } } },
  });
  return NextResponse.json({ campaigns });
});

export const POST = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const body = campaignCreateSchema.parse(await req.json());

  if (body.messageType === "TEMPLATE" && !body.templateName && !body.metaTemplateId) {
    throw new ApiError(400, "Select a template for template campaigns");
  }
  if (body.messageType === "IMAGE" && !body.mediaUrl) {
    throw new ApiError(400, "mediaUrl is required for image campaigns");
  }

  // Server-side ownership check — db is tenant-scoped, so this naturally
  // returns null (not another tenant's template) if the id doesn't belong
  // to this tenant, closing the gap where a client-supplied id could
  // otherwise reference any template in the database.
  if (body.metaTemplateId) {
    const template = await db.metaTemplate.findUnique({ where: { id: body.metaTemplateId } });
    if (!template) throw new ApiError(400, "That template wasn't found for this hotel.");
  }

  // contactIds are tenant-scoped independently since createMany's nested
  // relation can't be routed through the tenant-scoping extension.
  const validContacts = await db.contact.findMany({
    where: { id: { in: body.contactIds } },
    select: { id: true },
  });
  if (!validContacts.length) throw new ApiError(400, "No valid contacts selected");

  const campaign = await db.campaign.create({
    data: {
      tenantId: session.tenantId,
      name: body.name,
      type: body.type,
      messageType: body.messageType,
      templateName: body.templateName,
      metaTemplateId: body.metaTemplateId,
      templateVariableValues: body.templateVariableValues ?? undefined,
      body: body.body,
      mediaUrl: body.mediaUrl,
      sendPacing: body.sendPacing,
      sendIntervalSeconds: body.sendPacing === "SPACED" ? body.sendIntervalSeconds : null,
      recipients: {
        createMany: { data: validContacts.map((c) => ({ contactId: c.id })) },
      },
    },
    include: { _count: { select: { recipients: true } } },
  });

  return NextResponse.json({ campaign }, { status: 201 });
});
