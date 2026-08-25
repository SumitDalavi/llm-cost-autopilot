import initSqlJs, { Database } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { RequestLog, StatsResponse } from './types';

let db: Database;

export async function getDb(): Promise<Database> {
  if (!db) {
    const SQL = await initSqlJs();
    const dbPath = process.env.DB_PATH ?? './data/autopilot.db';
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Load existing DB from disk, or create new
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    initSchema();

    // Persist to disk on exit
    process.on('exit', () => persistDb(dbPath));
    process.on('SIGINT', () => { persistDb(dbPath); process.exit(0); });
  }
  return db;
}

function persistDb(dbPath: string) {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

function initSchema() {
  db.run(`
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
}

export async function insertLog(log: RequestLog): Promise<void> {
  const db = await getDb();
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

  // Persist after every write
  persistDb(process.env.DB_PATH ?? './data/autopilot.db');
}

export async function updateQualityScore(id: string, score: number, escalatedToModel?: string): Promise<void> {
  const db = await getDb();
  db.run(
    `UPDATE request_logs SET quality_score = ?, was_escalated = ?, escalated_to_model = ? WHERE id = ?`,
    [score, escalatedToModel ? 1 : 0, escalatedToModel ?? null, id]
  );
  persistDb(process.env.DB_PATH ?? './data/autopilot.db');
}

export async function getStats(): Promise<StatsResponse> {
  const db = await getDb();

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
}

export async function getRecentLogs(limit = 50): Promise<RequestLog[]> {
  const db = await getDb();
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
}
