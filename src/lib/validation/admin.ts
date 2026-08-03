import { z } from "zod";

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const adminCreateTenantSchema = z.object({
  hotelName: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
  ownerEmail: z.string().trim().toLowerCase().email(),
  ownerPassword: z.string().min(8).max(200),
});
export type AdminCreateTenantInput = z.infer<typeof adminCreateTenantSchema>;

export const adminUpdateTenantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  subscriptionStatus: z.enum(["TRIAL", "ACTIVE", "PAST_DUE", "CANCELLED"]).optional(),
  planFeeInPaise: z.number().int().min(0).optional(),
});

export const adminChangePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
export type AdminChangePasswordInput = z.infer<typeof adminChangePasswordSchema>;
