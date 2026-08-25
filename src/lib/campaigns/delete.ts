import { ApiError, notFound } from "@/lib/api-error";
import { TenantDb } from "@/lib/tenant";

/**
 * Removes a campaign that never sent — extracted out of the route (see
 * src/app/api/campaigns/[id]/route.ts) the same way queueCampaignSend is
 * (src/lib/campaigns/send.ts), so the delete/approval-gate logic itself is
 * directly testable against a real database rather than only reachable
 * through an HTTP request.
 *
 * `db` is a tenant-scoped Prisma client (see src/lib/tenant.ts) — every
 * query it runs has tenantId merged in regardless of what's passed, so a
 * campaign id from another tenant resolves to "not found" here rather than
 * ever being reachable for deletion. Blocked once sentAt is set, same as
 * PATCH: a sent campaign's recipient rows are the delivery record of what
 * actually happened, not something to make disappear.
 */
export async function deleteCampaign(db: TenantDb, campaignId: string): Promise<void> {
  const existing = await db.campaign.findUnique({ where: { id: campaignId } });
  if (!existing) throw notFound("Campaign not found");
  if (existing.sentAt) throw new ApiError(400, "This campaign has already been sent — it can't be removed.");

  await db.campaign.delete({ where: { id: campaignId } });
}
