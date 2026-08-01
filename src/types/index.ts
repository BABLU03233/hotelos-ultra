// Plain client-side types mirroring the API's JSON shape (dates as ISO
// strings) — kept independent of the generated Prisma client so client
// components never need to import server-only code.

export type LeadStatus = "NEW" | "INTERESTED" | "FOLLOW_UP" | "BOOKED" | "CLOSED";
export type BookingStatus = "NONE" | "PENDING" | "CONFIRMED" | "CANCELLED";

export interface Contact {
  id: string;
  name: string | null;
  phone: string;
  whatsappNumber: string;
  createdAt: string;
  lastMessage: string | null;
  lastInboundAt: string | null;
  leadStatus: LeadStatus;
  bookingStatus: BookingStatus;
  aiSummary: string | null;
  aiPaused: boolean;
  followUpDate: string | null;
  notes: string | null;
  tags: string[];
  lastReadAt: string | null;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string } | null;
  updatedAt: string;
}

export type MessageDirection = "IN" | "OUT";
export type MessageType = "TEXT" | "IMAGE" | "DOCUMENT" | "LOCATION" | "TEMPLATE";
export type MessageStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "REPLIED";

export interface Message {
  id: string;
  contactId: string;
  direction: MessageDirection;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null;
  status: MessageStatus;
  senderUserId: string | null;
  createdAt: string;
}

export type FollowUpAction = "REMINDER" | "OFFER" | "PACKAGE" | "LAST";

export interface FollowUpRule {
  id: string;
  order: number;
  delayMinutes: number;
  action: FollowUpAction;
  templateName: string | null;
  messageBody: string | null;
  active: boolean;
}

export type ScheduledFollowUpStatus = "PENDING" | "SENT" | "CANCELLED" | "SKIPPED";

export interface ScheduledFollowUp {
  id: string;
  runAt: string;
  status: ScheduledFollowUpStatus;
  rule: { action: FollowUpAction; messageBody: string | null };
  contact?: { id: string; name: string | null; phone: string };
}

export interface StaffNotification {
  id: string;
  reason: string;
  resolved: boolean;
  createdAt: string;
  contact: { id: string; name: string | null; phone: string };
}

export type CampaignMessageType = "TEXT" | "IMAGE" | "TEMPLATE";

export interface Campaign {
  id: string;
  name: string;
  type: string;
  messageType: CampaignMessageType;
  templateName: string | null;
  body: string | null;
  mediaUrl: string | null;
  createdAt: string;
  sentAt: string | null;
  _count?: { recipients: number };
}

export interface CampaignReport {
  totalContacts: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  replies: number;
  interested: number;
  booked: number;
  failed: number;
}

export type CampaignRecipientStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "REPLIED"
  | "INTERESTED"
  | "BOOKED"
  | "FAILED";

export interface CampaignRecipient {
  id: string;
  status: CampaignRecipientStatus;
  sentAt: string | null;
  contact: { id: string; name: string | null; phone: string; leadStatus: LeadStatus };
}

export interface Room {
  id: string;
  name: string;
  type: string;
  description: string | null;
  price: number;
  capacity: number;
  amenities: string[];
  imageUrls: string[];
}

export interface Faq {
  id: string;
  question: string;
  answer: string;
}

export interface Offer {
  id: string;
  title: string;
  description: string | null;
  discount: string | null;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "STAFF";
  createdAt?: string;
}

export type KnowledgeDocType = "TEXT" | "PDF" | "IMAGE" | "BROCHURE" | "FAQ";

export interface KnowledgeDoc {
  id: string;
  title: string;
  type: KnowledgeDocType;
  sourceUrl: string | null;
  createdAt: string;
  _count?: { chunks: number };
}

export type SubscriptionStatus = "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELLED";

export interface AdminTenantSummary {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: SubscriptionStatus;
  planFeeInPaise: number;
  createdAt: string;
  owner: { name: string; email: string } | null;
  staffCount: number;
  contactCount: number;
  bookedCount: number;
  whatsappConnected: boolean;
}

export interface DashboardMetrics {
  newLeads: number;
  activeChats: number;
  activeChatsPrev: number;
  bookings: number;
  pendingFollowUps: number;
  aiConversationsToday: number;
  aiConversationsPrev: number;
  leadFunnel: Record<LeadStatus, number>;
  messageVolumeTrend: { date: string; inbound: number; ai: number; staff: number }[];
  unresolvedNotificationCount: number;
  recentNotifications: StaffNotification[];
  campaignPerformance: { id: string; name: string; sent: number; replies: number }[];
}

export interface HotelProfile {
  tenantId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  wifiInfo: string | null;
  parkingInfo: string | null;
  restaurantInfo: string | null;
  cancellationPolicy: string | null;
  refundPolicy: string | null;
  nearbyAttractions: string | null;
  businessHours: string | null;
  aiSystemPrompt: string | null;
}
