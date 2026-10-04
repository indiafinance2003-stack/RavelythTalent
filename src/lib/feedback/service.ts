import { desc, eq } from 'drizzle-orm';
import { dbFromRequest } from '@/lib/db/request';
import {
  customerFeedback,
  users,
  FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  type CustomerFeedbackRow,
  type FeedbackCategory,
  type FeedbackStatus,
} from '@/lib/db/schema';
import { AppError, AppErrorCode, ValidationError } from '@/lib/errors/app-error';

/**
 * Customer feedback.
 *
 * Feedback is always owned by the signing-in customer (the user id comes from
 * the session, never the client). Owner views resolve the author by user id;
 * a removed account cascades its feedback rows away.
 */

export interface FeedbackDTO {
  id: string;
  rating: number;
  category: string;
  categoryLabel: string;
  message: string;
  status: string;
  statusLabel: string;
  handledAt: string | null;
  createdAt: string;
  /** Owner authors: who the feedback belongs to. Null in customer-facing DTOs. */
  authorEmail?: string;
  authorName?: string;
}

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  jobs: 'Jobs and applications',
  account: 'Account & portal',
  billing: 'Billing & subscriptions',
  support: 'Support experience',
  other: 'Something else',
};

export function feedbackCategoryLabel(category: string): string {
  return (FEEDBACK_CATEGORIES as readonly string[]).includes(category)
    ? FEEDBACK_CATEGORY_LABELS[category as FeedbackCategory]
    : category;
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  addressed: 'Addressed',
};

export function feedbackStatusLabel(status: string): string {
  return (FEEDBACK_STATUSES as readonly string[]).includes(status)
    ? FEEDBACK_STATUS_LABELS[status as FeedbackStatus]
    : status;
}

const MAX_MESSAGE_LENGTH = 5000;

function toDTO(row: CustomerFeedbackRow): FeedbackDTO {
  return {
    id: row.id,
    rating: row.rating,
    category: row.category,
    categoryLabel: feedbackCategoryLabel(row.category),
    message: row.message,
    status: row.status,
    statusLabel: feedbackStatusLabel(row.status),
    handledAt: row.handledAt ? row.handledAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export interface SubmitFeedbackInput {
  rating: unknown;
  category?: unknown;
  message: unknown;
}

export interface NormalizedFeedbackInput {
  rating: number;
  category: FeedbackCategory;
  message: string;
}

/**
 * Pure validation for a feedback submission. Rating must be an integer in
 * 1..5, the category one of the published set, and the message non-empty and
 * bounded. Exposed separately so the rules are unit tested without a database.
 */
export function normalizeFeedbackInput(input: SubmitFeedbackInput): NormalizedFeedbackInput {
  const ratingNumber = Number(input.rating);
  if (!Number.isInteger(ratingNumber) || ratingNumber < 1 || ratingNumber > 5) {
    throw new ValidationError('Rating must be a whole number between 1 and 5.');
  }

  const category =
    typeof input.category === 'string' && input.category.length > 0
      ? input.category
      : 'other';
  if (!(FEEDBACK_CATEGORIES as readonly string[]).includes(category as FeedbackCategory)) {
    throw new ValidationError('Unknown feedback category.');
  }

  if (typeof input.message !== 'string' || input.message.trim().length === 0) {
    throw new ValidationError('A message is required.');
  }
  if (input.message.length > MAX_MESSAGE_LENGTH) {
    throw new ValidationError(`Feedback is limited to ${MAX_MESSAGE_LENGTH} characters.`);
  }

  return { rating: ratingNumber, category: category as FeedbackCategory, message: input.message.trim() };
}

/**
 * Submits feedback. Rating is mandatory and clamped to a 1..5 integer scale;
 * the category must be one of the published categories; the message must be
 * non-empty and bounded.
 */
export async function submitFeedback(
  userId: string,
  input: SubmitFeedbackInput
): Promise<FeedbackDTO> {
  const normalized = normalizeFeedbackInput(input);

  const { db } = dbFromRequest();
  const [row] = await db
    .insert(customerFeedback)
    .values({
      userId,
      rating: normalized.rating,
      category: normalized.category,
      message: normalized.message,
    })
    .returning();

  return toDTO(row);
}

/** All feedback submitted by one customer, newest first. */
export async function listMyFeedback(userId: string, limit = 50): Promise<FeedbackDTO[]> {
  const { db } = dbFromRequest();
  const rows = await db
    .select()
    .from(customerFeedback)
    .where(eq(customerFeedback.userId, userId))
    .orderBy(desc(customerFeedback.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));
  return rows.map(toDTO);
}

export interface FeedbackFilters {
  status?: string;
  limit?: number;
}

/**
 * Owner listing view: newest first, with the author's email/name joined in.
 * Kept separate from the customer-facing `listMyFeedback` so that module never
 * touches other customers' identity fields.
 */
export async function listAllFeedback(filters: FeedbackFilters = {}): Promise<FeedbackDTO[]> {
  const { db } = dbFromRequest();
  const limit = Math.min(Math.max((filters.limit ?? 50) | 0, 1), 200);

  const base = db
    .select({
      feedback: customerFeedback,
      authorEmail: users.email,
      authorName: users.name,
    })
    .from(customerFeedback)
    .innerJoin(users, eq(users.id, customerFeedback.userId));

  const rows =
    filters.status && (FEEDBACK_STATUSES as readonly string[]).includes(filters.status)
      ? await base
          .where(eq(customerFeedback.status, filters.status as FeedbackStatus))
          .orderBy(desc(customerFeedback.createdAt))
          .limit(limit)
      : await base.orderBy(desc(customerFeedback.createdAt)).limit(limit);

  return rows.map(({ feedback, authorEmail, authorName }) => ({
    ...toDTO(feedback),
    authorEmail,
    authorName,
  }));
}

/**
 * Owner triage: transitions a feedback row to acknowledged/addressed. Only the
 * owner may do this; customers cannot delete their own feedback.
 */
export async function setFeedbackStatus(
  actorUserId: string,
  feedbackId: string,
  status: FeedbackStatus
): Promise<FeedbackDTO> {
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status as FeedbackStatus)) {
    throw new AppError(AppErrorCode.VALIDATION_ERROR, 'Unknown feedback status.', 400);
  }

  const { db } = dbFromRequest();
  const rows = await db
    .select()
    .from(customerFeedback)
    .where(eq(customerFeedback.id, feedbackId))
    .limit(1);
  if (!rows[0]) {
    throw new AppError(AppErrorCode.NOT_FOUND, 'Feedback not found.', 404);
  }

  const [row] = await db
    .update(customerFeedback)
    .set({
      status,
      handledAt: new Date(),
      handledByUserId: actorUserId,
    })
    .where(eq(customerFeedback.id, feedbackId))
    .returning();

  return toDTO(row);
}

/** Validates a feedback status string against the known set. */
export function isFeedbackStatus(value: unknown): value is FeedbackStatus {
  return (
    typeof value === 'string' && (FEEDBACK_STATUSES as readonly string[]).includes(value)
  );
}