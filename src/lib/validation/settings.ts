import { z } from "zod";

export const hotelProfileSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  checkInTime: z.string().max(20).nullable().optional(),
  checkOutTime: z.string().max(20).nullable().optional(),
  wifiInfo: z.string().max(1000).nullable().optional(),
  parkingInfo: z.string().max(1000).nullable().optional(),
  restaurantInfo: z.string().max(1000).nullable().optional(),
  cancellationPolicy: z.string().max(2000).nullable().optional(),
  refundPolicy: z.string().max(2000).nullable().optional(),
  nearbyAttractions: z.string().max(2000).nullable().optional(),
  businessHours: z.string().max(1000).nullable().optional(),
  aiSystemPrompt: z.string().max(4000).nullable().optional(),
  aiAgentName: z.string().trim().min(1).max(50).optional(),
});
export type HotelProfileInput = z.infer<typeof hotelProfileSchema>;

export const roomSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  description: z.string().max(2000).nullable().optional(),
  price: z.number().int().min(0),
  capacity: z.number().int().min(1),
  amenities: z.array(z.string()).optional(),
  imageUrls: z.array(z.string()).optional(),
});
export const roomUpdateSchema = roomSchema.partial();

export const faqSchema = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
});
export const faqUpdateSchema = faqSchema.partial();

export const offerSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  discount: z.string().max(100).nullable().optional(),
  validFrom: z.string().datetime().nullable().optional(),
  validTo: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
});
export const offerUpdateSchema = offerSchema.partial();

export const staffInviteSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  role: z.enum(["OWNER", "STAFF"]).default("STAFF"),
});

export const staffUpdateSchema = z.object({
  role: z.enum(["OWNER", "STAFF"]).optional(),
  name: z.string().min(1).max(200).optional(),
});

export const whatsappSettingsSchema = z.object({
  phoneNumberId: z.string().min(1),
  wabaId: z.string().min(1).optional(),
  accessToken: z.string().min(1),
});
