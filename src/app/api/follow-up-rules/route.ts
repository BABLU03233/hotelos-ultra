import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
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

  // A duplicate active step (same action+message+delay) means a guest gets
  // several near-identical messages back to back the moment it fires — a
  // spam signal that can get a WhatsApp Business Account rate-limited or
  // blocked by Meta. Most common cause in practice: a double-click on "Add
  // step" before the first request finishes.
  const existingRules = await db.followUpRule.findMany({ where: { active: true } });
  const isDuplicate = existingRules.some(
    (r) =>
      r.action === body.action &&
      r.delayMinutes === body.delayMinutes &&
      (r.messageBody ?? "").trim().toLowerCase() === (body.messageBody ?? "").trim().toLowerCase()
  );
  if (isDuplicate) {
    throw new ApiError(409, "An active follow-up step with this exact action, message, and delay already exists.");
  }

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
