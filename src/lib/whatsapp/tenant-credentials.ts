import { decryptSecret } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";
import { WhatsAppCredentials } from "./client";

export async function getWhatsAppCredentials(tenantId: string): Promise<WhatsAppCredentials | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant?.whatsappPhoneNumberId || !tenant.whatsappAccessToken) return null;
  return {
    phoneNumberId: tenant.whatsappPhoneNumberId,
    accessToken: decryptSecret(tenant.whatsappAccessToken),
    wabaId: tenant.whatsappWabaId ?? undefined,
  };
}

/** Used by the webhook to map an inbound payload's phone_number_id to a tenant. */
export function resolveTenantByPhoneNumberId(phoneNumberId: string) {
  return prisma.tenant.findUnique({ where: { whatsappPhoneNumberId: phoneNumberId } });
}
