import { cookies } from "next/headers";
import crypto from "crypto";

const SESSION_COOKIE_NAME = "happenstance_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
}

function getSessionSecret(): string {
  return process.env.SESSION_SECRET || "fallback-secret-at-least-32-chars-long-development";
}

/**
 * Creates an HMAC signed session token containing the user payload and expiry.
 */
export function createSessionToken(user: SessionUser): string {
  const secret = getSessionSecret();
  const payload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url");

  return `${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes the session token.
 */
export function verifySessionToken(token: string): SessionUser | null {
  try {
    const [payloadB64, signature] = token.split(".");
    if (!payloadB64 || !signature) return null;

    const secret = getSessionSecret();
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(payloadB64)
      .digest("base64url");

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }

    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      avatarUrl: payload.avatarUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Sets the httpOnly session cookie in Next.js 15.
 */
export async function setSessionCookie(user: SessionUser) {
  const cookieStore = await cookies();
  const token = createSessionToken(user);

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/**
 * Reads the current session user from the cookie.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);

  if (!sessionCookie?.value) {
    return null;
  }

  return verifySessionToken(sessionCookie.value);
}

/**
 * Clears the session cookie.
 */
export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}
