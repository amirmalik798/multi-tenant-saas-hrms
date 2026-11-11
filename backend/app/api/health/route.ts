import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    application: "hrms-backend",
    message: "Backend API is working",
  });
}