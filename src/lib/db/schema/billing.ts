import {
  bigint,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { companies } from "./company";
import { jobs } from "./jobs";
import {
  addonTypeEnum,
  billingPeriodEnum,
  invoiceStatusEnum,
  paymentPurposeEnum,
  paymentStatusEnum,
  planAudienceEnum,
  subscriptionStatusEnum,
} from "./enums";

/* -------------------------------------------------------------------------- */
/* plans                                                                      */
/* -------------------------------------------------------------------------- */

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    audience: planAudienceEnum("audience").notNull(),
    description: text("description"),
    priceMonthlyPaise: bigint("price_monthly_paise", { mode: "number" }).notNull().default(0),
    priceYearlyPaise: bigint("price_yearly_paise", { mode: "number" }).notNull().default(0),
    jobPostsPerMonth: integer("job_posts_per_month"),
    isActive: boolean("is_active").notNull().default(true),
    isFeatured: boolean("is_featured").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("plans_code_key").on(t.code),
    index("plans_audience_idx").on(t.audience),
  ],
);

/* -------------------------------------------------------------------------- */
/* plan_features (entitlements; limitValue null = unlimited)                  */
/* -------------------------------------------------------------------------- */

export const planFeatures = pgTable(
  "plan_features",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(),
    isEnabled: boolean("is_enabled").notNull().default(true),
    limitValue: integer("limit_value"),
    label: text("label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("plan_features_key").on(t.planId, t.featureKey),
    index("plan_features_plan_idx").on(t.planId),
  ],
);

/* -------------------------------------------------------------------------- */
/* plan_promotions (e.g. candidate launch offer Rs 1,999/year)                */
/* -------------------------------------------------------------------------- */

export const planPromotions = pgTable(
  "plan_promotions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    label: text("label").notNull(),
    pricePaise: bigint("price_paise", { mode: "number" }).notNull(),
    billingPeriod: billingPeriodEnum("billing_period").notNull(),
    bannerText: text("banner_text"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("plan_promotions_code_key").on(t.code),
    index("plan_promotions_plan_idx").on(t.planId),
  ],
);

/* -------------------------------------------------------------------------- */
/* addons (configurable; seeded inactive with NULL price)                     */
/* -------------------------------------------------------------------------- */

export const addons = pgTable(
  "addons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    type: addonTypeEnum("type").notNull().default("per_job"),
    pricePaise: bigint("price_paise", { mode: "number" }),
    durationDays: integer("duration_days").notNull().default(30),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("addons_code_key").on(t.code)],
);

/* -------------------------------------------------------------------------- */
/* subscriptions                                                              */
/* -------------------------------------------------------------------------- */

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Null for candidate (B2C) subscriptions. */
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatusEnum("status").notNull().default("pending"),
    billingPeriod: billingPeriodEnum("billing_period").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    autoRenew: boolean("auto_renew").notNull().default(false),
    reminder7dSentAt: timestamp("reminder_7d_sent_at", { withTimezone: true }),
    reminder1dSentAt: timestamp("reminder_1d_sent_at", { withTimezone: true }),
    expiredEmailSentAt: timestamp("expired_email_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_company_idx").on(t.companyId),
    index("subscriptions_status_idx").on(t.status),
    index("subscriptions_period_end_idx").on(t.currentPeriodEnd),
  ],
);

/* -------------------------------------------------------------------------- */
/* payments                                                                   */
/* -------------------------------------------------------------------------- */

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
    addonId: uuid("addon_id").references(() => addons.id, { onDelete: "set null" }),
    purpose: paymentPurposeEnum("purpose").notNull().default("subscription"),
    orderId: text("order_id").notNull(),
    paymentId: text("payment_id"),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("INR"),
    status: paymentStatusEnum("status").notNull().default("created"),
    method: text("method"),
    signatureVerified: boolean("signature_verified").notNull().default(false),
    failureReason: text("failure_reason"),
    receipt: text("receipt"),
    razorpayPayload: text("razorpay_payload"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_order_id_key").on(t.orderId),
    uniqueIndex("payments_payment_id_key").on(t.paymentId),
    index("payments_user_idx").on(t.userId),
    index("payments_status_idx").on(t.status),
  ],
);

/* -------------------------------------------------------------------------- */
/* invoices                                                                   */
/* -------------------------------------------------------------------------- */

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceNumber: text("invoice_number").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "set null",
    }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    planName: text("plan_name").notNull(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    gstin: text("gstin"),
    subtotalPaise: bigint("subtotal_paise", { mode: "number" }).notNull().default(0),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
    taxPaise: bigint("tax_paise", { mode: "number" }).notNull().default(0),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("INR"),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    pdfPath: text("pdf_path"),
    status: invoiceStatusEnum("status").notNull().default("issued"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invoices_number_key").on(t.invoiceNumber),
    index("invoices_user_idx").on(t.userId),
  ],
);

/* -------------------------------------------------------------------------- */
/* addon_purchases                                                            */
/* -------------------------------------------------------------------------- */

export const addonPurchases = pgTable(
  "addon_purchases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    addonId: uuid("addon_id")
      .notNull()
      .references(() => addons.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    paymentId: uuid("payment_id").references(() => payments.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("active"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("addon_purchases_company_idx").on(t.companyId),
    index("addon_purchases_job_idx").on(t.jobId),
  ],
);
