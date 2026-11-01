import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  ...env.database,

  waitForConnections: true,
  connectionLimit: env.database.connectionLimit,
  queueLimit: 0,

  enableKeepAlive: true,
  decimalNumbers: true,
});

export async function checkDatabaseConnection() {
  const connection = await pool.getConnection();

  try {
    await connection.ping();
    console.log('MySQL connection successful');
  } finally {
    connection.release();
  }
}