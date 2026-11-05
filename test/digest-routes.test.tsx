import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const line = (at: string, job: string, status: string, owner: string | null, error?: string) =>
  JSON.stringify({ at, job, status, owner, ...(error ? { error } : {}) });

// Jobs are written out of order on purpose: rows must come back sorted by job.
const GOOD = [
  line('2026-10-30T01:00:00+01:00', 'zeta-sync', 'ok', 'ana'),
  line('2026-10-30T01:10:00+01:00', 'alpha-backup', 'retry', 'bo', 'timeout'),
  line('2026-10-30T01:20:00+01:00', 'alpha-backup', 'ok', 'bo'),
  line('2026-10-30T02:00:00+01:00', 'mid-report', 'fail', null, 'boom'),
];
const JOBS = ['alpha-backup', 'mid-report', 'zeta-sync'];

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, '2026-10-30.jsonl'), GOOD.join('\n') + '\n');
  writeFileSync(join(runsDir, '2026-10-31.jsonl'), '');
  writeFileSync(join(runsDir, '2026-11-01.jsonl'), [...GOOD, '{"at":"2026-10-31T03:00:00+01:00","job":"cut'].join('\n') + '\n');
  app = createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir });
});

afterAll(() => rmSync(runsDir, { recursive: true, force: true }));

const jobOrder = (html: string) =>
  JOBS.map((j) => ({ j, i: html.indexOf(j) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.j);

const rowCount = (html: string) => {
  const body = html.includes('<tbody') ? html.slice(html.indexOf('<tbody')) : html;
  const trs = (body.match(/<tr[\s>]/g) ?? []).length;
  return html.includes('<tbody') ? trs : trs - 1;
};

describe('GET /digest/:night', () => {
  it('200 with one row per job, in job order', async () => {
    const res = await app.request('/digest/2026-10-30');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(jobOrder(html)).toEqual(JOBS);
    expect(rowCount(html)).toBe(JOBS.length);
  });

  it('404 for a night with no file', async () => {
    expect((await app.request('/digest/2026-01-01')).status).toBe(404);
  });

  it('says nothing ran for an empty night', async () => {
    const res = await app.request('/digest/2026-10-31');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders the good jobs when a line is bad', async () => {
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(jobOrder(html)).toEqual(JOBS);
  });

  it('404 for an invalid night param', async () => {
    expect((await app.request('/digest/..%2Fetc')).status).toBe(404);
  });
});

describe('GET /api/digest/:night', () => {
  it('200 with the Night as JSON, rows in job order', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.night).toBe('2026-10-30');
    expect(body.rows.map((r) => r.job)).toEqual(JOBS);
    expect(body.badLines).toBe(0);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('gives no rows and no bad lines for an empty night', async () => {
    const res = await app.request('/api/digest/2026-10-31');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts a bad line and still returns 200', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(JOBS);
  });

  it('404 for an invalid night param', async () => {
    expect((await app.request('/api/digest/..%2Fetc')).status).toBe(404);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order', async () => {
    for (const night of ['2026-10-30', '2026-11-01']) {
      const html = await (await app.request(`/digest/${night}`)).text();
      const json = (await (await app.request(`/api/digest/${night}`)).json()) as Night;
      expect(jobOrder(html)).toEqual(json.rows.map((r) => r.job));
    }
  });
});
