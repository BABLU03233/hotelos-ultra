import { NextRequest, NextResponse } from "next/server";
import { ApiError, apiRoute } from "@/lib/api-error";
import { requireTenantDb } from "@/lib/auth/require-session";
import { embedAndStoreDocument } from "@/lib/ai/rag";
import { extractTextFromPdf } from "@/lib/knowledge/extract-text";
import { uploadObject } from "@/lib/storage/s3";

const DOC_TYPES = new Set(["TEXT", "PDF", "IMAGE", "BROCHURE", "FAQ"]);

export const GET = apiRoute(async (req: NextRequest) => {
  const { db } = requireTenantDb(req);
  const docs = await db.knowledgeDoc.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { chunks: true } } },
  });
  return NextResponse.json({ docs });
});

/**
 * Accepts multipart/form-data: `title`, `type` (TEXT|PDF|IMAGE|BROCHURE|FAQ),
 * and either a `file` (uploaded to object storage; PDFs are text-extracted)
 * or a `text` field (TEXT/FAQ docs typed straight into Settings). Whatever
 * text we end up with is chunked and embedded immediately so it's
 * searchable by the RAG pipeline on the very next guest message.
 */
export const POST = apiRoute(async (req: NextRequest) => {
  const { session, db } = requireTenantDb(req);
  const form = await req.formData();

  const title = String(form.get("title") ?? "").trim();
  const typeRaw = String(form.get("type") ?? "TEXT").toUpperCase();
  if (!title) throw new ApiError(400, "title is required");
  if (!DOC_TYPES.has(typeRaw)) throw new ApiError(400, `type must be one of ${[...DOC_TYPES].join(", ")}`);
  const type = typeRaw as "TEXT" | "PDF" | "IMAGE" | "BROCHURE" | "FAQ";

  const file = form.get("file");
  const textField = form.get("text");

  let rawText: string | null = null;
  let sourceUrl: string | null = null;

  if (file instanceof File) {
    const buffer = Buffer.from(await file.arrayBuffer());
    sourceUrl = await uploadObject(session.tenantId, "knowledge", buffer, file.type || "application/octet-stream", file.name);
    if (type === "PDF" || type === "BROCHURE") {
      rawText = await extractTextFromPdf(buffer).catch((err) => {
        console.error("PDF text extraction failed:", err);
        return null;
      });
    }
    // IMAGE docs get no text extraction (OCR is out of scope for the MVP) —
    // the doc is stored and shown, but contributes nothing to RAG retrieval.
  } else if (typeof textField === "string" && textField.trim()) {
    rawText = textField.trim();
  }

  if (!rawText && !sourceUrl) throw new ApiError(400, "Provide either a file or text content");

  const doc = await db.knowledgeDoc.create({
    data: { tenantId: session.tenantId, title, type, sourceUrl, rawText },
  });

  const chunksIndexed = rawText ? await embedAndStoreDocument(session.tenantId, doc.id, rawText) : 0;

  return NextResponse.json({ doc, chunksIndexed }, { status: 201 });
});
