import { WorkspaceFeaturePage } from "@/components/features/WorkspaceFeaturePage";
export default async function Page({ params }: { params: Promise<{ segments: string[] }> }) { const { segments } = await params; return <WorkspaceFeaturePage role="EMPLOYEE" segments={segments} />; }
