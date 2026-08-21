import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { reviewCampaignCopy, templateBodyText } from "@/lib/campaigns/auto-review";


interface RouteParams {
  params: Promise<{ id: string }>;
}

const duplicateSchema = z.object({
  /**
   * Who the copy goes to.
   *
   * "same" repeats the original list, which is the point of running the same
   * promotion again. "failed" repeats only the ones that did not get it —
   * after a partial send that is usually what "send it again" means, and
   * blasting the whole list a second time would message people twice.
   */
  recipients: z.enum(["same", "failed"]).default("same"),
});

/**
 * Copy a campaign so it can be run again.
 *
 * A copy, never a re-send of the original row. Two reasons, and both matter:
 * a sent campaign's recipient rows are the delivery record of what actually
 * happened and must not be reset, and the copy has to go back through review
 * — otherwise "run it again" would be a way to put unreviewed copy in front
 * of guests by editing an already-approved campaign.
 *
 * The copy lands as PENDING_REVIEW with everything filled in, so it serves
 * both routes the owner asked for: submit it straight away to run the same
 * promotion again, or edit it first and then submit.
 */
export const POST = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { session, db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const { recipients: which } = duplicateSchema.parse(await req.json().catch(() => ({})));

  const original = await db.campaign.findUnique({
    where: { id },
    include: { metaTemplate: true },
  });
  if (!original) throw notFound("Campaign not found");

  // Ownership is already established by the tenant-scoped lookup above, so
  // reading the recipient rows directly is safe (they carry no tenantId).
  const originalRecipients = await prisma.campaignRecipient.findMany({
    where: {
      campaignId: id,
      ...(which === "failed" ? { status: "FAILED" } : {}),
    },
    select: { contactId: true },
  });

  if (!originalRecipients.length) {
    throw new ApiError(
      400,
      which === "failed"
        ? "Nothing failed on that campaign, so there's no one to retry."
        : "That campaign has no recipients to copy."
    );
  }

  // Re-run the copy check rather than carrying the old verdict over. The
  // guidance depends on the text, and a duplicate is very often duplicated
  // precisely so the text can be changed.
  const reviewableText = original.metaTemplate
    ? templateBodyText(original.metaTemplate.components)
    : (original.body ?? "");
  const autoReview = await reviewCampaignCopy(reviewableText);

  const copy = await db.campaign.create({
    data: {
      tenantId: session.tenantId,
      name: nextCopyName(original.name),
      type: original.type,
      messageType: original.messageType,
      templateName: original.templateName,
      metaTemplateId: original.metaTemplateId,
      templateVariableValues: (original.templateVariableValues as Prisma.InputJsonValue) ?? undefined,
      body: original.body,
      mediaUrl: original.mediaUrl,
      sendPacing: original.sendPacing,
      sendIntervalSeconds: original.sendIntervalSeconds,
      // Deliberately not copied: the original's schedule is in the past, and
      // inheriting it would either fire instantly or sit on a date that has
      // already gone. The owner picks the timing for the new run.
      scheduledAt: null,
      approval: "PENDING_REVIEW",
      submittedAt: new Date(),
      autoReview: autoReview as unknown as Prisma.InputJsonValue,
      recipients: {
        createMany: { data: originalRecipients.map((r) => ({ contactId: r.contactId })) },
      },
    },
    include: { _count: { select: { recipients: true } } },
  });

  return NextResponse.json({ campaign: copy }, { status: 201 });
});

/** "Weekend Offer" → "Weekend Offer (copy)", and again → "(copy 2)". */
function nextCopyName(name: string): string {
  const existing = name.match(/^(.*) \(copy(?: (\d+))?\)$/);
  if (!existing) return `${name} (copy)`.slice(0, 120);
  const n = existing[2] ? Number(existing[2]) + 1 : 2;
  return `${existing[1]} (copy ${n})`.slice(0, 120);
}

export const runtime = "nodejs";
