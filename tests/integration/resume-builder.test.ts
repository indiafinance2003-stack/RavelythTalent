import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  createTestDatabase,
  installTestDatabase,
  restoreDatabase,
  truncateAllTables,
  type TestDatabase,
} from '../support/database';
import { PortalFixtures } from '../support/fixtures';
import { createResume, uploadResumeVersion } from '@/lib/portal/candidates/resumes';
import {
  createBuilderVersion,
  exportResumePdf,
  getBuilderDraft,
  listVersionHistory,
  readResumePdfForAuthorizedViewer,
  restoreVersionToDraft,
  saveBuilderDraft,
} from '@/lib/portal/candidates/resume-builder';
import { applyToJob } from '@/lib/portal/applications';
import { revokeEntitlement } from '@/lib/portal/premium/entitlements';
import { CANDIDATE_ENTITLEMENT_CODES } from '@/lib/portal/premium/entitlement-codes';
import { resumeVersions } from '@/lib/db/portal-schema';
import { emptyResumeDocument } from '@/lib/resume/content';
import { setStorageDriver, type StorageDriver, type StoredObject } from '@/lib/storage';

/** A real PDF header, so content sniffing passes. */
const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25]);

/**
 * In-memory storage that records keys, so tests can prove the private PDF
 * metadata is persisted and that a superseded PDF is actually deleted.
 */
function memoryStorage(): StorageDriver & { keys(): string[] } {
  const files = new Map<string, Buffer>();
  let sequence = 0;
  return {
    name: 'memory',
    keys: () => [...files.keys()],
    async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
      sequence += 1;
      const storageKey = `${key}`;
      files.set(storageKey, body);
      return {
        storageKey,
        byteSize: body.byteLength,
        checksumSha256: `checksum-${sequence}`,
        contentType,
      };
    },
    async get(key: string): Promise<Buffer> {
      const found = files.get(key);
      if (!found) throw new Error('missing');
      return found;
    },
    async delete(key: string): Promise<void> {
      files.delete(key);
    },
    async exists(key: string): Promise<boolean> {
      return files.has(key);
    },
  };
}

/** A document with enough content that the renderer produces real pages. */
function filledDocument(fullName = 'Jane Doe') {
  return {
    ...emptyResumeDocument(fullName, 'jane@example.com'),
    basics: {
      fullName,
      headline: 'Senior Backend Engineer',
      summary: 'Ten years of payments infrastructure.',
    },
    experience: [
      {
        company: 'Acme Payments',
        title: 'Senior Engineer',
        location: 'Bengaluru',
        employmentType: 'Full-time',
        startDate: '2021-03',
        endDate: undefined,
        isCurrent: true,
        highlights: ['Cut deploy time from 40 to 12 minutes', 'Owned the settlement ledger'],
        technologies: ['TypeScript', 'PostgreSQL'],
      },
    ],
    education: [
      {
        institution: 'IISc',
        degree: 'B.Tech',
        fieldOfStudy: 'Computer Science',
        startYear: 2013,
        endYear: 2017,
        grade: undefined,
        description: undefined,
      },
    ],
    skills: [{ name: 'TypeScript', proficiency: 'Advanced' }],
    projects: [
      {
        name: 'Ledger',
        url: 'https://example.com/ledger',
        description: 'Double-entry settlement ledger.',
        highlights: [],
        technologies: ['PostgreSQL'],
      },
    ],
    certifications: [],
    languages: [{ name: 'English', proficiency: 'Fluent' }],
  };
}

