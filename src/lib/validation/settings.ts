import { z } from "zod";

export const hotelProfileSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).nullable().optional(),
  googleMapsUrl: z.string().max(500).nullable().optional(),
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
  /** The number guests should ring — often reception, not the WhatsApp line. */
  contactPhone: z.string().trim().max(30).nullable().optional(),
  bookingCodePrefix: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? null : val),
    z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/).nullable().optional()
  ),
});
export type HotelProfileInput = z.infer<typeof hotelProfileSchema>;

export const roomSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(100),
  description: z.string().max(2000).nullable().optional(),
  price: z.number().int().min(0),
  capacity: z.number().int().min(1),
  /** How many of this room type exist. Null = inventory is not a constraint. */
  unitCount: z.number().int().min(1).max(1000).nullable().optional(),
  /**
   * Per-party-size rates, e.g. [{ guests: 1, price: 999 }].
   *
   * Capped and bounded because this is operator-editable JSON that the
   * assistant quotes to guests verbatim — a bad row here becomes a wrong price
   * in a real conversation.
   */
  occupancyPrices: z
    .array(z.object({ guests: z.number().int().min(1).max(20), price: z.number().int().min(0) }))
    .max(20)
    .nullable()
    .optional(),
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
  code: z.string().max(50).nullable().optional(),
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
