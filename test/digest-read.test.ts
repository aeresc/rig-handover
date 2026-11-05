import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { countNight, readNight } from '../src/digest/read.js';

// runs/ is read-only: only read from it. Writes go to a temp dir.
const tmp = mkdtempSync(join(tmpdir(), 'rig-digest-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 jobs and 1 bad line, sorted by job', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, keeps the last status and the offset', () => {
    const row = night?.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toMatchObject({
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the last error of a failed job', () => {
    const row = night?.rows.find((r) => r.job === 'notes/backup');
    expect(row?.lastStatus).toBe('fail');
    expect(row?.lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    const row = night?.rows.find((r) => r.job === 'digest/render');
    expect(row).toBeDefined();
    expect(row?.owner).toBeNull();
  });
});

describe('readNight edge cases', () => {
  it('returns null for a night with no file', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
    expect(readNight(tmp, '1999-01-01')).toBeNull();
  });

  it('returns null for a night that is not a date', () => {
    expect(readNight('runs', '../package')).toBeNull();
  });

  it('reads an empty file as no rows and no bad lines', () => {
    writeFileSync(join(tmp, '2026-01-01.jsonl'), '');
    expect(readNight(tmp, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
  });

  it('counts bad lines and does not count the trailing newline', () => {
    const lines = [
      '{"at":"2026-01-02T23:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      'not json',
      '{"at":"2026-01-02T23:01:00+01:00","job":"a","status":"maybe","owner":"x"}',
      '{"job":"a","status":"ok","owner":"x"}',
      '{"at":"yesterday","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-02T23:02:00+01:00","status":"ok","owner":"x"}',
      '{"at":"2026-01-02T23:03:00+01:00","job":"a","status":"retry","owner":"x","error":"boom"}',
      '',
    ];
    writeFileSync(join(tmp, '2026-01-02.jsonl'), lines.join('\n'));
    const night = readNight(tmp, '2026-01-02');
    expect(night?.badLines).toBe(5);
    expect(night?.rows).toEqual([
      {
        job: 'a',
        owner: 'x',
        runs: 2,
        retries: 1,
        lastStatus: 'retry',
        lastError: 'boom',
        firstAt: '2026-01-02T23:00:00+01:00',
        lastAt: '2026-01-02T23:03:00+01:00',
      },
    ]);
  });
});

describe('countNight', () => {
  it('counts parsed lines by status for 2026-10-28', () => {
    expect(countNight('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });

  it('returns null for a night with no file', () => {
    expect(countNight('runs', '1999-01-01')).toBeNull();
  });
});
