export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Swappable chat-completion backend — default implementation is Anthropic (see anthropic-provider.ts). */
export interface AIProvider {
  chat(params: { systemPrompt: string; messages: ChatMessage[] }): Promise<string>;
}

/**
 * Swappable embeddings backend, kept separate from AIProvider since
 * Anthropic has no embeddings endpoint (see embeddings.ts). `type`
 * distinguishes indexing knowledge-base content ("document") from
 * embedding a guest's live message for retrieval ("query") — several
 * embedding APIs (Voyage, Cohere) produce better results when told which
 * side of the search a given text is; providers that don't support the
 * distinction can just ignore it.
 */
export interface EmbeddingProvider {
  embed(texts: string[], type?: "document" | "query"): Promise<number[][]>;
}
