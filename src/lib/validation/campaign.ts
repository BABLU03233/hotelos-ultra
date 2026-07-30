import { z } from "zod";

export const campaignCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  messageType: z.enum(["TEXT", "IMAGE", "TEMPLATE"]),
  templateName: z.string().max(200).nullable().optional(),
  body: z.string().max(2000).nullable().optional(),
  mediaUrl: z.string().url().nullable().optional(),
  contactIds: z.array(z.string()).min(1),
});
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;
