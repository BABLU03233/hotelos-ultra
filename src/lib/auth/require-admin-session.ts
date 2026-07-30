import { NextRequest } from "next/server";
import { unauthorized } from "../api-error";
import { AdminSessionPayload } from "./admin-jwt";
import { getAdminSessionFromRequest } from "./admin-session";

export function requireAdminSession(req: NextRequest): AdminSessionPayload {
  const session = getAdminSessionFromRequest(req);
  if (!session) throw unauthorized();
  return session;
}
