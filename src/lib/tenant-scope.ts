/**
 * Every one of these models carries a `tenantId` column. Any other model
 * (Tenant itself, or join tables scoped only through a relation like
 * CampaignRecipient) is deliberately excluded — callers must scope those
 * manually via their parent (see e.g. src/lib/campaigns/send-recipient.ts).
 */
export const TENANT_SCOPED_MODELS = new Set([
  "User",
  "HotelProfile",
  "Room",
  "KnowledgeDoc",
  "KnowledgeChunk",
  "Faq",
  "Offer",
  "Contact",
  "Message",
  "FollowUpRule",
  "ScheduledFollowUp",
  "Campaign",
  "StaffNotification",
]);

/**
 * Pure transform: given a model/operation/args and the current tenant,
 * returns the args with `tenantId` merged in wherever Prisma would accept
 * it. Has no dependency on the Prisma client itself (see tenant.ts, which
 * wires this into a real `$extends` query interceptor) — kept dependency-
 * free specifically so the isolation logic is unit-testable without a
 * database connection (see tenant-scope.test.ts).
 */
export function applyTenantScope(
  model: string | undefined,
  operation: string,
  args: Record<string, unknown>,
  tenantId: string
): Record<string, unknown> {
  if (!model || !TENANT_SCOPED_MODELS.has(model)) return args;

  const a = { ...args };
  switch (operation) {
    case "findMany":
    case "findFirst":
    case "findFirstOrThrow":
    case "findUnique":
    case "findUniqueOrThrow":
    case "update":
    case "updateMany":
    case "delete":
    case "deleteMany":
    case "count":
    case "aggregate":
    case "groupBy":
      a.where = { ...((a.where as object) ?? {}), tenantId };
      break;
    case "create":
      a.data = { ...((a.data as object) ?? {}), tenantId };
      break;
    case "createMany":
      a.data = Array.isArray(a.data) ? (a.data as object[]).map((d) => ({ ...d, tenantId })) : a.data;
      break;
    case "upsert":
      a.where = { ...((a.where as object) ?? {}), tenantId };
      a.create = { ...((a.create as object) ?? {}), tenantId };
      break;
  }
  return a;
}
