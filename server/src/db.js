import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'santoto_launch',
  user: process.env.DB_USER || 'santoto_app',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: Math.min(75, Math.max(1, Number(process.env.DB_POOL_MAX || 50))),
  queueLimit: Math.max(500, Number(process.env.DB_QUEUE_LIMIT || 2000)),
  connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS || 5_000),
  enableKeepAlive: true,
  charset: 'utf8mb4',
  timezone: 'Z',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined,
});

function mysqlPlaceholders(sql, values = []) {
  const ordered = [];
  const statement = sql.replace(/\$(\d+)(?::jsonb)?/g, (_match, position) => {
    ordered.push(values[Number(position) - 1]);
    return '?';
  });
  return { statement, values: ordered };
}

export async function query(sql, values = []) {
  const prepared = mysqlPlaceholders(sql, values);
  const [result] = await pool.execute(prepared.statement, prepared.values);
  if (Array.isArray(result)) return { rows: result, rowCount: result.length };
  return { rows: [], rowCount: result.affectedRows || 0, insertId: result.insertId };
}

export async function initializeDatabase() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS participants (
      id CHAR(36) PRIMARY KEY,
      first_name VARCHAR(80) NOT NULL,
      last_name VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL UNIQUE,
      phone VARCHAR(32),
      school VARCHAR(140),
      city VARCHAR(100),
      consent_privacy BOOLEAN NOT NULL DEFAULT FALSE,
      consent_marketing BOOLEAN NOT NULL DEFAULT FALSE,
      preferred_program VARCHAR(160),
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX participants_created_at_idx (created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS challenge_completions (
      participant_id CHAR(36) NOT NULL,
      program_id VARCHAR(80) NOT NULL,
      challenge_id VARCHAR(100) NOT NULL,
      answer_index INT NOT NULL DEFAULT 0,
      answer_json JSON NOT NULL,
      completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (participant_id, program_id, challenge_id),
      CONSTRAINT challenge_participant_fk FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS talk_attendance (
      participant_id CHAR(36) NOT NULL,
      talk_id VARCHAR(100) NOT NULL,
      checked_in_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (participant_id, talk_id),
      CONSTRAINT talk_participant_fk FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ];
  for (const statement of statements) await pool.query(statement);
}
