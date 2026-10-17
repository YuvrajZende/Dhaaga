import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { parsePersonalData, importPersonalContacts } from "@/lib/import/personal";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let rawText = "";
    let directContacts: any[] | null = null;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      rawText = await (file as Blob).text();
    } else if (contentType.includes("application/json")) {
      const body = await req.json();
      if (body.contacts && Array.isArray(body.contacts)) {
        directContacts = body.contacts;
      } else if (body.text && typeof body.text === "string") {
        rawText = body.text;
      } else {
        rawText = JSON.stringify(body);
      }
    } else {
      rawText = await req.text();
    }

    const contacts = directContacts ? parsePersonalData(JSON.stringify(directContacts)) : parsePersonalData(rawText);

    if (contacts.length === 0) {
      return NextResponse.json(
        { error: "No valid contact records found. Please check file format (CSV or JSON with Name, Hobbies, Career, Notes)." },
        { status: 400 }
      );
    }

    const result = await importPersonalContacts(user.id, contacts);

    return NextResponse.json({
      success: true,
      imported: result.imported,
      sampleNames: contacts.slice(0, 5).map((c) => c.displayName),
    });
  } catch (error) {
    console.error("Personal data import error:", error);
    return NextResponse.json(
      { error: "Personal data import failed. Please verify the file format." },
      { status: 400 }
    );
  }
}
