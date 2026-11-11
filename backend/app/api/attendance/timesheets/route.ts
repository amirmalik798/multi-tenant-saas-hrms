import { NextResponse } from "next/server";

function disabled() {
  return NextResponse.json(
    { status: "disabled", message: "Timesheets have been removed from the HRMS workflow. Working hours are calculated from recorded clock-in and clock-out events." },
    { status: 410, headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" } },
  );
}

export async function GET() { return disabled(); }
export async function POST() { return disabled(); }
export async function PATCH() { return disabled(); }
export async function DELETE() { return disabled(); }
