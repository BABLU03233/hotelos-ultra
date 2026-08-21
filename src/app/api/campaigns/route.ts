import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { campaignCreateSchema } from "@/lib/validation/campaign";
import { reviewCampaignCopy, templateBodyText } from "@/lib/campaigns/auto-review";
import { Prisma } from "@/generated/prisma/client";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { recipients: true } },
      // Enough to tell the truth in the list. Without these the list can only
      // say "Sent", which it did for a broadcast where every single message
      // had failed — the owner's first and often only view of the campaign.
      recipients: { select: { status: true } },
    },
  });

  const withDelivery = campaigns.map(({ recipients, ...c }) => ({
    ...c,
    delivery: {
      sent: recipients.filter((r) => ["SENT", "DELIVERED", "READ", "REPLIED"].includes(r.status)).length,
      failed: recipients.filter((r) => r.status === "FAILED").length,
    },
  }));

  return NextResponse.json({ campaigns: withDelivery });
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
  let templateComponents: unknown = null;
  if (body.metaTemplateId) {
    const template = await db.metaTemplate.findUnique({ where: { id: body.metaTemplateId } });
    if (!template) throw new ApiError(400, "That template wasn't found for this hotel.");
    templateComponents = template.components;
  }

  // contactIds are tenant-scoped independently since createMany's nested
  // relation can't be routed through the tenant-scoping extension.
  const validContacts = await db.contact.findMany({
    where: { id: { in: body.contactIds } },
    select: { id: true },
  });
  if (!validContacts.length) throw new ApiError(400, "No valid contacts selected");

  // The automated first pass, run at creation so the operator opens the review
  // queue with a recommendation already attached instead of reading every
  // broadcast cold. Reviews the guest-facing text — the template body for a
  // template campaign, the typed body otherwise.
  //
  // Awaited rather than backgrounded: it normally costs a few hundred
  // milliseconds on the chain's first link, and a campaign that reaches the
  // queue with its check still "pending" is a state the admin screen would
  // have to explain. reviewCampaignCopy never throws — it degrades to the
  // deterministic checks alone when every free tier is exhausted.
  const reviewableText = templateComponents ? templateBodyText(templateComponents) : (body.body ?? "");
  const autoReview = await reviewCampaignCopy(reviewableText);

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
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      // Every new campaign enters the operator's review queue. Nothing the
      // owner can do from this route creates an already-approved campaign.
      approval: "PENDING_REVIEW",
      submittedAt: new Date(),
      autoReview: autoReview as unknown as Prisma.InputJsonValue,
      recipients: {
        createMany: { data: validContacts.map((c) => ({ contactId: c.id })) },
      },
    },
    include: { _count: { select: { recipients: true } } },
  });

  return NextResponse.json({ campaign }, { status: 201 });
});
