/**
 * Recommendations API Route.
 * Handles creating, updating, viewing, and deleting user place recommendations.
 * Enforces explicit sharing controls, private note isolation, and authenticated user boundaries.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { SaveRecommendationInputSchema } from "@/lib/places/types";
import { saveRecommendation, getEntityWithCircle, deleteRecommendation } from "@/lib/places/repo";

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const validation = SaveRecommendationInputSchema.safeParse(body);
  if (!validation.success) {
    return NextResponse.json(
      { error: "Validation failed", details: validation.error.format() },
      { status: 400 }
    );
  }

  try {
    // Crucial security invariant: never accept userId from client payload. Always use session user.
    const saved = await saveRecommendation(user.id, validation.data);
    return NextResponse.json({ success: true, recommendation: saved });
  } catch (err) {
    console.error("Failed to save recommendation:", err);
    return NextResponse.json(
      { error: "Failed to save recommendation. Please try again." },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entityId");

  if (!entityId) {
    return NextResponse.json({ error: "Missing entityId query parameter" }, { status: 400 });
  }

  try {
    const entity = await getEntityWithCircle(user.id, entityId);
    if (!entity) {
      return NextResponse.json({ error: "Place not found" }, { status: 404 });
    }

    return NextResponse.json({ entity });
  } catch (err) {
    console.error("Failed to fetch entity details:", err);
    return NextResponse.json(
      { error: "Failed to load place details." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const entityId = searchParams.get("entityId");

  if (!entityId) {
    return NextResponse.json({ error: "Missing entityId query parameter" }, { status: 400 });
  }

  try {
    await deleteRecommendation(user.id, entityId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete recommendation:", err);
    return NextResponse.json(
      { error: "Failed to delete recommendation." },
      { status: 500 }
    );
  }
}
