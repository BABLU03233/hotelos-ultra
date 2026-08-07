import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { followUpRuleUpdateSchema } from "@/lib/validation/follow-up-rule";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const PATCH = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;
  const body = followUpRuleUpdateSchema.parse(await req.json());

  const existing = await db.followUpRule.findUnique({ where: { id } });
  if (!existing) throw notFound("Follow-up rule not found");

  // db is tenant-scoped, so this naturally returns null if the id belongs to another tenant.
  if (body.metaTemplateId) {
    const template = await db.metaTemplate.findUnique({ where: { id: body.metaTemplateId } });
    if (!template) throw new ApiError(400, "That template wasn't found for this hotel.");
  }

  const rule = await db.followUpRule.update({
    where: { id },
    data: {
      order: body.order,
      delayMinutes: body.delayMinutes,
      action: body.action,
      templateName: body.templateName,
      messageBody: body.messageBody,
      active: body.active,
      repeatDaily: body.repeatDaily,
      metaTemplateId: body.metaTemplateId,
      templateVariableValues: body.templateVariableValues ?? undefined,
    },
  });
  return NextResponse.json({ rule });
});

export const DELETE = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const existing = await db.followUpRule.findUnique({ where: { id } });
  if (!existing) throw notFound("Follow-up rule not found");

  await db.followUpRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
