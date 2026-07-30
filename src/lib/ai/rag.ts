import { prisma } from "@/lib/prisma";
import { voyageEmbeddingProvider } from "./embeddings";
import { EmbeddingProvider } from "./provider";

const embeddingProvider: EmbeddingProvider = voyageEmbeddingProvider;

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
