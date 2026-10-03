export class BackupError extends Error {}

export interface BackupConfig {
  formatVersion: number;
  prefixes: { daily: string; weekly: string };
  retentionDays: { daily: number; weekly: number };
  maxAgeHours: { daily: number; weekly: number };
  size: { minBytes: number; minRatioOfPrevious: number };
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
export function scrubLog(text: string, secretValues?: string[]): string;
