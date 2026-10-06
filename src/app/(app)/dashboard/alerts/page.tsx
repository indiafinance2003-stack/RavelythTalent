import { requireUser } from "@/lib/auth/current-user";
import { listAlerts } from "@/lib/alerts/service";
import { CreateAlertForm } from "@/components/candidate/alert-manager";
import { AlertList } from "@/components/candidate/alert-manager";
import { getCategoriesWithCounts } from "@/lib/companies/queries";
import { PageHeader } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const user = await requireUser("/dashboard/alerts");
  const [alerts, categories] = await Promise.all([
    listAlerts(user.id),
    getCategoriesWithCounts(20),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job alerts"
        description="Save a search and we will email you when matching jobs are published."
      />

      <CreateAlertForm
        categories={categories.map((c) => ({ value: c.slug, label: c.name }))}
      />

      <AlertList
        alerts={alerts.map((a) => ({
          id: a.id,
          name: a.name,
          criteria: (a.criteria ?? {}) as Record<string, unknown>,
          frequency: a.frequency,
          isActive: a.isActive,
          lastSentAt: a.lastSentAt,
        }))}
      />
    </div>
  );
}
