export { composeEmail, DEFAULT_BRAND } from "./layout";
export type { EmailBrand, EmailBlock, EmailOptions } from "./layout";
export { appUrl } from "./urls";
export type { RenderedEmail } from "./urls";
export {
  enqueueEmail,
  processEmailOutbox,
  retryOutboxEmail,
} from "./queue";
export type { EnqueueAttachment, EnqueueInput, OutboxRunResult } from "./queue";
export { getEmailBrand, queueRenderedEmail } from "./send";
export { getTransport, verifyTransport, fromAddress } from "./smtp";

export * from "./templates/auth";
export * from "./templates/product";
export * from "./templates/recruiter";
export * from "./templates/billing";