import { NextRequest, NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { faqSchema } from "@/lib/validation/settings";

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
  const faqs = await db.faq.findMany();
  return NextResponse.json({ faqs });
});

export const POST = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const body = faqSchema.parse(await req.json());
  const faq = await db.faq.create({ data: { ...body, tenantId: session.tenantId } });
  return NextResponse.json({ faq }, { status: 201 });
});
