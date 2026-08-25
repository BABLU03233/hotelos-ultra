import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { deleteCampaign } from "@/lib/campaigns/delete";
import { prisma } from "@/lib/prisma";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Rescheduling only — unchanged, and still the common case.
 */
const patchSchema = z.object({
  // null cancels the schedule (campaign goes back to manual "Send now"); a
  // future ISO datetime reschedules it.
  scheduledAt: z.string().datetime().nullable().optional(),

  // Editing the content itself. Every one of these is optional so a plain
  // reschedule still sends only scheduledAt and behaves exactly as before.
  //
  // This exists because the product already told owners to do it and could
  // not: a refused send says "Edit it and submit it again", and until now
  // PATCH accepted nothing but scheduledAt. There was no edit path at all.
  name: z.string().trim().min(1).max(120).optional(),
  body: z.string().trim().max(4000).nullable().optional(),
  mediaUrl: z.string().url().nullable().optional(),
  messageType: z.enum(["TEXT", "IMAGE", "TEMPLATE"]).optional(),
  metaTemplateId: z.string().nullable().optional(),
  templateVariableValues: z.record(z.string(), z.string()).nullable().optional(),

  // Resubmitting for review after making the requested change.
  resubmit: z.boolean().optional(),
});

export const GET = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign) throw notFound("Campaign not found");

  // Ownership already confirmed via the tenant-scoped lookup above, so a
  // direct query (campaignRecipient has no tenantId of its own) is safe.
  const recipients = await prisma.campaignRecipient.findMany({
    where: { campaignId: id },
    include: { contact: { select: { leadStatus: true, name: true, phone: true } } },
  });

  const report = {
    totalContacts: recipients.length,
    pending: recipients.filter((r) => r.status === "PENDING").length,
    sent: recipients.filter((r) => ["SENT", "DELIVERED", "READ", "REPLIED"].includes(r.status)).length,
    delivered: recipients.filter((r) => ["DELIVERED", "READ", "REPLIED"].includes(r.status)).length,
    read: recipients.filter((r) => ["READ", "REPLIED"].includes(r.status)).length,
    replies: recipients.filter((r) => r.status === "REPLIED").length,
    interested: recipients.filter((r) => r.contact.leadStatus === "INTERESTED").length,
    booked: recipients.filter((r) => r.contact.leadStatus === "BOOKED").length,
    failed: recipients.filter((r) => r.status === "FAILED").length,
    // Who failed and why, so a campaign that reached nobody can say so
    // instead of showing a green "Sent". Capped: the point is to explain the
    // problem, and the reasons repeat — thirty rows of the same sentence is
    // not more informative than five.
    failures: recipients
      .filter((r) => r.status === "FAILED")
      .slice(0, 20)
      .map((r) => ({
        name: r.contact.name,
        phone: r.contact.phone,
        reason: r.failureReason ?? "The message could not be sent.",
      })),
  };

  return NextResponse.json({ campaign, report });
});

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const body = patchSchema.parse(await req.json());

  const existing = await db.campaign.findUnique({ where: { id } });
  if (!existing) throw notFound("Campaign not found");
  if (existing.sentAt) throw new ApiError(400, "This campaign has already been sent.");
  if (body.scheduledAt && new Date(body.scheduledAt).getTime() <= Date.now()) {
    throw new ApiError(400, "scheduledAt must be in the future");
  }

  const editsContent =
    body.name !== undefined ||
    body.body !== undefined ||
    body.mediaUrl !== undefined ||
    body.messageType !== undefined ||
    body.metaTemplateId !== undefined ||
    body.templateVariableValues !== undefined;

  // An APPROVED campaign was reviewed as a specific piece of copy. Letting it
  // be edited afterwards would mean the text that goes to guests is not the
  // text anyone approved — the whole point of the review. Rescheduling stays
  // allowed, because the timing is the owner's alone.
  if (editsContent && existing.approval === "APPROVED") {
    throw new ApiError(
      409,
      "This campaign is already approved. Editing it now would send copy nobody reviewed — duplicate it instead and submit the new one."
    );
  }

  // The shape this campaign will have AFTER the patch — each field either
  // changes or keeps what it had.
  const nextMessageType = body.messageType ?? existing.messageType;
  const nextMediaUrl = body.mediaUrl !== undefined ? body.mediaUrl : existing.mediaUrl;
  const nextTemplateId = body.metaTemplateId !== undefined ? body.metaTemplateId : existing.metaTemplateId;
  const nextBody = body.body !== undefined ? body.body : existing.body;

  if (nextMessageType === "IMAGE" && !nextMediaUrl) {
    throw new ApiError(400, "An image broadcast needs an image.");
  }
  if (nextMessageType === "TEMPLATE" && !nextTemplateId && !existing.templateName) {
    throw new ApiError(400, "A template broadcast needs an approved template.");
  }
  if (nextMessageType === "TEXT" && !nextBody?.trim()) {
    throw new ApiError(400, "A text broadcast needs a message.");
  }

  // Ownership check on a client-supplied id, exactly as the create route
  // does: db is tenant-scoped, so another hotel's template returns null here
  // rather than quietly linking across tenants.
  if (body.metaTemplateId) {
    const template = await db.metaTemplate.findUnique({ where: { id: body.metaTemplateId } });
    if (!template) throw new ApiError(400, "That template wasn't found for this hotel.");
  }

  const campaign = await db.campaign.update({
    where: { id },
    data: {
      ...(body.scheduledAt !== undefined ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.mediaUrl !== undefined ? { mediaUrl: body.mediaUrl } : {}),
      ...(body.messageType !== undefined ? { messageType: body.messageType } : {}),
      ...(body.metaTemplateId !== undefined
        ? { metaTemplate: body.metaTemplateId ? { connect: { id: body.metaTemplateId } } : { disconnect: true } }
        : {}),
      ...(body.templateVariableValues !== undefined
        ? {
            templateVariableValues:
              body.templateVariableValues === null ? Prisma.DbNull : (body.templateVariableValues as Prisma.InputJsonValue),
          }
        : {}),
      // Back into the queue, and the previous verdict is cleared with it —
      // leaving "Rejected by Rakesh" attached to copy he never saw would
      // misreport what was actually decided.
      ...(body.resubmit
        ? {
            approval: "PENDING_REVIEW" as const,
            submittedAt: new Date(),
            reviewedAt: null,
            reviewedByName: null,
            reviewNote: null,
          }
        : {}),
    },
  });
  return NextResponse.json({ campaign });
});

/**
 * Remove a campaign that never sent — cleaning up a duplicate made by
 * mistake, an abandoned draft, or one still stuck in review the owner has
 * decided against. Blocked once sentAt is set for the same reason PATCH is:
 * a sent campaign's recipient rows are the delivery record of what actually
 * happened, not something to make disappear. Cascades to its
 * CampaignRecipient rows (see prisma/schema.prisma's onDelete: Cascade).
 */
export const DELETE = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  await deleteCampaign(db, id);
  return NextResponse.json({ ok: true });
});
