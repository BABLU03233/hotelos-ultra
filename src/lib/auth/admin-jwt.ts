import jwt from "jsonwebtoken";

export interface AdminSessionPayload {
  adminId: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
}

export function signAdminSession(payload: AdminSessionPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "30d" });
}

/** Structurally distinct from a tenant SessionPayload (no tenantId/role) — a
 *  forged/reused tenant token simply won't verify as an admin one. */
export function verifyAdminSession(token: string): AdminSessionPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret()) as Record<string, unknown>;
    if (typeof decoded.adminId !== "string") return null;
    return { adminId: decoded.adminId };
  } catch {
    return null;
  }
}
