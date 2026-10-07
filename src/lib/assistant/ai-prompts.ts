import {
  ASSISTANT_SYSTEM_PROMPT,
  delimitedEmail,
} from "./ai-safety";
import type { AiRequest } from "./ai-provider";

type KnowledgeContext = {
  businessDescription: string | null;
  faqs: Array<{ question: string; answer: string }>;
  plans: Array<{
    name: string;
    audience: string;
    priceMonthlyPaise: number;
    priceYearlyPaise: number;
  }>;
};

function contextBlock(context: KnowledgeContext): string {
  return [
    "<business_description>",
    context.businessDescription?.slice(0, 5_000) ?? "",
    "</business_description>",
    "<faq_knowledge>",
    JSON.stringify(context.faqs.map((item) => ({
      question: item.question.slice(0, 1_000),
      answer: item.answer.slice(0, 5_000),
    }))),
    "</faq_knowledge>",
    "<public_plans>",
    JSON.stringify(context.plans),
    "</public_plans>",
  ].join("\n");
}

export function buildThreadAiRequest(input: {
  purpose: "classify" | "draft_reply";
  emailText: string;
  context: KnowledgeContext;
}): AiRequest {
  const email = delimitedEmail(input.emailText);
  const output = input.purpose === "classify"
    ? 'Return JSON: {"category":"bounce|out_of_office|opt_out|payment|account|job_report|complaint|general","urgency":"high|normal|low","summary":"one line","needs_human":true,"suggested_status":"new|emailed|replied|interested|subscribed|rejected|bounced|do_not_contact","confidence":0.0}.'
    : 'Return JSON: {"draft":"plain-text reply","needs_human":true}. Use only the FAQ, public plans, and business description; do not invent policy.';
  return {
    model: "claude-haiku-4-5",
    system: `${ASSISTANT_SYSTEM_PROMPT} ${output}`,
    user: `${contextBlock(input.context)}\n${email}`,
    maxTokens: input.purpose === "classify" ? 400 : 800,
  };
}

export function buildLeadDraftAiRequest(input: {
  lead: {
    company: string;
    contactName: string | null;
    designation: string | null;
    city: string | null;
    industry: string | null;
    website: string | null;
  };
  context: KnowledgeContext;
}): AiRequest {
  const output = 'Return JSON: {"draft":"personalized plain-text first email","needs_human":true}. Do not assert facts that are not in the lead fields or supplied business description. Include {{unsubscribe_url}} in a visible opt-out line.';
  return {
    model: "claude-haiku-4-5",
    system: `${ASSISTANT_SYSTEM_PROMPT} ${output}`,
    user: `${contextBlock(input.context)}\n<untrusted_lead_fields>\n${JSON.stringify(input.lead)}\n</untrusted_lead_fields>`,
    maxTokens: 800,
  };
}
