import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { stageLinkedInImport } from "@/lib/import/linkedin";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    let csvText = "";

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "No file provided" }, { status: 400 });
      }
      csvText = await (file as Blob).text();
    } else {
      csvText = await req.text();
    }

    if (!csvText || csvText.trim().length === 0) {
      return NextResponse.json({ error: "CSV content is empty" }, { status: 400 });
    }

    const result = await stageLinkedInImport(user.id, csvText);

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      staged: result.staged,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("LinkedIn import error:", error);
    return NextResponse.json(
      { error: "LinkedIn CSV import failed. Please verify the file format." },
      { status: 400 }
    );
  }
}
