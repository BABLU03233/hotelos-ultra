import { z } from "zod";

const bodyVariableSlotSchema = z.object({
  source: z.enum(["guest_name", "hotel_name", "custom"]),
  label: z.string().max(60),
});

const buttonSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("QUICK_REPLY"), text: z.string().min(1).max(25) }),
  z.object({ type: z.literal("URL"), text: z.string().min(1).max(25), url: z.string().url().max(2000) }),
  z.object({ type: z.literal("PHONE_NUMBER"), text: z.string().min(1).max(25), phoneNumber: z.string().min(1).max(20) }),
  z.object({ type: z.literal("COPY_CODE"), example: z.string().min(1).max(20) }),
]);

export const metaTemplateSchema = z
  .object({
    name: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, and underscores only"),
    category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
    language: z.string().min(2).max(10),
    // Header text is deliberately static (no {{variables}}) in v1 — keeps the
    // builder and send-time resolution simple; body variables cover the
    // personalization/offer-value cases that actually matter.
    header: z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("none") }),
        z.object({ type: z.literal("text"), text: z.string().min(1).max(60) }),
        z.object({ type: z.literal("image") }),
      ])
      .default({ type: "none" }),
    bodyText: z.string().min(1).max(1024),
    bodyVariableSlots: z.array(bodyVariableSlotSchema).max(20).default([]),
    footerText: z.string().max(60).nullable().optional(),
    buttons: z.array(buttonSchema).max(10).default([]),
  })
  .superRefine((data, ctx) => {
    const placeholderCount = new Set(Array.from(data.bodyText.matchAll(/\{\{(\d+)\}\}/g)).map((m) => m[1])).size;
    if (placeholderCount !== data.bodyVariableSlots.length) {
      ctx.addIssue({
        code: "custom",
        path: ["bodyVariableSlots"],
        message: `Body has ${placeholderCount} {{variable}} placeholder(s) but ${data.bodyVariableSlots.length} value(s) are configured`,
      });
    }

    const quickReplyCount = data.buttons.filter((b) => b.type === "QUICK_REPLY").length;
    const urlCount = data.buttons.filter((b) => b.type === "URL").length;
    const phoneCount = data.buttons.filter((b) => b.type === "PHONE_NUMBER").length;
    const copyCodeCount = data.buttons.filter((b) => b.type === "COPY_CODE").length;
    if (urlCount > 2) ctx.addIssue({ code: "custom", path: ["buttons"], message: "Meta allows at most 2 URL buttons per template" });
    if (phoneCount > 1) ctx.addIssue({ code: "custom", path: ["buttons"], message: "Meta allows at most 1 phone number button per template" });
    if (copyCodeCount > 1) ctx.addIssue({ code: "custom", path: ["buttons"], message: "Meta allows at most 1 copy code button per template" });

    // Quick-reply buttons must form a contiguous prefix or suffix of the
    // button list — Meta rejects an interleaved arrangement.
    if (quickReplyCount > 0 && quickReplyCount < data.buttons.length) {
      const isQuickReply = data.buttons.map((b) => b.type === "QUICK_REPLY");
      const prefix = isQuickReply.slice(0, quickReplyCount).every(Boolean);
      const suffix = isQuickReply.slice(-quickReplyCount).every(Boolean);
      if (!prefix && !suffix) {
        ctx.addIssue({
          code: "custom",
          path: ["buttons"],
          message: "Quick-reply buttons must all come before or all come after the other buttons, not mixed in between",
        });
      }
    }
  });

export type MetaTemplateInput = z.infer<typeof metaTemplateSchema>;
