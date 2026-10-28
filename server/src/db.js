import pg from 'pg';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 20),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS participants (
      id UUID PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      school TEXT,
      city TEXT,
      consent_privacy BOOLEAN NOT NULL DEFAULT FALSE,
      consent_marketing BOOLEAN NOT NULL DEFAULT FALSE,
      preferred_program TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS challenge_completions (
      participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      program_id TEXT NOT NULL,
      challenge_id TEXT NOT NULL,
      answer_index INTEGER NOT NULL DEFAULT 0,
      answer_json JSONB NOT NULL,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (participant_id, program_id, challenge_id)
    );
    ALTER TABLE challenge_completions ADD COLUMN IF NOT EXISTS answer_json JSONB;
    UPDATE challenge_completions SET answer_json = to_jsonb(answer_index) WHERE answer_json IS NULL;
    ALTER TABLE challenge_completions ALTER COLUMN answer_json SET NOT NULL;
    CREATE TABLE IF NOT EXISTS talk_attendance (
      participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      talk_id TEXT NOT NULL,
      checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (participant_id, talk_id)
    );
    CREATE INDEX IF NOT EXISTS participants_created_at_idx ON participants(created_at DESC);
  `);
}
