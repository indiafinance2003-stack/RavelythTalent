import { ImapFlow, type FetchQueryObject, type MessageStructureObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { AddressObject } from "mailparser";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  assistantSettings,
  auditLogs,
  campaignMessages,
  companyLeads,
  inboxAccounts,
  inboxClassifications,
  inboxDrafts,
  inboxMessages,
  inboxThreads,
  leadEvents,
  notifications,
  suppressedEmails,
  users,
  type InboxAccountId,
} from "@/lib/db/schema";
import {
  classifyMessage,
  extractBounceRecipient,
  extractMessageIds,
  inboundLeadStatus,
  inboundMessageEffects,
  matchesFallbackThread,
} from "./classification";
import { getMailAccountCredentials } from "./mail-accounts";

const MAX_MESSAGES_PER_ACCOUNT = 25;
const MAX_BODY_BYTES = 128 * 1024;
const MAX_MESSAGE_BYTES = 3 * 1024 * 1024;
const MAX_HEADER_BYTES = 32 * 1024;
const MAX_ATTACHMENTS = 10;

type ParsedInboxMessage = {
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  from: string;
  to: string[];
  subject: string;
  text: string;
  attachmentNames: string[];
  sentAt: Date;
};

function addressList(
  values: Array<{ address?: string }> | undefined,
): string[] {
  return [...new Set((values ?? [])
    .map((value) => value.address?.trim().toLocaleLowerCase("en"))
    .filter((value): value is string => Boolean(value)))];
}

function parsedAddressList(
  value: AddressObject | AddressObject[] | undefined,
): string[] {
  const groups = value ? (Array.isArray(value) ? value : [value]) : [];
  return addressList(groups.flatMap((group) => group.value));
}

function attachmentNames(node: MessageStructureObject | undefined): string[] {
  const names = new Set<string>();
  const visit = (current: MessageStructureObject | undefined): void => {
    if (!current) return;
    const name = current.dispositionParameters?.filename ?? current.parameters?.name;
    if (name && (current.disposition === "attachment" || current.type !== "text/plain")) {
      names.add(name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 255));
    }
    for (const child of current.childNodes ?? []) visit(child);
  };
  visit(node);
  return [...names].filter(Boolean).slice(0, MAX_ATTACHMENTS);
}

function plainTextPart(node: MessageStructureObject | undefined): MessageStructureObject | null {
  if (!node) return null;
  const type = node.type.split(";")[0]?.trim().toLocaleLowerCase("en");
  const isAttachment =
    node.disposition === "attachment" ||
    Boolean(node.dispositionParameters?.filename || node.parameters?.name);
  if (!isAttachment && type === "text/plain") return node;
  for (const child of node.childNodes ?? []) {
    const found = plainTextPart(child);
    if (found) return found;
  }
  return null;
}

async function readLimitedStream(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = typeof chunk === "string"
      ? Buffer.from(chunk)
      : Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk as Uint8Array);
    const remaining = MAX_BODY_BYTES - size;
    if (remaining <= 0) break;
    chunks.push(buffer.subarray(0, remaining));
    size += Math.min(buffer.length, remaining);
    if (buffer.length > remaining) break;
  }
  return Buffer.concat(chunks, size);
}

