// Plan morning-digest § 1. The contract for the run log reader and every part of § 2.
// Types only: the reader in src/digest/ implements ReadNight.

// `status` of one run, as written in runs/<night>.jsonl.
export type RunStatus = 'ok' | 'retry' | 'fail';

// One parsed line of runs/<night>.jsonl (§ 1). `at` keeps the log's ISO string and offset.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job (§ 1). Times are the log's ISO strings with their offset; never converted
// to UTC (styleguide). `owner` null stays a row; views show it as `—`.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// What readNight returns for a night whose file exists. `rows` sorted by job; `badLines`
// counts lines that did not parse (counted, never thrown). An empty file gives rows: [].
export type Night = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

// Per-night ok / retry / fail counts for the board link (§ 2c).
export type NightCounts = Record<RunStatus, number>;

// readNight(runsDir, night) reads runs/<night>.jsonl (§ 1). Returns null when there is no
// file for that night (page: 404, § 2a); an empty file returns a Night with no rows
// (page: "nothing ran").
export type ReadNight = (runsDir: string, night: string) => Night | null;