describe('resume builder: drafts, versions, history and PDF export (real database)', () => {
  let db: TestDatabase;
  let fx: PortalFixtures;
  let storage: ReturnType<typeof memoryStorage>;

  beforeAll(async () => {
    db = await createTestDatabase();
    installTestDatabase(db);
    fx = new PortalFixtures(db);
    storage = memoryStorage();
    setStorageDriver(storage);
  });

  afterAll(async () => {
    restoreDatabase();
    setStorageDriver(undefined);
    await db.$client.close();
  });

  /** A free candidate with one resume. */
  async function freeCandidateWithResume(): Promise<{ candidateId: string; resumeId: string }> {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const resume = await createResume(candidateId, { label: 'Main resume', makeDefault: true });
    return { candidateId, resumeId: resume.id };
  }

  /** A premium candidate with one resume. */
  async function premiumCandidateWithResume(): Promise<{ candidateId: string; resumeId: string }> {
    await truncateAllTables(db);
    const candidateId = await fx.premiumCandidate();
    const resume = await createResume(candidateId, { label: 'Main resume', makeDefault: true });
    return { candidateId, resumeId: resume.id };
  }

  it('gives a free candidate a blank draft to read but not to save', async () => {
    const { candidateId, resumeId } = await freeCandidateWithResume();

    // Reading is deliberately ungated: somebody whose plan lapsed must still be
    // able to see the work they already have.
    const draft = await getBuilderDraft(candidateId, resumeId);
    expect(draft.resumeId).toBe(resumeId);
    expect(draft.templateCode).toBeNull();
    expect(draft.sections).toEqual([]);
    expect(draft.completion).toBeGreaterThanOrEqual(0);

    // Writing is the paid capability.
    await expect(
      saveBuilderDraft(candidateId, resumeId, { document: filledDocument() })
    ).rejects.toThrowError(/premium/i);
  });

  it('round-trips a saved draft without minting a version', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    const saved = await saveBuilderDraft(candidateId, resumeId, {
      document: filledDocument('Grace Hopper'),
      templateCode: 'classic',
    });

    expect(saved.document.basics.fullName).toBe('Grace Hopper');
    expect(saved.templateCode).toBe('classic');
    expect(saved.sections).toContain('experience');
    expect(saved.sections).toContain('skills');
    expect(saved.completion).toBeGreaterThan(0);

    // The draft is a working copy, not a snapshot. Saving must not create a
    // version, or the history would fill with autosaves.
    expect(await listVersionHistory(candidateId, resumeId)).toHaveLength(0);
  });

  it('rejects an invalid document with readable field paths', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    await expect(
      saveBuilderDraft(candidateId, resumeId, {
        document: { ...emptyResumeDocument('Jane'), experience: [{ title: 'No company' }] },
      })
    ).rejects.toThrowError(/company/i);
  });

  it('refuses to read or write another candidate’s resume', async () => {
    const { resumeId } = await premiumCandidateWithResume();
    // The prober must also hold the builder entitlement, otherwise the 403 gate
    // fires first and the ownership check would never be reached.
    const otherCandidateId = await fx.premiumCandidate('Mallory');

    // 404, not 403: the response must not confirm that the id exists.
    await expect(getBuilderDraft(otherCandidateId, resumeId)).rejects.toThrowError(/not found/i);
    await expect(
      saveBuilderDraft(otherCandidateId, resumeId, { document: filledDocument() })
    ).rejects.toThrowError(/not found/i);
  });

  it('does not let the entitlement gate become an existence oracle', async () => {
    const { candidateId, resumeId } = await freeCandidateWithResume();
    const missingId = crypto.randomUUID();

    // A free candidate gets the SAME answer for a real id and a fake one, so the
    // 403 cannot be used to discover which resume ids exist.
    const real = await saveBuilderDraft(candidateId, resumeId, { document: filledDocument() }).catch(
      (error: Error) => error.message
    );
    const fake = await saveBuilderDraft(candidateId, missingId, { document: filledDocument() }).catch(
      (error: Error) => error.message
    );
    expect(real).toBe(fake);
  });

  it('gates the premium templates separately from the builder itself', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    // Free templates are fine for a builder subscriber.
    await expect(
      saveBuilderDraft(candidateId, resumeId, {
        document: filledDocument(),
        templateCode: 'compact',
      })
    ).resolves.toBeTruthy();

    // Now drop only the template entitlement. The builder stays writable, so a
    // 403 here can only come from the template gate.
    await revokeEntitlement({
      candidateId,
      entitlementCode: CANDIDATE_ENTITLEMENT_CODES.PROFESSIONAL_TEMPLATES,
    });

    await expect(
      saveBuilderDraft(candidateId, resumeId, {
        document: filledDocument(),
        templateCode: 'executive',
      })
    ).rejects.toThrowError(/premium/i);

    // An unknown template falls back to "no template" instead of 403: choosing a
    // layout must never be able to lose somebody's saved content.
    await expect(
      saveBuilderDraft(candidateId, resumeId, {
        document: filledDocument(),
        templateCode: 'does-not-exist',
      })
    ).resolves.toBeTruthy();
  });

  it('requires saved content before a version can be created', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    await expect(createBuilderVersion(candidateId, resumeId)).rejects.toThrowError(/save/i);

    // An empty document is not worth a version either.
    await saveBuilderDraft(candidateId, resumeId, { document: emptyResumeDocument('Jane') });
    await expect(createBuilderVersion(candidateId, resumeId)).rejects.toThrowError(/no content/i);
  });

  it('creates an immutable snapshot and numbers it from the existing versions', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    // Seed version 1 as an UPLOAD so numbering has to account for a source the
    // builder never created.
    await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'uploaded.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });

    await saveBuilderDraft(candidateId, resumeId, { document: filledDocument('Grace Hopper') });
    const version = await createBuilderVersion(candidateId, resumeId, { label: 'Backend CV' });

    expect(version.versionNumber).toBe(2);
    expect(version.source).toBe('builder');
    expect(version.label).toBe('Backend CV');
    expect(version.hasContent).toBe(true);
    // A builder-created version has no uploaded source file.
    expect(version.hasUpload).toBe(false);
    expect(version.hasPdf).toBe(false);

    // Editing the working copy afterwards must NOT change the snapshot.
    await saveBuilderDraft(candidateId, resumeId, {
      document: { ...filledDocument('Renamed Later') },
    });
    const [row] = await db
      .select({ contentJson: resumeVersions.contentJson })
      .from(resumeVersions)
      .where(eq(resumeVersions.id, version.id));
    expect((row?.contentJson as { basics: { fullName: string } }).basics.fullName).toBe(
      'Grace Hopper'
    );
  });

  it('caps a lapsed candidate at one version, including via the builder', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    // Version 1 is minted while they still pay.
    await saveBuilderDraft(candidateId, resumeId, { document: filledDocument('First Pass') });
    await createBuilderVersion(candidateId, resumeId);

    // The subscription lapses.
    await revokeEntitlement({
      candidateId,
      entitlementCode: CANDIDATE_ENTITLEMENT_CODES.MULTIPLE_VERSIONS,
    });
    await revokeEntitlement({
      candidateId,
      entitlementCode: CANDIDATE_ENTITLEMENT_CODES.RESUME_BUILDER,
    });

    // Writing new content is refused, and even the content already saved cannot
    // be minted into a second version. Gating only the builder's WRITE path
    // would let a free candidate keep unlimited history by snapshotting.
    await expect(
      saveBuilderDraft(candidateId, resumeId, { document: filledDocument('Second Pass') })
    ).rejects.toThrowError(/premium/i);
    await expect(createBuilderVersion(candidateId, resumeId)).rejects.toThrowError(/premium/i);

    // What they already produced is untouched.
    expect(await listVersionHistory(candidateId, resumeId)).toHaveLength(1);
  });

  it('re-reads a restored version into the working copy without destroying history', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    await saveBuilderDraft(candidateId, resumeId, { document: filledDocument('Version One') });
    const first = await createBuilderVersion(candidateId, resumeId);

    await saveBuilderDraft(candidateId, resumeId, { document: filledDocument('Version Two') });
    const second = await createBuilderVersion(candidateId, resumeId);

    const restored = await restoreVersionToDraft(candidateId, first.id);
    expect(restored.document.basics.fullName).toBe('Version One');

    // Restoring is a starting point, not an undo: the later version survives.
    const history = await listVersionHistory(candidateId, resumeId);
    expect(history.map((v) => v.versionNumber)).toEqual([2, 1]);
    expect(history.find((v) => v.id === second.id)).toBeTruthy();
  });

  it('will not restore a version that has no structured content', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    const uploaded = await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'v1.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });

    await expect(restoreVersionToDraft(candidateId, uploaded.id)).rejects.toThrowError(
      /no builder content/i
    );
  });

  it('renders a version to a stored PDF and records only its metadata', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    await saveBuilderDraft(candidateId, resumeId, {
      document: filledDocument(),
      templateCode: 'compact',
    });
    const version = await createBuilderVersion(candidateId, resumeId);
    const exported = await exportResumePdf(candidateId, version.id);

    expect(exported.templateCode).toBe('compact');
    expect(exported.byteSize).toBeGreaterThan(0);
    expect(exported.checksumSha256).toBeTruthy();
    expect(exported.renderedSections.length).toBeGreaterThan(0);

    // The row stores a KEY, never the bytes or a public URL.
    const [row] = await db
      .select({
        pdfStorageKey: resumeVersions.pdfStorageKey,
        pdfByteSize: resumeVersions.pdfByteSize,
        pdfChecksumSha256: resumeVersions.pdfChecksumSha256,
      })
      .from(resumeVersions)
      .where(eq(resumeVersions.id, version.id));
    expect(row?.pdfStorageKey).toBeTruthy();
    expect(row?.pdfByteSize).toBe(exported.byteSize);
    expect(row?.pdfChecksumSha256).toBe(exported.checksumSha256);

    const body = await readResumePdfForAuthorizedViewer(version.id, {
      candidateProfileId: candidateId,
    });
    expect(body.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.filename).toMatch(/-v\d+\.pdf$/);
  });

  it('replaces the stored PDF on re-export and deletes the superseded object', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    await saveBuilderDraft(candidateId, resumeId, { document: filledDocument() });
    const version = await createBuilderVersion(candidateId, resumeId);

    await exportResumePdf(candidateId, version.id);
    const [first] = await db
      .select({ key: resumeVersions.pdfStorageKey })
      .from(resumeVersions)
      .where(eq(resumeVersions.id, version.id));
    expect(storage.keys()).toContain(first?.key);

    await saveBuilderDraft(candidateId, resumeId, { document: filledDocument('Second Pass') });
    await exportResumePdf(candidateId, version.id);
    const [second] = await db
      .select({ key: resumeVersions.pdfStorageKey })
      .from(resumeVersions)
      .where(eq(resumeVersions.id, version.id));

    expect(second?.key).not.toBe(first?.key);
    // The orphaned object is cleaned up best-effort.
    expect(storage.keys()).not.toContain(first?.key);
    expect(storage.keys()).toContain(second?.key);
  });

  it('gates PDF export on pdf_resume_export', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    await saveBuilderDraft(candidateId, resumeId, { document: filledDocument() });
    const version = await createBuilderVersion(candidateId, resumeId);

    await revokeEntitlement({
      candidateId,
      entitlementCode: CANDIDATE_ENTITLEMENT_CODES.PDF_EXPORT,
    });

    await expect(exportResumePdf(candidateId, version.id)).rejects.toThrowError(/premium/i);
  });

  it('re-checks the paid template at render time, after a lapse', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    // The candidate chooses the premium layout while they still pay for it.
    await saveBuilderDraft(candidateId, resumeId, {
      document: filledDocument(),
      templateCode: 'technical',
    });
    const version = await createBuilderVersion(candidateId, resumeId);

    // The subscription lapses before they press "Download PDF". Re-checking at
    // render time turns this into an upgrade prompt rather than letting a
    // downgraded candidate keep producing premium documents.
    await revokeEntitlement({
      candidateId,
      entitlementCode: CANDIDATE_ENTITLEMENT_CODES.PROFESSIONAL_TEMPLATES,
    });

    await expect(exportResumePdf(candidateId, version.id)).rejects.toThrowError(/premium/i);
  });

  it('will not render an upload-only version', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    const uploaded = await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'v1.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });

    await expect(exportResumePdf(candidateId, uploaded.id)).rejects.toThrowError(/uploaded/i);
  });

  it('applies the same authorization to a PDF as to the source document', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    await saveBuilderDraft(candidateId, resumeId, { document: filledDocument() });
    const applied = await createBuilderVersion(candidateId, resumeId);
    const newer = await (async () => {
      await saveBuilderDraft(candidateId, resumeId, { document: filledDocument('Second Pass') });
      return createBuilderVersion(candidateId, resumeId);
    })();
    await exportResumePdf(candidateId, applied.id);
    await exportResumePdf(candidateId, newer.id);

    const { userId, companyId } = await fx.employerWithCompany('Employer Ltd');
    const jobId = await fx.job({ companyId });
    await applyToJob({ candidateProfileId: candidateId, jobId, resumeVersionId: applied.id });

    // The employer can open exactly the version they were sent.
    const theirs = await readResumePdfForAuthorizedViewer(applied.id, {
      employerUserId: userId,
      companyId,
    });
    expect(theirs.body.subarray(0, 5).toString()).toBe('%PDF-');

    // A newer version they were never sent must stay private, or switching to a
    // generated PDF would hand out a candidate's private draft.
    await expect(
      readResumePdfForAuthorizedViewer(newer.id, { employerUserId: userId, companyId })
    ).rejects.toThrowError(/not found/i);

    // An unrelated candidate cannot read it at all.
    await expect(
      readResumePdfForAuthorizedViewer(applied.id, {
        candidateProfileId: await fx.candidate(),
      })
    ).rejects.toThrowError(/not found/i);

    // An administrator can, for oversight.
    const admin = await readResumePdfForAuthorizedViewer(applied.id, {
      adminUserId: await fx.user('admin'),
    });
    expect(admin.body.byteLength).toBeGreaterThan(0);
  });

  it('reports no PDF until one has been generated', async () => {
    const { candidateId, resumeId } = await premiumCandidateWithResume();

    await saveBuilderDraft(candidateId, resumeId, { document: filledDocument() });
    const version = await createBuilderVersion(candidateId, resumeId);

    await expect(
      readResumePdfForAuthorizedViewer(version.id, { candidateProfileId: candidateId })
    ).rejects.toThrowError(/no pdf/i);
  });
});
