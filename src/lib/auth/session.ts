import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { SessionPayload, verifySession } from "./jwt";

export const SESSION_COOKIE = "hotelos_session";

/** For use inside Route Handlers, which receive a NextRequest directly. */
export function getSessionFromRequest(req: NextRequest): SessionPayload | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

/** For use inside Server Components/layouts. */
export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
