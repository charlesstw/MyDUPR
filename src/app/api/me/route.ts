import { NextResponse } from "next/server";
import { BATCH_LIMIT } from "@/lib/lookup";
import { getName, getToken } from "@/lib/session";

export async function GET() {
  const token = await getToken();
  return NextResponse.json({
    loggedIn: !!token,
    name: token ? (await getName()) || null : null,
    batchLimit: BATCH_LIMIT,
  });
}
