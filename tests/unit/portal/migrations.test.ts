import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Drizzle resolves migration files by the `tag` recorded in `drizzle/meta/_journal.json`.
 * If a migration file is renamed without updating the journal, `drizzle-kit migrate`
 * silently finds no SQL for that entry and the schema is left partially applied.
 *
 * These assertions read only committed files, so they need no database.
 */
const ROOT = process.cwd();
const DRIZZLE_DIR = join(ROOT, 'drizzle');
const JOURNAL_PATH = join(DRIZZLE_DIR, 'meta', '_journal.json');

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface Journal {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const journal = JSON.parse(readFileSync(JOURNAL_PATH, 'utf8')) as Journal;
const sqlFiles = readdirSync(DRIZZLE_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort();

describe('drizzle migration journal', () => {
  it('references a SQL file that exists for every journal entry', () => {
    const missing: string[] = [];
    for (const entry of journal.entries) {
      if (!sqlFiles.includes(`${entry.tag}.sql`)) missing.push(entry.tag);
    }
    // A tag with no file is the exact failure this guards against.
    expect(missing).toEqual([]);
  });

  it('has a journal entry for every SQL file on disk', () => {
    const tags = new Set(journal.entries.map((entry) => `${entry.tag}.sql`));
    const orphans = sqlFiles.filter((file) => !tags.has(file));
    // An unjournalled file would never be applied.
    expect(orphans).toEqual([]);
  });

  it('keeps indexes contiguous and ordered', () => {
    const indexes = journal.entries.map((entry) => entry.idx);
    expect(indexes).toEqual(indexes.map((_, position) => position));
  });

  it('applies entries in non-decreasing timestamp order', () => {
    const times = journal.entries.map((entry) => entry.when);
    const sorted = [...times].sort((a, b) => a - b);
    // Drizzle replays in array order, so timestamps must not go backwards.
    expect(times).toEqual(sorted);
  });

  it('targets postgresql', () => {
    expect(journal.dialect).toBe('postgresql');
  });

  it('has a snapshot for every migration entry', () => {
    const snapshots = new Set(readdirSync(join(DRIZZLE_DIR, 'meta')));
    const missing = journal.entries
      .map((entry) => `${entry.idx.toString().padStart(4, '0')}_snapshot.json`)
      .filter((name) => !snapshots.has(name));
    expect(missing).toEqual([]);
  });
});
