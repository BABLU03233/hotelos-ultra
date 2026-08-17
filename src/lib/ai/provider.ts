export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatParams {
  systemPrompt: string;
  messages: ChatMessage[];
  /**
   * Cancels this attempt when the fallback chain's overall time budget runs
   * out (see fallback-provider.ts). A provider's own timeout still applies —
   * this only ever cuts an attempt SHORTER, never extends it.
   *
   * Honouring it is optional: the chain enforces its deadline regardless.
   * What honouring it buys is releasing the socket immediately instead of
   * leaving an abandoned request running to its own timeout, which on a
   * 1-vCPU box with five concurrent jobs is worth having.
   */
  signal?: AbortSignal;
}

/** Swappable chat-completion backend — default implementation is Anthropic (see anthropic-provider.ts). */
export interface AIProvider {
  /** For fallback-chain logging (see fallback-provider.ts) — which provider/model actually answered, and how long it took. */
  name?: string;
  chat(params: ChatParams): Promise<string>;
}

/**
 * A provider's own timeout, narrowed by the chain's remaining budget when
 * there is one. Whichever fires first wins, so a provider can never outlive
 * the deadline the chain is holding it to.
 */
export function timeoutSignal(ms: number, external?: AbortSignal): AbortSignal {
  const own = AbortSignal.timeout(ms);
  return external ? AbortSignal.any([own, external]) : own;
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
