import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  auditLogs,
  campaignMessages,
  companyLeads,
  leadEvents,
  notifications,
  suppressedEmails,
  users,
} from "@/lib/db/schema";

export async function applyCampaignUnsubscribe(email: string): Promise<void> {
  const normalized = email.toLocaleLowerCase("en");
  await db.transaction(async (tx) => {
    const [lead] = await tx.select().from(companyLeads)
      .where(sql`lower(${companyLeads.email}) = ${normalized}`)
      .limit(1);
    const [added] = await tx.insert(suppressedEmails).values({
      email: normalized,
      reason: "One-click campaign unsubscribe",
      source: "unsubscribe_link",
      leadId: lead?.id ?? null,
    }).onConflictDoNothing().returning({ id: suppressedEmails.id });

    if (lead) {
      await tx.update(companyLeads).set({
        doNotContact: true,
        status: "do_not_contact",
        updatedAt: new Date(),
      }).where(eq(companyLeads.id, lead.id));
      if (!lead.doNotContact || lead.status !== "do_not_contact") {
        await tx.insert(leadEvents).values({
          leadId: lead.id,
          eventType: "opt_out_received",
          fromStatus: lead.status,
          toStatus: "do_not_contact",
          details: "Contact used the one-click unsubscribe link.",
        });
      }
      await tx.update(campaignMessages).set({
        status: "opted_out",
        updatedAt: new Date(),
      }).where(and(
        eq(campaignMessages.leadId, lead.id),
        eq(campaignMessages.status, "sent"),
      ));
      await tx.update(campaignMessages).set({
        status: "skipped",
        updatedAt: new Date(),
      }).where(and(
        eq(campaignMessages.leadId, lead.id),
        inArray(campaignMessages.status, ["pending_approval", "approved", "queued"]),
      ));
    }

    if (added) {
      await tx.insert(auditLogs).values({
        actorRole: "system",
        action: "assistant.campaign_opt_out",
        entityType: "suppressed_email",
        entityId: added.id,
        description: "A contact was added to the suppression list by one-click unsubscribe.",
        metadata: { leadId: lead?.id ?? null },
      });
      const admins = await tx.select({ id: users.id })
        .from(users)
        .where(and(
          eq(users.role, "admin"),
          eq(users.status, "active"),
          isNull(users.deletedAt),
        ));
      for (const admin of admins) {
        await tx.insert(notifications).values({
          userId: admin.id,
          type: "assistant_attention",
          title: "Campaign contact opted out",
          body: "A contact used the one-click unsubscribe link.",
          link: "/admin/assistant/leads",
          metadata: { leadId: lead?.id ?? null },
        });
      }
    }
  });
}
