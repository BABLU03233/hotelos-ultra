import { z } from "zod";

export const followUpRuleSchema = z.object({
  order: z.number().int().min(1),
  delayMinutes: z.number().int().min(1),
  action: z.enum(["REMINDER", "OFFER", "PACKAGE", "LAST"]),
  templateName: z.string().max(200).nullable().optional(),
  messageBody: z.string().max(2000).nullable().optional(),
  active: z.boolean().optional(),
  repeatDaily: z.boolean().optional(),
  metaTemplateId: z.string().nullable().optional(),
  templateVariableValues: z.record(z.string(), z.string()).nullable().optional(),
});
export type FollowUpRuleInput = z.infer<typeof followUpRuleSchema>;

export const followUpRuleUpdateSchema = followUpRuleSchema.partial();
