import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { AdminSessionPayload, verifyAdminSession } from "./admin-jwt";

export const ADMIN_SESSION_COOKIE = "hotelos_admin_session";

export function getAdminSessionFromRequest(req: NextRequest): AdminSessionPayload | null {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(token);
}

export async function getAdminSessionFromCookies(): Promise<AdminSessionPayload | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifyAdminSession(token);
}
