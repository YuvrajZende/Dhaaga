import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { generateState, generateCodeVerifier } from "arctic";
import { getGoogleOAuthClient, GOOGLE_SCOPES } from "@/lib/auth/google";

export async function GET() {
  try {
    const google = getGoogleOAuthClient();
    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    const url = google.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);
    // Request offline access so Google returns a refresh token
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    const cookieStore = await cookies();
    cookieStore.set("google_oauth_state", state, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10, // 10 minutes
      sameSite: "lax",
    });

    cookieStore.set("google_code_verifier", codeVerifier, {
      path: "/",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 10,
      sameSite: "lax",
    });

    return NextResponse.redirect(url.toString());
  } catch (error) {
    console.error("Google OAuth initialization error:", error);
    return NextResponse.json(
      { error: "Failed to initiate Google authentication" },
      { status: 500 }
    );
  }
}