async function parseInboxMessage(
  client: ImapFlow,
  uid: number,
  size: number,
  envelope: {
    date?: Date | string;
    subject?: string;
    messageId?: string;
    inReplyTo?: string;
    from?: Array<{ address?: string }>;
    to?: Array<{ address?: string }>;
  } | undefined,
  headers: Buffer | undefined,
  bodyStructure: MessageStructureObject | undefined,
  internalDate: Date | string | undefined,
): Promise<ParsedInboxMessage> {
  let parsedHeaders: Awaited<ReturnType<typeof simpleParser>> | null = null;
  if (headers && headers.byteLength <= MAX_HEADER_BYTES) {
    parsedHeaders = await simpleParser(
      Buffer.concat([headers, Buffer.from("\r\n")]),
    );
  }

  let text = "";
  const part = plainTextPart(bodyStructure);
  if (size <= MAX_MESSAGE_BYTES && part) {
    const partId = part.part ?? "TEXT";
    const download = await client.download(uid, partId, {
      uid: true,
      maxBytes: MAX_BODY_BYTES,
    });
    if (download.content) {
      text = (await readLimitedStream(download.content)).toString("utf8");
    }
  }

  const from = parsedAddressList(parsedHeaders?.from)[0] ??
    addressList(envelope?.from)[0] ??
    "unknown";
  const dateValue = parsedHeaders?.date ?? envelope?.date ?? internalDate;
  const date = dateValue ? new Date(dateValue) : new Date();

  return {
    messageId: (parsedHeaders?.messageId ?? envelope?.messageId ?? null)?.slice(0, 998) ?? null,
    inReplyTo: (parsedHeaders?.inReplyTo ?? envelope?.inReplyTo ?? null)?.slice(0, 998) ?? null,
    references: (Array.isArray(parsedHeaders?.references)
      ? parsedHeaders.references.join(" ")
      : parsedHeaders?.references ?? null)?.slice(0, 8_000) ?? null,
    from,
    to: parsedAddressList(parsedHeaders?.to).length
      ? parsedAddressList(parsedHeaders?.to)
      : addressList(envelope?.to),
    subject: (parsedHeaders?.subject ?? envelope?.subject ?? "(no subject)").slice(0, 998),
    text,
    attachmentNames: attachmentNames(bodyStructure),
    sentAt: Number.isNaN(date.getTime()) ? new Date() : date,
  };
}

async function findLead(email: string) {
  if (!email || email === "unknown") return null;
  const [lead] = await db
    .select()
    .from(companyLeads)
    .where(sql`lower(${companyLeads.email}) = ${email.toLocaleLowerCase("en")}`)
    .limit(1);
  return lead ?? null;
}

async function selectThread(
  accountId: InboxAccountId,
  message: ParsedInboxMessage,
  refs: string[],
  leadId: string | null,
): Promise<{ id: string; participants: string[] } | null> {
  if (refs.length) {
    const [match] = await db
      .select({ id: inboxThreads.id, participants: inboxThreads.participants })
      .from(inboxMessages)
      .innerJoin(inboxThreads, eq(inboxThreads.id, inboxMessages.threadId))
      .where(and(
        eq(inboxMessages.accountId, accountId),
        inArray(inboxMessages.messageId, refs),
      ))
      .limit(1);
    if (match) return { id: match.id, participants: match.participants };
  }

  const candidates = await db
    .select({ id: inboxThreads.id, subject: inboxThreads.subject, participants: inboxThreads.participants })
    .from(inboxThreads)
    .where(eq(inboxThreads.accountId, accountId))
    .orderBy(desc(inboxThreads.lastMessageAt))
    .limit(100);
  const match = candidates.find((thread) => matchesFallbackThread(thread, message));
  if (match) return { id: match.id, participants: match.participants };

  const [created] = await db
    .insert(inboxThreads)
    .values({
      accountId,
      subject: message.subject,
      participants: [...new Set([message.from, ...message.to])],
      leadId,
      lastMessageAt: message.sentAt,
    })
    .returning({ id: inboxThreads.id, participants: inboxThreads.participants });
  return created ? { id: created.id, participants: created.participants } : null;
}

