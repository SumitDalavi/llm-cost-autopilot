import { RequestLog, StatsResponse } from './types';
import { dbAdapter } from './lib/db-factory';

/**
 * PCL Database layer
 * Promotes to PostgreSQL when DATABASE_URL is set,
 * defaults to SQLite via sql.js for mock/offline/CI mode.
 */

export async function getDb(): Promise<any> {
  await dbAdapter.init();
  return dbAdapter;
}

export async function insertLog(log: RequestLog): Promise<void> {
  return dbAdapter.insertLog(log);
}

export async function updateQualityScore(id: string, score: number, escalatedToModel?: string): Promise<void> {
  return dbAdapter.updateQualityScore(id, score, escalatedToModel);
}

export async function getStats(): Promise<StatsResponse> {
  return dbAdapter.getStats();
}

export async function getRecentLogs(limit = 50): Promise<RequestLog[]> {
  return dbAdapter.getRecentLogs(limit);
}

export const getDbMode = () => dbAdapter.mode;
