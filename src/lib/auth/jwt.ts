import jwt from "jsonwebtoken";

export interface SessionPayload {
  userId: string;
  tenantId: string;
  role: "OWNER" | "STAFF";
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "30d" });
}

/** Shape-checked so an admin token (see admin-jwt.ts — same secret, different payload) can't be mistaken for one. */
export function verifySession(token: string): SessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as Record<string, unknown>;
    if (
      typeof decoded.userId !== "string" ||
      typeof decoded.tenantId !== "string" ||
      (decoded.role !== "OWNER" && decoded.role !== "STAFF")
    ) {
      return null;
    }
    return { userId: decoded.userId, tenantId: decoded.tenantId, role: decoded.role };
  } catch {
    return null;
  }
}
