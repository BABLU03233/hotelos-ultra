import { z } from "zod";

export const campaignCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    type: z.string().min(1).max(100),
    messageType: z.enum(["TEXT", "IMAGE", "TEMPLATE"]),
    templateName: z.string().max(200).nullable().optional(),
    metaTemplateId: z.string().nullable().optional(),
    templateVariableValues: z.record(z.string(), z.string()).nullable().optional(),
    body: z.string().max(2000).nullable().optional(),
    mediaUrl: z.string().url().nullable().optional(),
    contactIds: z.array(z.string()).min(1),
    sendPacing: z.enum(["ALL_AT_ONCE", "SPACED"]).optional(),
    // 6h cap — beyond that, an owner should just split into multiple campaigns.
    sendIntervalSeconds: z.number().int().min(1).max(21600).nullable().optional(),
    // When set, the campaign sends automatically once this passes instead
    // of waiting for "Send now" — see sweepDueCampaigns in send.ts.
    scheduledAt: z.string().datetime().nullable().optional(),
  })
  .refine((data) => data.sendPacing !== "SPACED" || !!data.sendIntervalSeconds, {
    message: "sendIntervalSeconds is required when sendPacing is SPACED",
    path: ["sendIntervalSeconds"],
  })
  .refine((data) => !data.scheduledAt || new Date(data.scheduledAt).getTime() > Date.now(), {
    message: "scheduledAt must be in the future",
    path: ["scheduledAt"],
  });
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
