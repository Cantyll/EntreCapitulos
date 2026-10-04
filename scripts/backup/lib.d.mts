export class BackupError extends Error {}

export interface BackupConfig {
  formatVersion: number;
  prefixes: { daily: string; weekly: string };
  retentionDays: { daily: number; weekly: number };
  maxAgeHours: { daily: number; weekly: number };
  size: { minBytes: number; minRatioOfPrevious: number };
  preflight: { prefix: string; passphraseMinLength: number };
  dump: {
    schemas: string[];
    excludeTables: string[];
    requiredTables: string[];
    allowedTables: string[];
  };
}

export interface Manifest {
  formatVersion: number;
  createdAt: string;
  cliVersion: string;
  repoLatestMigration: string;
  tables: Record<string, number>;
  files: Record<string, string>;
}

export interface ListEntry {
  key: string;
  size: number;
  lastModified: string;
}

export function isTableName(value: unknown): boolean;
export function countCopyRows(lines: Iterable<string>): Record<string, number>;
export function checkTables(
  counts: Record<string, number>,
  config: BackupConfig,
): { absent: string[] };
export function buildManifest(input: {
  createdAt: string;
  cliVersion: string;
  repoLatestMigration: string;
  counts: Record<string, number>;
  files: Record<string, string>;
  formatVersion?: number;
}): Manifest;
export function validateManifest(manifest: unknown): void;
export function sha256(buffer: Uint8Array | string): string;
export function compareCounts(
  expected: Record<string, number>,
  actual: Record<string, number>,
): void;
export function checkSize(input: {
  size: number;
  previousSize?: number | null;
  config: BackupConfig;
  acceptSmaller?: boolean;
}): void;
export function ageHours(lastModified: string, now?: Date): number;
export function checkAge(input: {
  kind: 'daily' | 'weekly';
  lastModified: string;
  config: BackupConfig;
  now?: Date;
}): void;
export function latestEntry(entries: ListEntry[]): ListEntry | null;
export function previousEntry(entries: ListEntry[], todayKey: string): ListEntry | null;
export function dailyKey(config: BackupConfig, date: string): string;
export function weeklyKey(config: BackupConfig, date: string): string;
export function parseBackupChoice(value: string, config: BackupConfig): string;

export type PreflightResult = 'OK' | 'FALHOU' | 'PULADO';

export interface PreflightRecord {
  item: string;
  result: PreflightResult;
  reason: string;
  step?: string;
  code?: number;
  ident?: string;
}

export interface PreflightScope {
  environment: 'backup' | 'restore';
  title: string;
  items: string[];
}

export interface PreflightEvaluation {
  scope: string;
  records: PreflightRecord[];
  failed: boolean;
  counts: { total: number; failed: number; skipped: number };
}

export interface PreflightRow {
  item: string;
  label: string;
  short: string;
  result: PreflightResult;
  motivo: string;
  acao: string;
}

export interface PreflightTextOptions {
  passphraseMinLength?: number;
}

export const RESULTS: PreflightResult[];
export const SECRET_NAMES: string[];
export const SECRET_SPECS: Record<
  string,
  { hint: string; test: (value: string, config?: BackupConfig) => boolean }
>;
export const SCOPES: Record<string, PreflightScope>;
export const REASON_IDS: string[];
export function isScope(name: unknown): boolean;
export function isStep(name: unknown): boolean;
export function checkSecretFormat(
  name: string,
  value: string | undefined,
  config?: BackupConfig,
): 'ok' | 'absent' | 'empty' | 'whitespace' | 'format';
export function isSafeIdentifier(value: unknown, secrets?: string[]): boolean;
export function extractIdentifier(text: string, secrets?: string[]): string | null;
export function classify(input: {
  step: string;
  exitCode: number;
  text?: string;
  secrets?: string[];
}): PreflightRecord;
export function internalFailure(step: string, exitCode: number): PreflightRecord;
export function formatRecord(
  name: string,
  value: string | undefined,
  config?: BackupConfig,
): PreflightRecord;
export function sanitizeRecord(raw: unknown): PreflightRecord | null;
export function parseRecords(text: string): { records: PreflightRecord[]; invalid: number };
export function evaluatePreflight(
  records: PreflightRecord[],
  scope: string,
  options?: { invalid?: number },
): PreflightEvaluation;
export function describeRecord(
  record: PreflightRecord,
  scope: string,
  options?: PreflightTextOptions,
): PreflightRow;
export function rotatedSkip(evaluation: PreflightEvaluation): boolean;
export function renderPreflightSummary(
  evaluation: PreflightEvaluation,
  options?: PreflightTextOptions,
): string;
export function renderPreflightMissing(scope: string): string;
export function preflightAnnotations(
  evaluation: PreflightEvaluation,
  options?: PreflightTextOptions,
): string[];
export function preflightLogLines(
  evaluation: PreflightEvaluation,
  options?: PreflightTextOptions,
): string[];
