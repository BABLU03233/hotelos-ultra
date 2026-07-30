import { z } from "zod";

export const contactUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  leadStatus: z.enum(["NEW", "INTERESTED", "FOLLOW_UP", "BOOKED", "CLOSED"]).optional(),
  bookingStatus: z.enum(["NONE", "PENDING", "CONFIRMED", "CANCELLED"]).optional(),
  notes: z.string().max(5000).nullable().optional(),
  followUpDate: z.string().datetime().nullable().optional(),
  aiPaused: z.boolean().optional(),
});
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;

export const contactReplySchema = z.object({
  text: z.string().min(1).max(4096),
});

export const contactListQuerySchema = z.object({
  leadStatus: z.enum(["NEW", "INTERESTED", "FOLLOW_UP", "BOOKED", "CLOSED"]).optional(),
  search: z.string().optional(),
});
