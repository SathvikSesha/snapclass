import { pool } from "../config/db.js";

export const getStudentCount = async () => {
    const [rows] = await pool.execute(
        "SELECT COUNT(*) AS total FROM students"
    );

    return Number(rows[0].total);
};

export const getFacultyCount = async () => {
    const [rows] = await pool.execute(
        "SELECT COUNT(*) AS total FROM faculty"
    );

    return Number(rows[0].total);
};

export const getSubjectCount = async () => {
    const [rows] = await pool.execute(
        "SELECT COUNT(*) AS total FROM subjects"
    );

    return Number(rows[0].total);
};

export const getPendingRequestsCount = async () => {
    const [rows] = await pool.execute(
        "SELECT COUNT(*) AS total FROM subject_requests WHERE status = 'PENDING'"
    );

    return Number(rows[0]?.total ?? 0);
};

export const getRecentLogs = async () => {
    const [rows] = await pool.execute(`
        SELECT
            id,
            actor_user_id,
            actor_name,
            event_type,
            message,
            entity_type,
            entity_id,
            created_at
        FROM logs
        ORDER BY created_at DESC, id DESC
        LIMIT 10
    `);

    return rows;
};
