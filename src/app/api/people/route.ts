import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { importPersonalContacts, extractCleanTags } from "@/lib/import/personal";
import { db } from "@/lib/db";
import { people } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.toLowerCase().trim();

    const userPeople = await db
      .select({
        id: people.id,
        displayName: people.displayName,
        title: people.title,
        company: people.company,
        location: people.location,
        headline: people.headline,
        avatarUrl: people.avatarUrl,
        bio: people.bio,
        tags: people.tags,
        primaryEmail: people.primaryEmail,
        createdAt: people.createdAt,
        updatedAt: people.updatedAt,
      })
      .from(people)
      .where(eq(people.ownerUserId, user.id))
      .orderBy(desc(people.updatedAt));

    const filtered = q
      ? userPeople.filter((p) => {
          const matchesName = p.displayName?.toLowerCase().includes(q);
          const matchesTitle = p.title?.toLowerCase().includes(q);
          const matchesCompany = p.company?.toLowerCase().includes(q);
          const matchesLocation = p.location?.toLowerCase().includes(q);
          const matchesBio = p.bio?.toLowerCase().includes(q);
          const tags = Array.isArray(p.tags) ? (p.tags as string[]) : [];
          const matchesTags = tags.some((t) => t.toLowerCase().includes(q));
          return matchesName || matchesTitle || matchesCompany || matchesLocation || matchesBio || matchesTags;
        })
      : userPeople;

    return NextResponse.json({
      people: filtered,
      total: userPeople.length,
    });
  } catch (error) {
    console.error("Fetch people error:", error);
    return NextResponse.json({ error: "Failed to fetch people" }, { status: 500 });
  }
}

const CreatePersonSchema = z.object({
  displayName: z.string().min(1, "Name is required").max(200),
  title: z.string().max(200).nullish(),
  company: z.string().max(200).nullish(),
  location: z.string().max(200).nullish(),
  hobbies: z.union([z.string(), z.array(z.string())]).nullish(),
  skills: z.union([z.string(), z.array(z.string())]).nullish(),
  bio: z.string().max(3000).nullish(),
  primaryEmail: z.string().email().nullish().or(z.literal("")),
  phone: z.string().max(50).nullish(),
});

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const validation = CreatePersonSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.error.format() },
        { status: 400 }
      );
    }

    const data = validation.data;
    const hobbiesList = extractCleanTags(data.hobbies);
    const skillsList = extractCleanTags(data.skills);
    const tags = Array.from(new Set([...hobbiesList, ...skillsList]));

    let bio = (data.bio || "").trim();
    if (hobbiesList.length > 0 && !bio.toLowerCase().includes("hobbi")) {
      bio = bio ? `${bio}\nHobbies: ${hobbiesList.join(", ")}` : `Hobbies: ${hobbiesList.join(", ")}`;
    }

    const result = await importPersonalContacts(user.id, [
      {
        displayName: data.displayName.trim(),
        title: data.title?.trim() || null,
        company: data.company?.trim() || null,
        location: data.location?.trim() || null,
        headline: data.title?.trim()
          ? `${data.title.trim()}${data.company?.trim() ? ` at ${data.company.trim()}` : ""}`
          : null,
        bio: bio || null,
        tags,
        primaryEmail: data.primaryEmail?.trim() || null,
        phone: data.phone?.trim() || null,
      },
    ]);

    return NextResponse.json({
      success: true,
      imported: result.imported,
      personId: result.ids[0],
    });
  } catch (error) {
    console.error("Create person error:", error);
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 }
    );
  }
}