async function persistIncoming(
  accountId: InboxAccountId,
  uidValidity: string,
  uid: number,
  message: ParsedInboxMessage,
): Promise<boolean> {
  const alreadySaved = await db
    .select({ id: inboxMessages.id })
    .from(inboxMessages)
    .where(and(
      eq(inboxMessages.accountId, accountId),
      eq(inboxMessages.remoteUidValidity, uidValidity),
      eq(inboxMessages.remoteUid, uid),
    ))
    .limit(1);
  if (alreadySaved.length) return false;

  const duplicateMessage = message.messageId
    ? await db.select({ id: inboxMessages.id })
      .from(inboxMessages)
      .where(and(
        eq(inboxMessages.accountId, accountId),
        eq(inboxMessages.messageId, message.messageId),
      ))
      .limit(1)
    : [];
  if (duplicateMessage.length) return false;

  const refs = [
    ...extractMessageIds(message.inReplyTo),
    ...extractMessageIds(message.references),
  ];
  const leadEmail = message.from;
  const initialLead = await findLead(leadEmail);
  const thread = await selectThread(accountId, message, refs, initialLead?.id ?? null);
  if (!thread) throw new Error("Unable to create or resolve inbox thread.");

  const classification = classifyMessage({
    from: message.from,
    subject: message.subject,
    text: message.text,
  });
  const effects = inboundMessageEffects(classification);
  const bounceRecipient = classification.isBounce
    ? extractBounceRecipient(message.text)
    : null;
  const lead = classification.isBounce && bounceRecipient
    ? await findLead(bounceRecipient)
    : initialLead;

  const inserted = await db.transaction(async (tx) => {
    const [saved] = await tx.insert(inboxMessages).values({
      accountId,
      threadId: thread.id,
      remoteUid: uid,
      remoteUidValidity: uidValidity,
      messageId: message.messageId,
      inReplyTo: message.inReplyTo,
      references: message.references,
      fromAddress: message.from,
      toAddresses: message.to,
      subject: message.subject,
      textBody: message.text,
      attachmentNames: message.attachmentNames,
      direction: "inbound",
      sentAt: message.sentAt,
    }).onConflictDoNothing().returning({ id: inboxMessages.id });

    if (!saved) return false;

    await tx.update(inboxThreads).set({
      subject: message.subject,
      participants: [...new Set([...thread.participants, message.from, ...message.to])],
      leadId: lead?.id ?? initialLead?.id ?? null,
      category: classification.category,
      needsAttention: classification.needsHuman || classification.isOptOut,
      lastMessageAt: message.sentAt,
      updatedAt: new Date(),
    }).where(eq(inboxThreads.id, thread.id));

    await tx.insert(inboxClassifications).values({
      threadId: thread.id,
      category: classification.category,
      urgency: classification.urgency,
      summary: classification.summary,
      needsHuman: classification.needsHuman,
      source: "rules",
    });

    if (classification.isOptOut) {
      await tx.insert(suppressedEmails).values({
        email: message.from.toLocaleLowerCase("en"),
        reason: "Opt-out request received by email",
        source: "inbox",
        leadId: initialLead?.id ?? null,
      }).onConflictDoNothing();
    }

    if (lead && effects.updateLeadStatus) {
      const nextStatus = inboundLeadStatus(classification, lead);
      const statusChanged = lead.status !== nextStatus ||
        (classification.isOptOut && !lead.doNotContact);
      if (statusChanged) {
        await tx.update(companyLeads).set({
          status: nextStatus,
          doNotContact: classification.isOptOut || lead.doNotContact,
          lastContactedAt: message.sentAt,
          updatedAt: new Date(),
        }).where(eq(companyLeads.id, lead.id));
        await tx.insert(leadEvents).values({
          leadId: lead.id,
          eventType: classification.isOptOut
            ? "opt_out_received"
            : classification.isBounce
              ? "bounced"
              : "replied",
          fromStatus: lead.status,
          toStatus: nextStatus,
          details: classification.summary,
        });
      } else {
        await tx.insert(leadEvents).values({
          leadId: lead.id,
          eventType: classification.isOptOut
            ? "opt_out_received"
            : classification.isBounce
              ? "bounce_received"
              : "reply_received",
          fromStatus: lead.status,
          toStatus: nextStatus,
          details: classification.summary,
        });
      }
      if (effects.updateCampaignMessages &&
        (classification.isOptOut || classification.isBounce || message.from !== "unknown")) {
        const sentCampaignStatus = classification.isOptOut
          ? "opted_out"
          : classification.isBounce
            ? "bounced"
            : "replied";
        await tx.update(campaignMessages).set({
          status: sentCampaignStatus,
          updatedAt: message.sentAt,
        }).where(and(
          eq(campaignMessages.leadId, lead.id),
          eq(campaignMessages.status, "sent"),
        ));
        await tx.update(campaignMessages).set({
          status: "skipped",
          updatedAt: message.sentAt,
        }).where(and(
          eq(campaignMessages.leadId, lead.id),
          inArray(campaignMessages.status, ["pending_approval", "approved", "queued"]),
        ));
      }
    }

    if (classification.isOptOut) {
      const [settings] = await tx.select({ optOutText: assistantSettings.optOutText })
        .from(assistantSettings)
        .where(eq(assistantSettings.id, 1))
        .limit(1);
      await tx.insert(inboxDrafts).values({
        threadId: thread.id,
        accountId,
        body: `We have recorded your request and will not send further outreach to this address.${settings?.optOutText ? `\n\n${settings.optOutText}` : ""}`,
        source: "opt_out_confirmation",
      });
    }

    if (effects.notifyAdmins) {
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
          title: classification.isOptOut
            ? "Contact opted out"
            : "Inbox thread needs attention",
          body: `${message.subject.slice(0, 160)} (${accountId})`,
          link: `/admin/assistant?thread=${thread.id}`,
          metadata: { threadId: thread.id, category: classification.category },
        });
      }
    }

    return true;
  });

  return inserted;
}

