import { prisma } from "@/lib/prisma";
import { voyageEmbeddingProvider } from "./embeddings";
import { geminiEmbeddingProvider } from "./gemini-embedding-provider";
import { EmbeddingProvider } from "./provider";

// Unlike the chat providers (pipeline.ts), this is a single pick, NOT a
// per-call fallback chain: embeddings from different models live in
// different vector spaces, so a document indexed with one provider and a
// query embedded with another would produce meaningless similarity scores
// even though both happen to output 1024 dimensions. Prefers Voyage (the
// original/most-tested path) when configured, otherwise falls back to the
// free Gemini embeddings once and stays on it consistently.
const embeddingProvider: EmbeddingProvider = process.env.VOYAGE_API_KEY ? voyageEmbeddingProvider : geminiEmbeddingProvider;

/** True once either embedding provider has a key configured — kept next to the selection above so the two can't drift apart. */
export function hasEmbeddingProvider(): boolean {
  return !!(process.env.VOYAGE_API_KEY || process.env.GEMINI_API_KEY);
}

/** Simple fixed-size character chunking with overlap — fine for an MVP; swap for a token-aware splitter later if needed. */
export function chunkText(text: string, chunkSize = 1000, overlap = 150): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    const end = Math.min(start + chunkSize, cleaned.length);
    chunks.push(cleaned.slice(start, end));
    if (end === cleaned.length) break;
    start = end - overlap;
  }
  return chunks;
}

function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/** Chunks `text`, embeds each chunk, and stores them against `docId`. The KnowledgeDoc row itself must already exist. */
export async function embedAndStoreDocument(tenantId: string, docId: string, text: string): Promise<number> {
  const chunks = chunkText(text);
  if (!chunks.length) return 0;

  const vectors = await embeddingProvider.embed(chunks, "document");

  for (let i = 0; i < chunks.length; i++) {
    const chunk = await prisma.knowledgeChunk.create({
      data: { tenantId, docId, content: chunks[i] },
    });
    await prisma.$executeRaw`
      UPDATE "KnowledgeChunk" SET embedding = ${toVectorLiteral(vectors[i])}::vector WHERE id = ${chunk.id}
    `;
  }

  return chunks.length;
}

interface RetrievedChunk {
  content: string;
  distance: number;
}

/** Returns the topK knowledge chunks (this tenant only) most relevant to `query`, ordered by cosine distance. */
export async function retrieveRelevantChunks(tenantId: string, query: string, topK = 5): Promise<string[]> {
  // Nothing indexed means there is nothing to retrieve, and embedding the
  // query first would be a network round-trip to find that out.
  //
  // This sat on the critical path of every AI reply: generateReply awaits
  // retrieval before it can build the prompt, so a tenant with an empty
  // knowledge base — the live one included, at zero chunks — paid an
  // embeddings API call on every single message purely to search an empty
  // table. Measured at roughly 500ms against a Groq reply of 477-770ms, so
  // it was very nearly doubling the guest's wait for no possible benefit.
  //
  // A local indexed EXISTS is sub-millisecond, and deliberately not cached:
  // the moment a hotel uploads its first document, retrieval must start
  // working on the next message rather than whenever a TTL happened to
  // expire. The check is cheap enough that correctness costs nothing here.
  const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM "KnowledgeChunk" WHERE "tenantId" = ${tenantId} AND embedding IS NOT NULL
    ) AS exists
  `;
  if (!exists) return [];

  const [queryVector] = await embeddingProvider.embed([query], "query");
  const rows = await prisma.$queryRaw<RetrievedChunk[]>`
    SELECT content, embedding <=> ${toVectorLiteral(queryVector)}::vector AS distance
    FROM "KnowledgeChunk"
    WHERE "tenantId" = ${tenantId} AND embedding IS NOT NULL
    ORDER BY distance ASC
    LIMIT ${topK}
  `;
  return rows.map((r) => r.content);
}
