import { WorkspaceFeaturePage } from "@/components/features/WorkspaceFeaturePage";
export default async function Page({ params }: { params: Promise<{ section: string }> }) { const { section } = await params; return <WorkspaceFeaturePage role="ORGANIZATION_ADMIN" segments={[section]} />; }
