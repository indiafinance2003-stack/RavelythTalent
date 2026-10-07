import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { assistantFaq, plans } from "@/lib/db/schema";

export async function getAiKnowledgeContext() {
  const [faqs, publicPlans] = await Promise.all([
    db.select({ question: assistantFaq.question, answer: assistantFaq.answer })
      .from(assistantFaq)
      .where(eq(assistantFaq.isActive, true))
      .limit(100),
    db.select({
      name: plans.name,
      audience: plans.audience,
      priceMonthlyPaise: plans.priceMonthlyPaise,
      priceYearlyPaise: plans.priceYearlyPaise,
    }).from(plans).where(eq(plans.isActive, true)).limit(50),
  ]);
  return { faqs, plans: publicPlans };
}
