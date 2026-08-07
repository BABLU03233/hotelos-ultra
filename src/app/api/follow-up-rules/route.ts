import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { followUpRuleSchema } from "@/lib/validation/follow-up-rule";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
  const rules = await db.followUpRule.findMany({ orderBy: { order: "asc" } });
  return NextResponse.json({ rules });
});

export const POST = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const body = followUpRuleSchema.parse(await req.json());
  const rule = await db.followUpRule.create({
    data: {
      tenantId: session.tenantId,
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
  return NextResponse.json({ rule }, { status: 201 });
});
