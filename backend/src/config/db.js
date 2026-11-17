import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  ...env.database,

  waitForConnections: true,
  connectionLimit: env.database.connectionLimit,
  queueLimit: 0,

  enableKeepAlive: true,
  decimalNumbers: true,

  // Force all MySQL connections to UTC so that UTC_TIMESTAMP() and NOW()
  // always return UTC regardless of the MySQL server's system timezone.
  // This ensures start_at/deadline_at comparisons work correctly when the
  // server OS or MySQL is configured in a local timezone (e.g. IST +5:30).
  timezone: '+00:00',
});

// Belt-and-suspenders: also run SET time_zone on every new connection.
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export async function checkDatabaseConnection() {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
    // Log what time the DB reports to verify timezone alignment
    const [rows] = await connection.execute(
      "SELECT UTC_TIMESTAMP() AS utcNow, NOW() AS localNow, @@session.time_zone AS sessionTz"
    );
    console.log('MySQL connection successful. DB time check:', rows[0]);
  } finally {
    connection.release();
  }
}