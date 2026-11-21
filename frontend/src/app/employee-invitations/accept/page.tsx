"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { InvitationAcceptanceWorkspace } from "@/features/onboarding/InvitationAcceptanceWorkspace";

function InvitationPageContent() {
  const params = useSearchParams();
  return <InvitationAcceptanceWorkspace token={params.get("token") || ""} type="workforce" />;
}

export default function WorkforceInvitationPage() {
  return <Suspense fallback={<main className="loading-state" style={{ minHeight: "100vh" }}>Loading invitation…</main>}><InvitationPageContent /></Suspense>;
}
