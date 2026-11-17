import { pool } from '../src/config/db.js';

const [rows] = await pool.execute(`
  SELECT
    NOW() AS db_now,
    UTC_TIMESTAMP() AS db_utc,
    @@global.time_zone AS global_tz,
    @@session.time_zone AS session_tz,
    @@system_time_zone AS system_tz
`);
console.log('DB Time check:', rows[0]);

// Check actual quiz start times
const [quizzes] = await pool.execute(`
  SELECT quiz_id, title, start_at, deadline_at, status,
    (start_at <= UTC_TIMESTAMP()) AS hasStarted,
    (start_at <= NOW()) AS hasStartedLocal,
    UTC_TIMESTAMP() AS utcNow
  FROM quizzes
  WHERE status = 'PUBLISHED'
  LIMIT 5
`);
console.log('\nPublished quizzes:');
for (const q of quizzes) {
  console.log(q);
}

process.exit(0);

