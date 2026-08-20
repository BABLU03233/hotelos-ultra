// Plain client-side types mirroring the API's JSON shape (dates as ISO
// strings) — kept independent of the generated Prisma client so client
// components never need to import server-only code.

export type LeadStatus = "NEW" | "INTERESTED" | "FOLLOW_UP" | "BOOKED" | "CLOSED";
export type BookingStatus = "NONE" | "PENDING" | "CONFIRMED" | "CANCELLED";
export type LeadSource = "DIRECT" | "META_AD" | "COLD_IMPORT";

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
  /** Set while a person explicitly holds the conversation — see lib/crm/handover.ts. */
  handoverAt: string | null;
  handoverByName: string | null;
  handoverReason: string | null;
  /** A receptionist's note for the AI, written when handing the chat back. */
  aiBriefing: string | null;
  followUpDate: string | null;
  followUpNote: string | null;
  notes: string | null;
  tags: string[];
  lastReadAt: string | null;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string } | null;
  leadSource: LeadSource;
  sourceDetail: string | null;
  optedOutAt: string | null;
  updatedAt: string;
  // Only populated by GET /api/contacts (the list endpoint) — a real count
  // of inbound messages since lastReadAt, not just a boolean unread flag.
  unreadCount?: number;
  // Also list-endpoint only. Derived per request from what the guest actually
  // did (see lib/crm/hot-lead.ts), never stored — a stored flag goes stale the
  // moment nobody updates it.
  hotScore?: number;
  hotReasons?: string[];
}

export type MessageDirection = "IN" | "OUT";
export type MessageType = "TEXT" | "IMAGE" | "DOCUMENT" | "LOCATION" | "TEMPLATE" | "INTERACTIVE";
export type MessageStatus = "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "REPLIED";

export interface Message {
  id: string;
  contactId: string;
  direction: MessageDirection;
  type: MessageType;
  content: string | null;
  mediaUrl: string | null;
  mediaId: string | null;
  mediaMimeType: string | null;
  mediaFilename: string | null;
  interactiveId: string | null;
  status: MessageStatus;
  /** Meta's reason for a failed send — see StatusUpdate in whatsapp/webhook.ts. */
  errorCode: number | null;
  errorTitle: string | null;
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
  repeatDaily: boolean;
  metaTemplateId: string | null;
  templateVariableValues: Record<string, string> | null;
}

export type ScheduledFollowUpStatus = "PENDING" | "SENT" | "CANCELLED" | "SKIPPED";

export interface ScheduledFollowUp {
  id: string;
  runAt: string;
  status: ScheduledFollowUpStatus;
  rule: { action: FollowUpAction; messageBody: string | null };
  contact?: { id: string; name: string | null; phone: string };
}

export type StaffNotificationType = "ESCALATION" | "BOOKING" | "REMINDER";

export interface StaffNotification {
  id: string;
  reason: string;
  type: StaffNotificationType;
  resolved: boolean;
  createdAt: string;
  contact: { id: string; name: string | null; phone: string };
}

export type MetaTemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export interface MetaTemplate {
  id: string;
  name: string;
  category: MetaTemplateCategory;
  language: string;
  status: string;
  rejectionReason: string | null;
  metaTemplateId: string | null;
  components: Record<string, unknown>[];
  headerType: string | null;
  headerMediaUrl: string | null;
  bodyVariableSlots: { source: "guest_name" | "hotel_name" | "custom"; label: string }[];
  lastStatusCheckAt: string | null;
  createdAt: string;
}

export type CampaignMessageType = "TEXT" | "IMAGE" | "TEMPLATE";
export type CampaignSendPacing = "ALL_AT_ONCE" | "SPACED";
export type CampaignApproval = "DRAFT" | "PENDING_REVIEW" | "APPROVED" | "REJECTED";

/** One concern raised by the automated pre-review — see lib/campaigns/auto-review.ts. */
export interface CampaignReviewConcern {
  severity: "block" | "warn" | "note";
  issue: string;
  suggestion: string;
}

export interface Campaign {
  id: string;
  name: string;
  type: string;
  messageType: CampaignMessageType;
  templateName: string | null;
  metaTemplateId: string | null;
  templateVariableValues: Record<string, string> | null;
  body: string | null;
  mediaUrl: string | null;
  sendPacing: CampaignSendPacing;
  sendIntervalSeconds: number | null;
  scheduledAt: string | null;
  createdAt: string;
  sentAt: string | null;
  approval: CampaignApproval;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  autoReview: { verdict: string; concerns: CampaignReviewConcern[]; checkedAt: string } | null;
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
  | "FAILED"
  | "CANCELLED";

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
  code: string | null;
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
  aiAgentName: string;
  newLeads: number;
  activeChats: number;
  activeChatsPrev: number;
  bookings: number;
  pendingFollowUps: number;
  aiConversationsToday: number;
  aiConversationsPrev: number;
  aiMessagesToday: number;
  staffMessagesToday: number;
  leadFunnel: Record<LeadStatus, number>;
  leadsBySource: Record<LeadSource, number>;
  messageVolumeTrend: { date: string; inbound: number; ai: number; staff: number }[];
  unresolvedNotificationCount: number;
  recentNotifications: StaffNotification[];
  campaignPerformance: { id: string; name: string; sent: number; replies: number }[];
  setup: {
    hotelProfileComplete: boolean;
    roomCount: number;
    whatsappConnected: boolean;
    faqCount: number;
  };
}

export interface HotelProfile {
  tenantId: string;
  name: string;
  address: string | null;
  googleMapsUrl: string | null;
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
  aiAgentName: string;
  bookingCodePrefix: string | null;
}