export async function syncInboxAccount(
  account: ReturnType<typeof getMailAccountCredentials>[number],
  messageLimit = MAX_MESSAGES_PER_ACCOUNT,
): Promise<{ accountId: InboxAccountId; fetched: number; saved: number; skipped: number }> {
  const boundedLimit = Math.max(1, Math.min(messageLimit, MAX_MESSAGES_PER_ACCOUNT));
  await db.insert(inboxAccounts)
    .values({ id: account.id })
    .onConflictDoNothing({ target: inboxAccounts.id });
  const [savedAccount] = await db.select().from(inboxAccounts)
    .where(eq(inboxAccounts.id, account.id))
    .limit(1);
  if (!savedAccount) throw new Error(`Inbox account cursor missing for ${account.id}.`);

  const client = new ImapFlow({
    host: account.imap.host,
    port: account.imap.port,
    secure: account.imap.secure,
    auth: { user: account.username, pass: account.password },
    logger: false,
    connectionTimeout: 10_000,
    socketTimeout: 30_000,
  });
  let fetched = 0;
  let saved = 0;
  let skipped = 0;

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX", {
      readOnly: true,
      description: `Ravelyth inbox sync: ${account.id}`,
    });
    try {
      if (!client.mailbox || !("uidValidity" in client.mailbox)) {
        throw new Error(`IMAP mailbox metadata is unavailable for ${account.id}.`);
      }
      const uidValidity = client.mailbox.uidValidity.toString();
      let lastUid = savedAccount.lastUid;
      if (savedAccount.uidValidity !== uidValidity) {
        lastUid = 0;
        await db.update(inboxAccounts).set({
          uidValidity,
          lastUid: 0,
          updatedAt: new Date(),
        }).where(eq(inboxAccounts.id, account.id));
      }

      const firstUid = lastUid + 1;
      const range = `${firstUid}:*`;
      const fields: FetchQueryObject = {
        uid: true,
        envelope: true,
        bodyStructure: true,
        headers: ["message-id", "in-reply-to", "references", "from", "to", "subject", "date"],
        internalDate: true,
        size: true,
      };

      for await (const remote of client.fetch(range, fields, { uid: true })) {
        if (fetched >= boundedLimit) break;
        fetched += 1;
        const message = await parseInboxMessage(
          client,
          remote.uid,
          remote.size ?? 0,
          remote.envelope,
          remote.headers,
          remote.bodyStructure,
          remote.internalDate,
        );
        const didSave = await persistIncoming(
          account.id,
          uidValidity,
          remote.uid,
          message,
        );
        if (didSave) saved += 1;
        else skipped += 1;
        await db.update(inboxAccounts).set({
          uidValidity,
          lastUid: sql`GREATEST(${inboxAccounts.lastUid}, ${remote.uid})`,
          updatedAt: new Date(),
        }).where(eq(inboxAccounts.id, account.id));
      }
    } finally {
      lock.release();
    }
  } finally {
    client.close();
  }

  return { accountId: account.id, fetched, saved, skipped };
}

export async function syncConfiguredInboxes(): Promise<{
  accounts: Array<{ accountId: InboxAccountId; fetched: number; saved: number; skipped: number }>;
}> {
  const configured = getMailAccountCredentials();
  const results = [];
  for (const account of configured) {
    results.push(await syncInboxAccount(account));
  }

  if (configured.length) {
    await db.insert(auditLogs).values({
      actorRole: "system",
      action: "assistant.inbox_sync",
      entityType: "inbox",
      description: `Inbox sync completed for ${configured.length} configured account(s).`,
      metadata: {
        accounts: results.map(({ accountId, fetched, saved, skipped }) => ({
          accountId,
          fetched,
          saved,
          skipped,
        })),
      },
    });
  }
  return { accounts: results };
}
