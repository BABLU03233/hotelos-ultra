import "dotenv/config";
import { PrismaClient } from "./src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const { generateReply } = await import("./src/lib/ai/pipeline");
  const tenant = await prisma.tenant.findFirst({ where: { name: "Hotel Ivory Towers" } });
  if (!tenant) throw new Error("tenant not found");

  const cases: { label: string; msg: string; ctx: Parameters<typeof generateReply>[3] }[] = [
    {
      label: "Meta ad, first message",
      msg: "Hi I saw your ad for weekend offer",
      ctx: { isFirstReply: true, daysSinceLastInbound: null, leadSource: "META_AD", sourceDetail: "Weekend Getaway Offer" },
    },
    {
      label: "Direct, first message",
      msg: "Hello, do you have rooms available?",
      ctx: { isFirstReply: true, daysSinceLastInbound: null, leadSource: "DIRECT", sourceDetail: null },
    },
    {
      label: "Cold import, first message",
      msg: "Hi",
      ctx: { isFirstReply: true, daysSinceLastInbound: null, leadSource: "COLD_IMPORT", sourceDetail: null },
    },
    {
      label: "Mid-conversation, simple question",
      msg: "what time is checkout",
      ctx: { isFirstReply: false, daysSinceLastInbound: 0, leadSource: "DIRECT", sourceDetail: null },
    },
  ];

  for (const c of cases) {
    const result = await generateReply(tenant.id, c.msg, [], c.ctx);
    console.log("---", c.label, "---");
    console.log("Guest:", c.msg);
    console.log("Anushka:", result.reply);
    console.log("Length (chars):", result.reply.length, "| sentences (approx):", (result.reply.match(/[.!?]/g) || []).length);
  }
}

main().finally(() => prisma.$disconnect());
