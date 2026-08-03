/** Transcribes a WhatsApp voice note so Anushka can react to it like any other text message. */
export async function transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");

  const form = new FormData();
  form.append("model", "whisper-large-v3-turbo");
  // Auto-detects language — guests may send voice notes in English, Hindi, Telugu, etc.
  form.append("file", new Blob([new Uint8Array(buffer)], { type: mimeType || "audio/ogg" }), "voice-note.ogg");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`Groq transcription failed (${res.status}): ${await res.text()}`);
  }

  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}
