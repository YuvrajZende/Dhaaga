import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { stageXArchive } from "@/lib/import/xarchive";

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
      return NextResponse.json({ error: "No archive ZIP file provided" }, { status: 400 });
    }

    const arrayBuffer = await (file as Blob).arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const result = await stageXArchive(user.id, buffer);

    return NextResponse.json({
      success: true,
      jobId: result.jobId,
      staged: result.staged,
      skipped: result.skipped,
    });
  } catch (error) {
    console.error("X archive import error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Archive import failed. Please verify the archive file format." },
      { status: 400 }
    );
  }
}
