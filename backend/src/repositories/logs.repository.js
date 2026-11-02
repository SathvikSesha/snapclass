import { pool } from "../config/db.js";

export const createLog = async ({
    actorUserId = null,
    actorName = null,
    eventType,
    message,
    entityType = null,
    entityId = null,
    connection = pool,
}) => {
    const [result] = await connection.execute(
        `INSERT INTO logs (
            actor_user_id,
            actor_name,
            event_type,
            message,
            entity_type,
            entity_id
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
            actorUserId,
            actorName,
            eventType,
            message,
            entityType,
            entityId,
        ]
    );

    return result.insertId;
};
