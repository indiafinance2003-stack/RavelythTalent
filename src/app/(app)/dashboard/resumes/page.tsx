import { requireUser } from "@/lib/auth/current-user";
import { listResumes } from "@/lib/candidate/resumes";
import { ResumeManager } from "@/components/candidate/resume-manager";
import { PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const user = await requireUser("/dashboard");
  const resumes = await listResumes(user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My resumes"
        description="Upload up to 10 resumes and choose which one employers receive by default."
      />
      <ResumeManager
        resumes={resumes.map((r) => ({
          id: r.id,
          label: r.label,
          originalName: r.originalName,
          sizeBytes: r.sizeBytes,
          createdAt: r.createdAt,
          isDefault: r.isDefault,
        }))}
      />
    </div>
  );
}
