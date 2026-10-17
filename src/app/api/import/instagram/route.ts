import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { stageInstagramArchive } from "@/lib/import/instagram";

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Content-Type must be multipart/form-data" },
        { status: 400 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No export file provided (.zip or .json)" }, { status: 400 });
    }

    const blob = file as Blob;
    const filename = (file as any).name || "instagram_export.zip";
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const result = await stageInstagramArchive(user.id, buffer, filename);

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      staged: result.staged,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("Instagram import error:", error);
    return NextResponse.json(
      { error: "Instagram import failed. Please verify the archive file format." },
      { status: 400 }
    );
  }
}
