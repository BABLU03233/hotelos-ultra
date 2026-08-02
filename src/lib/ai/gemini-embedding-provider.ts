import { GoogleGenAI } from "@google/genai";
import { EmbeddingProvider } from "./provider";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

/**
 * Free-tier alternative to voyageEmbeddingProvider. gemini-embedding-001
 * supports requesting a specific output size (Matryoshka truncation) —
 * outputDimensionality: 1024 matches the `vector(1024)` column exactly, so
 * this is a drop-in swap with no schema migration (verified directly
 * against the API before wiring this in).
 */
export const geminiEmbeddingProvider: EmbeddingProvider = {
  async embed(texts, type = "document") {
    const response = await getClient().models.embedContent({
      model: "gemini-embedding-001",
      contents: texts,
      config: {
        outputDimensionality: 1024,
        taskType: type === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
      },
    });
    return (response.embeddings ?? []).map((e) => e.values ?? []);
  },
};
