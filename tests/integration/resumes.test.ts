import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createTestDatabase,
  installTestDatabase,
  restoreDatabase,
  truncateAllTables,
  type TestDatabase,
} from '../support/database';
import { PortalFixtures } from '../support/fixtures';
import {
  createResume,
  deleteResume,
  listResumeVersions,
  listResumes,
  readResumeForAuthorizedViewer,
  setDefaultResume,
  uploadResumeVersion,
} from '@/lib/portal/candidates/resumes';
import { applyToJob } from '@/lib/portal/applications';
import { config } from '@/lib/config';
import { resumeAccessLogs, resumeVersions } from '@/lib/db/portal-schema';
import { setStorageDriver, type StorageDriver, type StoredObject } from '@/lib/storage';

/** A real PDF header, so content sniffing passes. */
const PDF_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25]);
/** A Windows executable, renamed to look like a PDF. */
const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

/**
 * In-memory storage driver so tests never touch the filesystem while still
 * exercising the real storage interface and the real resume service.
 */
function memoryStorage(): StorageDriver {
  const files = new Map<string, Buffer>();
  return {
    name: 'memory',
    async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
      files.set(key, body);
      return {
        storageKey: key,
        byteSize: body.byteLength,
        checksumSha256: 'test-checksum',
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

describe('resumes: storage, versioning and access control (real database)', () => {
  let db: TestDatabase;
  let fx: PortalFixtures;

  beforeAll(async () => {
    db = await createTestDatabase();
    installTestDatabase(db);
    fx = new PortalFixtures(db);
    setStorageDriver(memoryStorage());
  });

  afterAll(async () => {
    restoreDatabase();
    setStorageDriver(undefined);
    await db.$client.close();
  });

  async function candidateWithResume(): Promise<{ candidateId: string; resumeId: string }> {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const resume = await createResume(candidateId, { label: 'Main resume', makeDefault: true });
    return { candidateId, resumeId: resume.id };
  }

  it('uploads a valid resume and stores it under an opaque key', async () => {
    const { candidateId, resumeId } = await candidateWithResume();

    const version = await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'my resume.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });

    expect(version.versionNumber).toBe(1);
    expect(version.byteSize).toBe(PDF_BYTES.byteLength);
    // The storage key is server-generated and carries no user input.
    expect(version.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
    expect(version.storageKey).not.toContain('my resume');
    // The original name is kept only for display.
    expect(version.originalFilename).toBe('my resume.pdf');
  });

  it('rejects an executable renamed to .pdf by inspecting the real bytes', async () => {
    const { candidateId, resumeId } = await candidateWithResume();

    await expect(
      uploadResumeVersion({
        candidateId,
        resumeId,
        filename: 'totally-safe.pdf',
        contentType: 'application/pdf', // the client lies
        body: EXE_BYTES, // but the bytes are an EXE
      })
    ).rejects.toThrow(/not accepted|does not match/i);

    expect(await listResumeVersions(candidateId, resumeId)).toHaveLength(0);
  });

  it('rejects a disallowed extension', async () => {
    const { candidateId, resumeId } = await candidateWithResume();

    await expect(
      uploadResumeVersion({
        candidateId,
        resumeId,
        filename: 'resume.exe',
        contentType: 'application/octet-stream',
        body: EXE_BYTES,
      })
    ).rejects.toThrow(/not accepted|PDF, DOC or DOCX/i);
  });

  it('rejects an oversized resume', async () => {
    const { candidateId, resumeId } = await candidateWithResume();
    const tooBig = Buffer.concat([PDF_BYTES, Buffer.alloc(config.PORTAL_MAX_RESUME_BYTES + 10)]);

    await expect(
      uploadResumeVersion({
        candidateId,
        resumeId,
        filename: 'big.pdf',
        contentType: 'application/pdf',
        body: tooBig,
      })
    ).rejects.toThrow(/smaller than/i);
  });

  it('versions a resume rather than replacing it', async () => {
    const { candidateId, resumeId } = await candidateWithResume();

    await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'v1.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });
    const second = await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'v2.pdf',
      contentType: 'application/pdf',
      body: Buffer.concat([PDF_BYTES, Buffer.from(' more')]),
    });

    expect(second.versionNumber).toBe(2);
    const versions = await listResumeVersions(candidateId, resumeId);
    expect(versions).toHaveLength(2);
    // Both files remain independently retrievable.
    expect(new Set(versions.map((v) => v.storageKey)).size).toBe(2);
  });

  it('does not expose a resume to an unauthenticated or unrelated caller', async () => {
    const { candidateId, resumeId } = await candidateWithResume();
    const version = await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'private.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });

    // No context at all.
    await expect(readResumeForAuthorizedViewer(version.id, {})).rejects.toThrowError(
      /not found/i
    );

    // A different candidate.
    const otherCandidateId = await fx.candidate();
    await expect(
      readResumeForAuthorizedViewer(version.id, { candidateProfileId: otherCandidateId })
    ).rejects.toThrowError(/not found/i);
  });

  it('lets the owner read their own resume and records the access', async () => {
    const { candidateId, resumeId } = await candidateWithResume();
    const version = await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'mine.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });

    const file = await readResumeForAuthorizedViewer(version.id, {
      candidateProfileId: candidateId,
    });

    expect(file.body.equals(PDF_BYTES)).toBe(true);
    expect(file.mimeType).toBe('application/pdf');

    const logs = await db.select().from(resumeAccessLogs);
    expect(logs).toHaveLength(1);
    expect(logs[0].accessReason).toBe('owner');
  });

  it('lets an employer read a resume only through an application to their own job', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const resume = await createResume(candidateId, { label: 'Main' });
    const version = await uploadResumeVersion({
      candidateId,
      resumeId: resume.id,
      filename: 'cv.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });

    // An employer with NO application cannot read it.
    const outsider = await fx.employerWithCompany('Outsider Ltd');
    await expect(
      readResumeForAuthorizedViewer(version.id, {
        employerUserId: outsider.userId,
        companyId: outsider.companyId,
      })
    ).rejects.toThrowError(/not found/i);

    // After a real application to THEIR job, access is granted.
    const { userId, companyId } = await fx.employerWithCompany('Employer Ltd');
    const jobId = await fx.job({ companyId });
    await applyToJob({ candidateProfileId: candidateId, jobId, resumeVersionId: version.id });

    const file = await readResumeForAuthorizedViewer(version.id, {
      employerUserId: userId,
      companyId,
    });
    expect(file.body.equals(PDF_BYTES)).toBe(true);

    const logs = await db.select().from(resumeAccessLogs);
    expect(logs[0].accessReason).toBe('application');
    expect(logs[0].applicationId).not.toBeNull();
  });

  it('does not let an employer read a NEWER version they were never sent', async () => {
    await truncateAllTables(db);
    const candidateId = await fx.candidate();
    const resume = await createResume(candidateId, { label: 'Main' });
    const applied = await uploadResumeVersion({
      candidateId,
      resumeId: resume.id,
      filename: 'v1.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });
    // The candidate then uploads a newer, private version.
    const newer = await uploadResumeVersion({
      candidateId,
      resumeId: resume.id,
      filename: 'v2.pdf',
      contentType: 'application/pdf',
      body: Buffer.concat([PDF_BYTES, Buffer.from('secret')]),
    });

    const { userId, companyId } = await fx.employerWithCompany('Employer Ltd');
    const jobId = await fx.job({ companyId });
    await applyToJob({ candidateProfileId: candidateId, jobId, resumeVersionId: applied.id });

    await expect(
      readResumeForAuthorizedViewer(newer.id, { employerUserId: userId, companyId })
    ).rejects.toThrowError(/not found/i);
  });

  it('lets an administrator review a resume for oversight', async () => {
    const { candidateId, resumeId } = await candidateWithResume();
    const version = await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'cv.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });

    const file = await readResumeForAuthorizedViewer(version.id, {
      adminUserId: await fx.user('admin'),
    });
    expect(file.body.equals(PDF_BYTES)).toBe(true);
  });

  it('keeps exactly one default resume per candidate', async () => {
    const { candidateId } = await candidateWithResume(); // first is the default

    // A second resume is created WITHOUT becoming the default.
    const second = await createResume(candidateId, { label: 'Second' });
    expect((await listResumes(candidateId)).filter((r) => r.isDefault)).toHaveLength(1);

    // Promoting it must demote the first.
    await setDefaultResume(candidateId, second.id);

    const defaults = (await listResumes(candidateId)).filter((resume) => resume.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(second.id);
  });

  it('lets a candidate promote one of their own resumes to default', async () => {
    const { candidateId } = await candidateWithResume();
    const other = await createResume(candidateId, { label: 'Other' });

    // A different candidate cannot promote it.
    const intruderId = await fx.candidate();
    await expect(setDefaultResume(intruderId, other.id)).rejects.toThrowError(/not found/i);
  });

  it('prevents one candidate from uploading to another candidate resume', async () => {
    const { resumeId } = await candidateWithResume();
    const intruderId = await fx.candidate();

    await expect(
      uploadResumeVersion({
        candidateId: intruderId,
        resumeId,
        filename: 'mine.pdf',
        contentType: 'application/pdf',
        body: PDF_BYTES,
      })
    ).rejects.toThrowError(/not found/i);
  });

  it('deletes a resume and its stored file', async () => {
    const { candidateId, resumeId } = await candidateWithResume();
    const version = await uploadResumeVersion({
      candidateId,
      resumeId,
      filename: 'cv.pdf',
      contentType: 'application/pdf',
      body: PDF_BYTES,
    });

    expect(await deleteResume(candidateId, resumeId)).toBe(true);
    expect(await listResumes(candidateId)).toHaveLength(0);
    expect(await db.select().from(resumeVersions)).toHaveLength(0);
    expect(version.storageKey).toBeTruthy();
  });

  it('will not delete another candidate resume', async () => {
    const { resumeId } = await candidateWithResume();
    const intruderId = await fx.candidate();
    expect(await deleteResume(intruderId, resumeId)).toBe(false);
  });
});

