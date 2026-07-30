import { NextRequest, NextResponse } from "next/server";
import { apiRoute, notFound } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export const DELETE = apiRoute(async (req: NextRequest, ctx: RouteParams) => {
  const { db } = requireTenantDb(req);
  const { id } = await ctx.params;

  const existing = await db.knowledgeDoc.findUnique({ where: { id } });
  if (!existing) throw notFound("Document not found");

  await db.knowledgeDoc.delete({ where: { id } }); // cascades to KnowledgeChunk rows
  return NextResponse.json({ ok: true });
});
