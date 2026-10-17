import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getGoogleOAuthClient } from "@/lib/auth/google";
import { encryptToken } from "@/lib/auth/crypto";
import { setSessionCookie } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { users, googleTokens, sources } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

interface GoogleUserInfo {
  sub: string;
  name: string;
  email: string;
  picture?: string;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("google_oauth_state")?.value;
  const codeVerifier = cookieStore.get("google_code_verifier")?.value;

  if (!code || !state || !storedState || !codeVerifier || state !== storedState) {
    return NextResponse.json(
      { error: "Invalid OAuth state or missing authorization code" },
      { status: 400 }
    );
  }

  try {
    const google = getGoogleOAuthClient();
    const tokens = await google.validateAuthorizationCode(code, codeVerifier);

    const accessToken = tokens.accessToken();
    const refreshToken = tokens.hasRefreshToken() ? tokens.refreshToken() : null;

    // Fetch Google User Profile
    const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!userInfoRes.ok) {
      throw new Error("Failed to fetch user profile from Google");
    }

    const userInfo: GoogleUserInfo = await userInfoRes.json();

    // 1. Upsert User
    const [userRecord] = await db
      .insert(users)
      .values({
        googleSub: userInfo.sub,
        email: userInfo.email.toLowerCase(),
        name: userInfo.name,
        avatarUrl: userInfo.picture,
      })
      .onConflictDoUpdate({
        target: users.googleSub,
        set: {
          name: userInfo.name,
          avatarUrl: userInfo.picture,
        },
      })
      .returning();

    // 2. Encrypt & Upsert Google Tokens
    const sealedAccessToken = encryptToken(accessToken);
    // If Google didn't return a new refresh token, preserve existing or seal empty buffer
    const sealedRefreshToken = refreshToken
      ? encryptToken(refreshToken)
      : Buffer.alloc(0);

    const expiresAt = tokens.accessTokenExpiresAt();

    await db
      .insert(googleTokens)
      .values({
        userId: userRecord.id,
        accessToken: sealedAccessToken,
        refreshToken: sealedRefreshToken,
        scope: tokens.scopes().join(" "),
        expiresAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: googleTokens.userId,
        set: {
          accessToken: sealedAccessToken,
          ...(refreshToken ? { refreshToken: sealedRefreshToken } : {}),
          scope: tokens.scopes().join(" "),
          expiresAt,
          updatedAt: new Date(),
        },
      });

    // 3. Initialize default source toggles if they don't exist
    for (const type of ["contacts", "gmail", "calendar"] as const) {
      await db
        .insert(sources)
        .values({
          userId: userRecord.id,
          type,
          status: "active",
        })
        .onConflictDoNothing();
    }

    // 4. Set Session Cookie
    await setSessionCookie({
      id: userRecord.id,
      email: userRecord.email,
      name: userRecord.name,
      avatarUrl: userRecord.avatarUrl,
    });

    // 5. Clean up temporary OAuth cookies
    cookieStore.delete("google_oauth_state");
    cookieStore.delete("google_code_verifier");

    // Redirect to onboarding/sync screen
    return NextResponse.redirect(new URL("/onboarding", request.url));
  } catch (error) {
    console.error("OAuth callback failure:", error);
    return NextResponse.json(
      { error: "Authentication failed. Please try again." },
      { status: 500 }
    );
  }
}
