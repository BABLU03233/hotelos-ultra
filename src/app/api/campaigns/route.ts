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

  if (body.messageType === "TEMPLATE" && !body.templateName) {
    throw new ApiError(400, "templateName is required for template campaigns");
  }
  if (body.messageType === "IMAGE" && !body.mediaUrl) {
    throw new ApiError(400, "mediaUrl is required for image campaigns");
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
      body: body.body,
      mediaUrl: body.mediaUrl,
      recipients: {
        createMany: { data: validContacts.map((c) => ({ contactId: c.id })) },
      },
    },
    include: { _count: { select: { recipients: true } } },
  });

  return NextResponse.json({ campaign }, { status: 201 });
});
