import { Pool } from 'pg';
import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { RequestLog, StatsResponse } from '../types';
import { isRealPostgresUrl } from './credential-mode';

export interface DbAdapter {
  mode: 'mock' | 'live';
  init(): Promise<void>;
  insertLog(log: RequestLog): Promise<void>;
  updateQualityScore(id: string, score: number, escalatedToModel?: string): Promise<void>;
  getStats(): Promise<StatsResponse>;
  getRecentLogs(limit?: number): Promise<RequestLog[]>;
}

export function createDatabaseAdapter(): DbAdapter {
  const dbUrl = process.env.DATABASE_URL;
  const isPostgres = isRealPostgresUrl(dbUrl);

  if (isPostgres) {
    console.log('[db] MODE=live using PostgreSQL:', dbUrl!.replace(/:[^:@]+@/, ':***@'));
    const pool = new Pool({
      connectionString: dbUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
    });

    let initialized = false;

    async function init() {
      if (initialized) return;
      await pool.query(`
        CREATE TABLE IF NOT EXISTS request_logs (
          id TEXT PRIMARY KEY,
          prompt_hash TEXT NOT NULL,
          prompt_preview TEXT NOT NULL,
          complexity_tier TEXT NOT NULL,
          routed_model TEXT NOT NULL,
          provider TEXT NOT NULL,
          input_tokens INTEGER NOT NULL,
          output_tokens INTEGER NOT NULL,
          cost REAL NOT NULL,
          latency_ms INTEGER NOT NULL,
          quality_score REAL,
          was_escalated INTEGER NOT NULL DEFAULT 0,
          escalated_to_model TEXT,
          timestamp TEXT NOT NULL
        )
      `);
      initialized = true;
    }

    return {
      mode: 'live',
      init,
      async insertLog(log: RequestLog): Promise<void> {
        await init();
        await pool.query(
          `INSERT INTO request_logs (
            id, prompt_hash, prompt_preview, complexity_tier, routed_model, provider,
            input_tokens, output_tokens, cost, latency_ms, quality_score,
            was_escalated, escalated_to_model, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (id) DO NOTHING`,
          [
            log.id, log.promptHash, log.promptPreview, log.complexityTier,
            log.routedModel, log.provider, log.inputTokens, log.outputTokens,
            log.cost, log.latencyMs, log.qualityScore ?? null,
            log.wasEscalated ? 1 : 0, log.escalatedToModel ?? null, log.timestamp
          ]
        );
      },
      async updateQualityScore(id: string, score: number, escalatedToModel?: string): Promise<void> {
        await init();
        await pool.query(
          `UPDATE request_logs SET quality_score = $1, was_escalated = $2, escalated_to_model = $3 WHERE id = $4`,
          [score, escalatedToModel ? 1 : 0, escalatedToModel ?? null, id]
        );
      },
      async getStats(): Promise<StatsResponse> {
        await init();
        const totalsResult = await pool.query(`
          SELECT
            COUNT(*)::int as "totalRequests",
            COALESCE(SUM(cost), 0)::float as "totalCost",
            COALESCE(AVG(quality_score), 0)::float as "avgQualityScore",
            COALESCE(AVG(latency_ms), 0)::float as "avgLatencyMs",
            COALESCE(AVG(was_escalated), 0)::float as "escalationRate"
          FROM request_logs
        `);

        const gpt4oCostResult = await pool.query(`
          SELECT COALESCE(SUM(input_tokens * 0.0000025 + output_tokens * 0.000010), 0)::float as "totalIfGpt4o"
          FROM request_logs
        `);

        const distResult = await pool.query(`
          SELECT routed_model, COUNT(*)::int as count FROM request_logs GROUP BY routed_model
        `);

        const row = totalsResult.rows[0] || {};
        const totalRequests = row.totalRequests || 0;
        const totalCost = row.totalCost || 0;
        const gpt4oCost = gpt4oCostResult.rows[0]?.totalIfGpt4o || 0;

        const routingDistribution: Record<string, number> = {};
        for (const r of distResult.rows) {
          routingDistribution[r.routed_model] = r.count;
        }

        const savedAmount = gpt4oCost - totalCost;
        const savingsPercentage = gpt4oCost > 0 ? (savedAmount / gpt4oCost) * 100 : 0;

        return {
          totalRequests,
          totalCost,
          totalCostIfAllGpt4o: gpt4oCost,
          savedAmount,
          savingsPercentage,
          routingDistribution,
          escalationRate: (row.escalationRate || 0) * 100,
          avgQualityScore: row.avgQualityScore || 0,
          avgLatencyMs: row.avgLatencyMs || 0,
        };
      },
      async getRecentLogs(limit = 50): Promise<RequestLog[]> {
        await init();
        const result = await pool.query(`SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT $1`, [limit]);
        return result.rows.map((row: any) => ({
          id: row.id,
          promptHash: row.prompt_hash,
          promptPreview: row.prompt_preview,
          complexityTier: row.complexity_tier,
          routedModel: row.routed_model,
          provider: row.provider,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          cost: row.cost,
          latencyMs: row.latency_ms,
          qualityScore: row.quality_score,
          wasEscalated: row.was_escalated === 1,
          escalatedToModel: row.escalated_to_model,
          timestamp: row.timestamp,
        }));
      },
    };
  }

  // MOCK MODE — SQLite via sql.js (zero external dependencies)
  console.log('[db] MODE=mock using SQLite (sql.js) — set DATABASE_URL=postgres://... for PostgreSQL');
  let sqliteDb: Database | null = null;
  const dbPath = process.env.DB_PATH ?? './data/autopilot.db';

  async function getSqlite(): Promise<Database> {
    if (!sqliteDb) {
      const SQL = await initSqlJs();
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        try { fs.mkdirSync(dbDir, { recursive: true }); } catch (e) {}
      }

      if (fs.existsSync(dbPath)) {
        const fileBuffer = fs.readFileSync(dbPath);
        sqliteDb = new SQL.Database(fileBuffer);
      } else {
        sqliteDb = new SQL.Database();
      }

      sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS request_logs (
          id TEXT PRIMARY KEY,
          prompt_hash TEXT NOT NULL,
          prompt_preview TEXT NOT NULL,
          complexity_tier TEXT NOT NULL,
          routed_model TEXT NOT NULL,
          provider TEXT NOT NULL,
          input_tokens INTEGER NOT NULL,
          output_tokens INTEGER NOT NULL,
          cost REAL NOT NULL,
          latency_ms INTEGER NOT NULL,
          quality_score REAL,
          was_escalated INTEGER NOT NULL DEFAULT 0,
          escalated_to_model TEXT,
          timestamp TEXT NOT NULL
        )
      `);

      process.on('exit', () => persist());
      process.on('SIGINT', () => { persist(); process.exit(0); });
    }
    return sqliteDb;
  }

  function persist() {
    if (!sqliteDb || dbPath === ':memory:') return;
    try {
      const data = sqliteDb.export();
      fs.writeFileSync(dbPath, Buffer.from(data));
    } catch (e) {}
  }

  return {
    mode: 'mock',
    async init() {
      await getSqlite();
    },
    async insertLog(log: RequestLog): Promise<void> {
      const db = await getSqlite();
      db.run(`
        INSERT INTO request_logs (
          id, prompt_hash, prompt_preview, complexity_tier, routed_model, provider,
          input_tokens, output_tokens, cost, latency_ms, quality_score,
          was_escalated, escalated_to_model, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        log.id, log.promptHash, log.promptPreview, log.complexityTier,
        log.routedModel, log.provider, log.inputTokens, log.outputTokens,
        log.cost, log.latencyMs, log.qualityScore ?? null,
        log.wasEscalated ? 1 : 0, log.escalatedToModel ?? null, log.timestamp
      ]);
      persist();
    },
    async updateQualityScore(id: string, score: number, escalatedToModel?: string): Promise<void> {
      const db = await getSqlite();
      db.run(
        `UPDATE request_logs SET quality_score = ?, was_escalated = ?, escalated_to_model = ? WHERE id = ?`,
        [score, escalatedToModel ? 1 : 0, escalatedToModel ?? null, id]
      );
      persist();
    },
    async getStats(): Promise<StatsResponse> {
      const db = await getSqlite();
      const totalsResult = db.exec(`
        SELECT
          COUNT(*) as totalRequests,
          COALESCE(SUM(cost), 0) as totalCost,
          COALESCE(AVG(quality_score), 0) as avgQualityScore,
          COALESCE(AVG(latency_ms), 0) as avgLatencyMs,
          COALESCE(AVG(was_escalated), 0) as escalationRate
        FROM request_logs
      `);

      const gpt4oCostResult = db.exec(`
        SELECT COALESCE(SUM(input_tokens * 0.0000025 + output_tokens * 0.000010), 0) as totalIfGpt4o
        FROM request_logs
      `);

      const distResult = db.exec(`
        SELECT routed_model, COUNT(*) as count FROM request_logs GROUP BY routed_model
      `);

      const totals = totalsResult[0]?.values[0] ?? [0, 0, 0, 0, 0];
      const gpt4oCost = (gpt4oCostResult[0]?.values[0]?.[0] as number) ?? 0;

      const routingDistribution: Record<string, number> = {};
      for (const row of distResult[0]?.values ?? []) {
        routingDistribution[row[0] as string] = row[1] as number;
      }

      const totalCost = totals[1] as number;
      const savedAmount = gpt4oCost - totalCost;
      const savingsPercentage = gpt4oCost > 0 ? (savedAmount / gpt4oCost) * 100 : 0;

      return {
        totalRequests: totals[0] as number,
        totalCost,
        totalCostIfAllGpt4o: gpt4oCost,
        savedAmount,
        savingsPercentage,
        routingDistribution,
        escalationRate: (totals[4] as number) * 100,
        avgQualityScore: totals[2] as number,
        avgLatencyMs: totals[3] as number,
      };
    },
    async getRecentLogs(limit = 50): Promise<RequestLog[]> {
      const db = await getSqlite();
      const result = db.exec(`SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT ${limit}`);

      if (!result[0]) return [];
      const cols = result[0].columns;
      return result[0].values.map(row => {
        const obj: Record<string, unknown> = {};
        cols.forEach((col, i) => { obj[col] = row[i]; });
        return {
          id: obj.id as string,
          promptHash: obj.prompt_hash as string,
          promptPreview: obj.prompt_preview as string,
          complexityTier: obj.complexity_tier as RequestLog['complexityTier'],
          routedModel: obj.routed_model as string,
          provider: obj.provider as RequestLog['provider'],
          inputTokens: obj.input_tokens as number,
          outputTokens: obj.output_tokens as number,
          cost: obj.cost as number,
          latencyMs: obj.latency_ms as number,
          qualityScore: obj.quality_score as number | null,
          wasEscalated: obj.was_escalated === 1,
          escalatedToModel: obj.escalated_to_model as string | null,
          timestamp: obj.timestamp as string,
        };
      });
    },
  };
}

export const dbAdapter = createDatabaseAdapter();
