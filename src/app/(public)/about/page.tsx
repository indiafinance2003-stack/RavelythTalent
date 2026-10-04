import type { Metadata } from "next";
import { Card, PageHeader } from "@/components/ui/primitives";
import { getSiteSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "About Ravelyth Talent",
  description: "Learn about Ravelyth Talent and its candidate and employer services.",
};

export default async function AboutPage() {
  const settings = await getSiteSettings();
  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 py-10 sm:px-6">
      <PageHeader
        title={`About ${settings.brandName}`}
        description={settings.tagline ?? "Connecting Great People with Great Opportunities"}
      />
      <Card>
        <h2 className="text-xl font-bold text-navy">A place to find work and talent</h2>
        <p className="mt-3 text-sm leading-7 text-slate-700">
          Ravelyth Talent brings job seekers and employers together through job discovery,
          candidate profiles, applications, and hiring tools. Candidates can manage their
          careers and applications, while approved employers can publish opportunities and
          manage their applicant pipelines.
        </p>
        <p className="mt-3 text-sm leading-7 text-slate-700">
          Our focus is simple: find jobs, hire talent, and build careers with clear tools
          for both sides of the hiring journey.
        </p>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ["Find Jobs", "Search opportunities and manage applications in one place."],
          ["Hire Talent", "Publish approved roles and organize candidate pipelines."],
          ["Build Careers", "Keep profiles and resumes ready for the next opportunity."],
        ].map(([heading, body]) => (
          <Card key={heading}>
            <h2 className="font-bold text-navy">{heading}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
