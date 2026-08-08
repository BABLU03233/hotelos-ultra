import "dotenv/config";

const MODELS = (process.env.OPENROUTER_FREE_MODELS?.split(",").map((m) => m.trim()).filter(Boolean)) ?? [
  "nvidia/nemotron-nano-9b-v2:free",
  "google/gemma-4-26b-a4b-it:free",
  "poolside/laguna-xs-2.1:free",
  "nvidia/nemotron-nano-12b-v2-vl:free",
];

async function testModel(model: string) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const started = Date.now();
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://hotelosultra.online",
      "X-Title": "HotelOS Ultra",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024, // matches openrouter-provider.ts — a lower cap here previously made reasoning models look empty when they'd actually have answered
      messages: [
        { role: "system", content: "You are a friendly hotel WhatsApp concierge. Reply in one short sentence." },
        { role: "user", content: "Hi, do you have a room for this weekend?" },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const ms = Date.now() - started;
  if (!res.ok) {
    console.log(`FAIL  ${model} (${ms}ms) — ${res.status} ${await res.text()}`);
    return;
  }
  const json = (await res.json()) as { choices: { message: { content: string } }[] };
  const reply = json.choices[0]?.message?.content ?? "";
  if (!reply.trim()) {
    console.log(`EMPTY ${model} (${ms}ms) — 200 OK but blank content`);
    return;
  }
  console.log(`OK    ${model} (${ms}ms) — "${reply.slice(0, 80)}"`);
}

async function main() {
  for (const model of MODELS) {
    await testModel(model).catch((err) => console.log(`ERROR ${model} — ${err instanceof Error ? err.message : err}`));
  }
}

main();
