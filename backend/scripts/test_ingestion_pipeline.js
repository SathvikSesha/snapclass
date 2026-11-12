import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateAccessToken } from '../src/utils/token.js';
import { pool } from '../src/config/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const API_BASE = 'http://localhost:5000/api/faculty';
const SAMPLE_PDF_PATH = path.resolve(__dirname, '../../ai-services/sample_documents/pdfdocument.pdf');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('====================================================');
  console.log('      END-TO-END MATERIAL INGESTION PIPELINE TEST   ');
  console.log('====================================================\n');

  const pdfBuffer = fs.readFileSync(SAMPLE_PDF_PATH);
  const fileSize = pdfBuffer.length;
  console.log(`Loaded sample PDF (${SAMPLE_PDF_PATH}): ${fileSize} bytes`);

  const facultyToken = generateAccessToken({ user_id: 6, role: 'FACULTY' });
  const headers = {
    Authorization: `Bearer ${facultyToken}`,
    'Content-Type': 'application/json',
  };

  // Step 1 — Request upload URL
  console.log('\n--- STEP 1: Request upload URL (POST /api/faculty/subjects/5/materials) ---');
  const uploadPayload = {
    title: 'NumPy Functions Cheat Sheet',
    description: 'End-to-end ingestion test PDF',
    originalFilename: 'NumPy_CheatSheet.pdf',
    fileType: 'application/pdf',
    fileSize,
  };

  const res1 = await fetch(`${API_BASE}/subjects/5/materials`, {
    method: 'POST',
    headers,
    body: JSON.stringify(uploadPayload),
  });
  const data1 = await res1.json();
  console.log(`Status: ${res1.status}`);
  console.log('Response:', JSON.stringify(data1, null, 2));

  if (!res1.ok || !data1.success || !data1.data?.uploadUrl) {
    throw new Error('Step 1 failed: Could not generate upload URL');
  }

  const { materialId, uploadUrl } = data1.data;

  // Step 2 — Upload to S3
  console.log('\n--- STEP 2: Upload directly to S3 ---');
  const s3Res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
    },
    body: pdfBuffer,
  });
  console.log(`S3 PUT Response: ${s3Res.status} ${s3Res.statusText}`);
  if (s3Res.status !== 200) {
    throw new Error(`Step 2 failed: S3 returned ${s3Res.status}`);
  }

  // Step 3 — Complete upload
  console.log(`\n--- STEP 3: Complete upload (POST /api/faculty/materials/${materialId}/complete) ---`);
  const res3 = await fetch(`${API_BASE}/materials/${materialId}/complete`, {
    method: 'POST',
    headers,
  });
  const data3 = await res3.json();
  console.log(`Status: ${res3.status}`);
  console.log('Response:', JSON.stringify(data3, null, 2));

  if (!res3.ok || !data3.success || data3.data?.ingestionStatus !== 'QUEUED') {
    throw new Error('Step 3 failed: Expected ingestionStatus to be QUEUED');
  }

  // Step 4 & 5 — Poll MySQL for worker completion
  console.log(`\n--- STEP 4 & 5: Waiting for worker & verifying MySQL (material_id = ${materialId}) ---`);
  let row = null;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const [rows] = await pool.query(
      `SELECT material_id, subject_id, status, ingestion_status, ingestion_attempts, ingestion_error, ingested_at
       FROM subject_materials
       WHERE material_id = ?`,
      [materialId]
    );
    row = rows[0];
    console.log(`Poll #${i + 1}: ingestion_status = ${row?.ingestion_status}, attempts = ${row?.ingestion_attempts}`);
    if (row?.ingestion_status === 'COMPLETED' || row?.ingestion_status === 'FAILED') {
      break;
    }
  }

  console.log('\nFinal MySQL Record:');
  console.table([row]);

  if (row?.ingestion_status !== 'COMPLETED') {
    throw new Error(`Expected COMPLETED, got ${row?.ingestion_status}. Error: ${row?.ingestion_error}`);
  }

  console.log('\n>>> END-TO-END INGESTION PIPELINE TEST PASSED SUCCESSFULLY! <<<');
  process.exit(0);
}

main().catch((err) => {
  console.error('\nTEST FAILED:', err);
  process.exit(1);
});

