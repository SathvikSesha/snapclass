
import { pool } from '../config/db.js';

export async function getMaterialForIngestion(materialId) {
  const [rows] = await pool.execute(
    `SELECT
       material_id AS materialId,
       subject_id AS subjectId,
       original_filename AS originalFilename,
       object_key AS objectKey,
       file_type AS fileType,
       file_size AS fileSize,
       status,
       ingestion_status AS ingestionStatus
     FROM subject_materials
     WHERE material_id = ?
     LIMIT 1`,
    [materialId]
  );

  return rows[0] || null;
}

export async function markIngestionQueued(materialId) {
  const [result] = await pool.execute(
    `UPDATE subject_materials
     SET ingestion_status = 'QUEUED',
         ingestion_error = NULL
     WHERE material_id = ?
       AND status = 'AVAILABLE'
       AND ingestion_status IN ('NOT_STARTED', 'FAILED')`,
    [materialId]
  );

  return result.affectedRows === 1;
}

export async function markIngestionProcessing(materialId) {
  const [result] = await pool.execute(
    `UPDATE subject_materials
     SET ingestion_status = 'PROCESSING',
         ingestion_attempts = ingestion_attempts + 1,
         ingestion_error = NULL
     WHERE material_id = ?
       AND status = 'AVAILABLE'
       AND ingestion_status <> 'COMPLETED'`,
    [materialId]
  );

  return result.affectedRows === 1;
}

export async function markIngestionCompleted(materialId) {
  const [result] = await pool.execute(
    `UPDATE subject_materials
     SET ingestion_status = 'COMPLETED',
         ingestion_error = NULL,
         ingested_at = CURRENT_TIMESTAMP
     WHERE material_id = ?
       AND status = 'AVAILABLE'`,
    [materialId]
  );

  return result.affectedRows === 1;
}

export async function markIngestionFailed(materialId, reason) {
  await pool.execute(
    `UPDATE subject_materials
     SET ingestion_status = 'FAILED',
         ingestion_error = ?
     WHERE material_id = ?
       AND ingestion_status <> 'COMPLETED'`,
    [String(reason).slice(0, 5000), materialId]
  );
}

export async function markIngestionRetryQueued(materialId) {
  await pool.execute(
    `UPDATE subject_materials
     SET ingestion_status = 'QUEUED',
         ingestion_error = NULL
     WHERE material_id = ?
       AND status = 'AVAILABLE'
       AND ingestion_status <> 'COMPLETED'`,
    [materialId]
  );
}
