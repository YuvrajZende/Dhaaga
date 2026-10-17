import { Google } from "arctic";
import { db } from "@/lib/db";
import { googleTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decryptToken, encryptToken } from "./crypto";

export const GOOGLE_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/gmail.metadata",
  "https://www.googleapis.com/auth/calendar.readonly",
];

// Typed authentication errors
export class AuthError extends Error {
  constructor(message: string, public readonly code: string = "AUTH_ERROR") {
    super(message);
    this.name = "AuthError";
  }
}

export class TokenRevokedError extends AuthError {
  constructor(userId: string) {
    super(`Google OAuth token for user ${userId} has been revoked or is invalid`, "TOKEN_REVOKED");
    this.name = "TokenRevokedError";
  }
}

export class TokenExpiredError extends AuthError {
  constructor(userId: string) {
    super(`Google OAuth token for user ${userId} is expired and cannot be refreshed`, "TOKEN_EXPIRED");
    this.name = "TokenExpiredError";
  }
}

export interface GoogleAccessCredentials {
  accessToken: string;
  userId: string;
}

export function getGoogleOAuthClient(): Google {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/callback";

  if (!clientId || !clientSecret) {
    throw new AuthError(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment variables",
      "CONFIG_MISSING"
    );
  }

  return new Google(clientId, clientSecret, redirectUri);
}

/**
 * Centralized Google OAuth token management:
 * - Fetches valid access token
 * - Decrypts stored refresh token only when needed
 * - Auto-refreshes expired access tokens
 * - Re-seals rotated refresh tokens back to the database
 * - Never stores plaintext tokens
 */
export async function getValidAccessToken(userId: string): Promise<GoogleAccessCredentials> {
  if (!userId) {
    throw new AuthError("userId is required to get valid access token", "INVALID_USER_ID");
  }

  const [tokenRow] = await db
    .select()
    .from(googleTokens)
    .where(eq(googleTokens.userId, userId))
    .limit(1);

  if (!tokenRow) {
    throw new AuthError(`No Google tokens found for user ${userId}`, "TOKENS_NOT_FOUND");
  }

  const now = new Date();
  const isExpired = tokenRow.expiresAt <= new Date(now.getTime() + 60 * 1000); // 1-minute buffer

  if (!isExpired) {
    return {
      accessToken: decryptToken(tokenRow.accessToken),
      userId,
    };
  }

  // Token is expired — decrypt refresh token and request new credentials
  let refreshToken: string;
  try {
    refreshToken = decryptToken(tokenRow.refreshToken);
  } catch (err) {
    throw new AuthError(`Failed to decrypt refresh token for user ${userId}: ${err instanceof Error ? err.message : String(err)}`, "DECRYPT_FAILED");
  }

  if (!refreshToken) {
    throw new TokenRevokedError(userId);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new AuthError("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET", "CONFIG_MISSING");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    if (response.status === 400 || response.status === 401) {
      if (errBody.includes("invalid_grant")) {
        throw new TokenRevokedError(userId);
      }
    }
    throw new AuthError(`Google token refresh failed (${response.status}): ${errBody}`, "REFRESH_FAILED");
  }

  const data = await response.json();
  const newAccessToken: string = data.access_token;
  const expiresIn: number = data.expires_in || 3600;

  // Re-seal and persist the refreshed access token
  const sealedAccessToken = encryptToken(newAccessToken);
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000);

  const updateData: {
    accessToken: Buffer;
    expiresAt: Date;
    updatedAt: Date;
    refreshToken?: Buffer;
  } = {
    accessToken: sealedAccessToken,
    expiresAt: newExpiresAt,
    updatedAt: new Date(),
  };

  // If Google rotated the refresh token, re-seal and update it
  if (data.refresh_token) {
    updateData.refreshToken = encryptToken(data.refresh_token);
  }

  await db
    .update(googleTokens)
    .set(updateData)
    .where(eq(googleTokens.userId, userId));

  return {
    accessToken: newAccessToken,
    userId,
  };
}

/**
 * Authenticated Google API fetch with 401 auto-retry and 429 rate limit backoff.
 */
export async function googleApiFetch(
  userId: string,
  url: string,
  options: RequestInit = {},
  retries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { accessToken } = await getValidAccessToken(userId);

    const res = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
    });

    // 401: Token might be invalidated on Google's side -> force refresh and retry once
    if (res.status === 401 && attempt === 0) {
      await db
        .update(googleTokens)
        .set({ expiresAt: new Date(0) })
        .where(eq(googleTokens.userId, userId));
      continue;
    }

    // 429: Rate limited -> exponential backoff if retries left
    if (res.status === 429 && attempt < retries) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const delayMs = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1000
        : Math.min(10000, 1000 * Math.pow(2, attempt));
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    return res;
  }

  throw new Error(`googleApiFetch exceeded maximum retries for ${url}`);
}
