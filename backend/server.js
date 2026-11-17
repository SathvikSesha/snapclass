import app from './src/app.js';
import { env } from './src/config/env.js';
import { pool, checkDatabaseConnection } from './src/config/db.js';

let server;

async function startServer() {
  try {
    await checkDatabaseConnection();

    server = app.listen(env.port, () => {
      console.log(`SnapClass API running on port ${env.port}`);
      console.log(`Environment: ${env.nodeEnv}`);
    });

    // Disable or extend server request timeout to allow long-running AI operations (15 minutes)
    server.requestTimeout = 15 * 60 * 1000;
    server.timeout = 15 * 60 * 1000;
    server.headersTimeout = (15 * 60 + 30) * 1000;
  } catch (error) {
    console.error('Failed to start SnapClass API:', error.message);
    process.exitCode = 1;
    await pool.end();
  }
}

async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);

  if (server) {
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
    
    setTimeout(() => process.exit(1), 10000).unref();
  } else {
    await pool.end();
    process.exit(0);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

startServer();