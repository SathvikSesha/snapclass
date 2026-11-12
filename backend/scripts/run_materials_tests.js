import { generateAccessToken } from '../src/utils/token.js';
import { pool } from '../src/config/db.js';

const API_BASE = 'http://localhost:5000/api/faculty';

async function main() {
  console.log('====================================================');
  console.log('        FACULTY MATERIALS S3 WORKFLOW TESTS         ');
  console.log('====================================================\n');

  // Faculty 2: user_id 6 (assigned to Subject 5 and 33)
  const faculty2Token = generateAccessToken({ user_id: 6, role: 'FACULTY' });
  const faculty2Headers = {
    Authorization: `Bearer ${faculty2Token}`,
    'Content-Type': 'application/json',
  };

  // Faculty 1: user_id 2 (not assigned to Subject 5)
  const faculty1Token = generateAccessToken({ user_id: 2, role: 'FACULTY' });
  const faculty1Headers = {
    Authorization: `Bearer ${faculty1Token}`,
    'Content-Type': 'application/json',
  };

  // ---------------------------------------------------------------------------
  // TEST 1: Generate upload URL
  // ---------------------------------------------------------------------------
  console.log('=== TEST 1: Generate upload URL ===');
  console.log('POST /api/faculty/subjects/5/materials');
  const uploadPayload = {
    title: 'Introduction to DBMS',
    description: 'Chapter 1 study material',
    originalFilename: 'DBMS_Notes.pdf',
    fileType: 'application/pdf',
    fileSize: 2048000,
  };

  const res1 = await fetch(`${API_BASE}/subjects/5/materials`, {
    method: 'POST',
    headers: faculty2Headers,
    body: JSON.stringify(uploadPayload),
  });
  const data1 = await res1.json();
  console.log(`Status: ${res1.status}`);
  console.log('Response:', JSON.stringify(data1, null, 2));

  if (!data1.success || !data1.data?.uploadUrl) {
    throw new Error('Test 1 failed: No uploadUrl received');
  }

  const { materialId, uploadUrl, objectKey } = data1.data;
  console.log(`\nGenerated Material ID: ${materialId}`);
  console.log(`Presigned S3 URL generated successfully.\n`);

  // ---------------------------------------------------------------------------
  // TEST 2: Upload directly to S3
  // ---------------------------------------------------------------------------
  console.log('=== TEST 2: Upload directly to S3 ===');
  console.log(`PUT ${uploadUrl.slice(0, 80)}...`);

  // Create a 2,048,000 byte PDF dummy buffer
  const pdfHeader = Buffer.from('%PDF-1.4\n% SnapClass S3 Material Test\n');
  const pdfBody = Buffer.alloc(2048000 - pdfHeader.length - 6, 'A');
  const pdfFooter = Buffer.from('\n%%EOF');
  const dummyPdf = Buffer.concat([pdfHeader, pdfBody, pdfFooter]);

  console.log(`Payload size: ${dummyPdf.length} bytes (matches requested 2048000)`);

  const s3UploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
    },
    body: dummyPdf,
  });

  console.log(`S3 PUT Response Status: ${s3UploadRes.status} ${s3UploadRes.statusText}`);
  if (s3UploadRes.status !== 200) {
    const errorText = await s3UploadRes.text();
    console.error('S3 Error body:', errorText);
    throw new Error(`S3 upload failed with status ${s3UploadRes.status}`);
  }
  console.log('Direct S3 upload succeeded (200 OK)!\n');

  // ---------------------------------------------------------------------------
  // TEST 3: Complete the upload
  // ---------------------------------------------------------------------------
  console.log('=== TEST 3: Complete the upload ===');
  console.log(`POST /api/faculty/materials/${materialId}/complete`);

  const res3 = await fetch(`${API_BASE}/materials/${materialId}/complete`, {
    method: 'POST',
    headers: faculty2Headers,
  });
  const data3 = await res3.json();
  console.log(`Status: ${res3.status}`);
  console.log('Response:', JSON.stringify(data3, null, 2));

  // Verify in MySQL
  console.log(`\n--- Verifying database status for material_id = ${materialId} ---`);
  const [rows] = await pool.query('SELECT * FROM subject_materials WHERE material_id = ?', [materialId]);
  console.log(rows[0]);
  console.log(`Database material status: ${rows[0]?.status}\n`);

  // ---------------------------------------------------------------------------
  // STEP 6: Important Test Cases
  // ---------------------------------------------------------------------------
  console.log('=== STEP 6: Important Test Cases ===\n');

  // 1. Faculty not assigned to subject (403)
  console.log('--- 1. Faculty not assigned to subject (Faculty 2 on Subject 35) ---');
  const resNotAssigned = await fetch(`${API_BASE}/subjects/35/materials`, {
    method: 'POST',
    headers: faculty2Headers,
    body: JSON.stringify(uploadPayload),
  });
  console.log(`Status: ${resNotAssigned.status}`, await resNotAssigned.json());

  // 2. Invalid subject ID (400)
  console.log('--- 2. Invalid subject ID (POST /subjects/abc/materials) ---');
  const resInvSub = await fetch(`${API_BASE}/subjects/abc/materials`, {
    method: 'POST',
    headers: faculty2Headers,
    body: JSON.stringify(uploadPayload),
  });
  console.log(`Status: ${resInvSub.status}`, await resInvSub.json());

  // 3. File larger than 25 MB (400)
  console.log('--- 3. File larger than 25 MB (fileSize: 30000000) ---');
  const resTooLarge = await fetch(`${API_BASE}/subjects/5/materials`, {
    method: 'POST',
    headers: faculty2Headers,
    body: JSON.stringify({ ...uploadPayload, fileSize: 30000000 }),
  });
  console.log(`Status: ${resTooLarge.status}`, await resTooLarge.json());

  // 4. Unsupported file type (400)
  console.log('--- 4. Unsupported file type (fileType: application/x-msdownload) ---');
  const resBadType = await fetch(`${API_BASE}/subjects/5/materials`, {
    method: 'POST',
    headers: faculty2Headers,
    body: JSON.stringify({ ...uploadPayload, fileType: 'application/x-msdownload', originalFilename: 'hack.exe' }),
  });
  console.log(`Status: ${resBadType.status}`, await resBadType.json());

  // 5. Complete before uploading to S3 (400)
  console.log('--- 5. Complete before uploading to S3 ---');
  // First generate a new pending material without uploading to S3
  const resPendingOnly = await fetch(`${API_BASE}/subjects/5/materials`, {
    method: 'POST',
    headers: faculty2Headers,
    body: JSON.stringify({ ...uploadPayload, originalFilename: 'unuploaded.pdf' }),
  });
  const dataPendingOnly = await resPendingOnly.json();
  const unuploadedId = dataPendingOnly.data.materialId;

  // Try to complete before uploading
  const resPremature = await fetch(`${API_BASE}/materials/${unuploadedId}/complete`, {
    method: 'POST',
    headers: faculty2Headers,
  });
  console.log(`Status: ${resPremature.status}`, await resPremature.json());

  // 6. Complete using another faculty's material ID (404)
  console.log('--- 6. Complete using another faculty\'s material ID (Faculty 1 trying to complete Faculty 2\'s material) ---');
  const resWrongFaculty = await fetch(`${API_BASE}/materials/${materialId}/complete`, {
    method: 'POST',
    headers: faculty1Headers,
  });
  console.log(`Status: ${resWrongFaculty.status}`, await resWrongFaculty.json());

  // 7. Complete an already available material (409)
  console.log(`--- 7. Complete an already available material (Material ${materialId} again) ---`);
  const resAlreadyAvailable = await fetch(`${API_BASE}/materials/${materialId}/complete`, {
    method: 'POST',
    headers: faculty2Headers,
  });
  console.log(`Status: ${resAlreadyAvailable.status}`, await resAlreadyAvailable.json());

  await pool.end();
  console.log('\nAll tests completed successfully!');
}

main().catch(console.error);
