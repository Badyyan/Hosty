import { ProjectTabs } from "@/components/dashboard/project-tabs";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <ProjectTabs projectId={params.id} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
