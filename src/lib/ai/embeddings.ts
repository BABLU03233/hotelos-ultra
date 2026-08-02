import { EmbeddingProvider } from "./provider";

/**
 * Anthropic has no first-party embeddings endpoint, so RAG embeddings use
 * Voyage AI — Anthropic's own recommended embeddings partner — behind the
 * same swappable interface. voyage-3 outputs 1024-dim vectors, matching the
 * `vector(1024)` column in prisma/schema.prisma; changing VOYAGE_EMBEDDING_MODEL
 * to a different dimension requires a matching schema migration.
 */
export const voyageEmbeddingProvider: EmbeddingProvider = {
  async embed(texts, type = "document") {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) throw new Error("VOYAGE_API_KEY is not set");

    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: texts,
        model: process.env.VOYAGE_EMBEDDING_MODEL || "voyage-3",
        input_type: type,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      throw new Error(`Voyage embeddings request failed (${res.status}): ${await res.text()}`);
    }

    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  },
};
