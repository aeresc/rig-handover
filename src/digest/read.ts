// Plan morning-digest § 1: read runs/<night>.jsonl into one row per job.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, NightCounts, ReadNight, RunLine, RunStatus } from './types.js';

const NIGHT = /^\d{4}-\d{2}-\d{2}$/;
// ISO 8601 date-time with an explicit offset (Z or ±hh:mm), as the log writes it.
const ISO_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

function isStatus(value: unknown): value is RunStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Parse one log line at the edge. Returns null for anything that is not a valid RunLine.
export function parseLine(text: string): RunLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const { at, job, status, owner, error } = raw;
  if (typeof at !== 'string' || !ISO_AT.test(at) || Number.isNaN(Date.parse(at))) return null;
  if (typeof job !== 'string' || job === '') return null;
  if (!isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status, owner };
  if (error !== undefined) line.error = error;
  return line;
}

type Parsed = { lines: RunLine[]; badLines: number };

// Reads and parses the night's file; null when there is no file for that night.
function readLines(runsDir: string, night: string): Parsed | null {
  if (!NIGHT.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if (isRecord(err) && err.code === 'ENOENT') return null;
    throw err;
  }
  const lines: RunLine[] = [];
  let badLines = 0;
  for (const chunk of text.split('\n')) {
    const trimmed = chunk.trim();
    if (trimmed === '') continue;
    const line = parseLine(trimmed);
    if (line) lines.push(line);
    else badLines += 1;
  }
  return { lines, badLines };
}

export const readNight: ReadNight = (runsDir, night) => {
  const parsed = readLines(runsDir, night);
  if (!parsed) return null;
  const byJob = new Map<string, RunLine[]>();
  for (const line of parsed.lines) {
    const runs = byJob.get(line.job);
    if (runs) runs.push(line);
    else byJob.set(line.job, [line]);
  }
  const rows: DigestRow[] = [];
  for (const [job, runs] of byJob) {
    const first = runs[0];
    const last = runs[runs.length - 1];
    if (!first || !last) continue;
    rows.push({
      job,
      owner: last.owner,
      runs: runs.length,
      retries: runs.filter((r) => r.status === 'retry').length,
      lastStatus: last.status,
      lastError: last.error ?? null,
      firstAt: first.at,
      lastAt: last.at,
    });
  }
  rows.sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  const result: Night = { night, rows, badLines: parsed.badLines };
  return result;
};

// Counts of parsed log lines by status for the board link (§ 2c); null when no file.
export function countNight(runsDir: string, night: string): NightCounts | null {
  const parsed = readLines(runsDir, night);
  if (!parsed) return null;
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of parsed.lines) counts[line.status] += 1;
  return counts;
}
