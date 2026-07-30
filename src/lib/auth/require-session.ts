import { NextRequest } from "next/server";
import { forbidden, unauthorized } from "../api-error";
import { tenantDb } from "../tenant";
import { SessionPayload } from "./jwt";
import { getSessionFromRequest } from "./session";

export function requireSession(req: NextRequest): SessionPayload {
  const session = getSessionFromRequest(req);
  if (!session) throw unauthorized();
  return session;
}

/** Convenience for the common case: a route needs both the session and a tenant-scoped db. */
export function requireTenantDb(req: NextRequest) {
  const session = requireSession(req);
  return { session, db: tenantDb(session.tenantId) };
}

export function requireOwner(req: NextRequest): SessionPayload {
  const session = requireSession(req);
  if (session.role !== "OWNER") throw forbidden("Owner access required");
  return session;
}
