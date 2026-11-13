import { createHmac } from 'node:crypto';
import { pool } from '../src/config/db.js';
import { redis } from '../src/config/redis.js';
import { registerStudent } from '../src/services/student.service.js';

const API_BASE = 'http://localhost:5000/api/auth';
const OTP_SECRET = process.env.OTP_HASH_SECRET;

function digestOtp(userId, purpose, otp) {
  return createHmac('sha256', OTP_SECRET)
    .update(`${userId}:${purpose}:${otp}`)
    .digest('hex');
}

function extractCookies(setCookieHeaders) {
  if (!setCookieHeaders || setCookieHeaders.length === 0) return '';
  return setCookieHeaders.map(c => c.split(';')[0]).join('; ');
}

async function postJson(path, body, cookieHeader = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (cookieHeader) headers.Cookie = cookieHeader;
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return { status: res.status, data, setCookies };
}

async function getJson(path, cookieHeader = '') {
  const headers = {};
  if (cookieHeader) headers.Cookie = cookieHeader;
  const res = await fetch(`${API_BASE}${path}`, { headers });
  const data = await res.json();
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return { status: res.status, data, setCookies };
}

async function setKnownOtp(userId, purpose, otp = '123456') {
  const key = `snapclass:otp:${purpose}:${userId}`;
  await redis.set(key, digestOtp(userId, purpose, otp), { ex: 300 });
  await redis.del(`snapclass:otp:attempts:${purpose}:${userId}`);
  await redis.del(`snapclass:otp:resend:${purpose}:${userId}`);
}

async function cleanupUserByEmail(email) {
  const [rows] = await pool.execute('SELECT user_id FROM users WHERE email = ?', [email]);
  for (const row of rows) {
    const uid = row.user_id;
    await pool.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [uid]).catch(() => {});
    await pool.execute('DELETE FROM admins WHERE user_id = ?', [uid]).catch(() => {});
    await pool.execute('DELETE FROM faculty WHERE user_id = ?', [uid]).catch(() => {});
    await pool.execute('DELETE FROM students WHERE user_id = ?', [uid]).catch(() => {});
    await pool.execute('DELETE FROM users WHERE user_id = ?', [uid]).catch(() => {});
    await redis.del(`snapclass:otp:EMAIL_VERIFICATION:${uid}`);
    await redis.del(`snapclass:otp:MFA:${uid}`);
    await redis.del(`snapclass:otp:attempts:EMAIL_VERIFICATION:${uid}`);
    await redis.del(`snapclass:otp:attempts:MFA:${uid}`);
    await redis.del(`snapclass:otp:resend:EMAIL_VERIFICATION:${uid}`);
    await redis.del(`snapclass:otp:resend:MFA:${uid}`);
  }
}

async function runRolePasswordFlow({ roleLabel, registerPath, loginPath, verifyMfaPath, email, password }) {
  console.log(`\n==================== ${roleLabel} AUTH FLOW ====================`);
  // 1. Register
  const reg = await postJson(registerPath, {
    fullName: `Test ${roleLabel}`,
    email,
    password,
  });
  console.log(`[${roleLabel}] Register -> ${reg.status}`, reg.data?.message);
  if (reg.status !== 201 || !reg.data?.data?.userId) {
    throw new Error(`${roleLabel} register failed: ${reg.status} ${JSON.stringify(reg.data)}`);
  }
  const userId = reg.data.data.userId;

  // 2. Duplicate register -> 409
  const dup = await postJson(registerPath, { fullName: `Test ${roleLabel}`, email, password });
  console.log(`[${roleLabel}] Duplicate register -> ${dup.status}`, dup.data?.message);
  if (dup.status !== 409) throw new Error(`${roleLabel} duplicate expected 409, got ${dup.status}`);

  // 3. Login before email verification -> 403 EMAIL_VERIFICATION_REQUIRED
  const unverifiedLogin = await postJson(loginPath, { email, password });
  console.log(`[${roleLabel}] Unverified login -> ${unverifiedLogin.status}`, unverifiedLogin.data);
  if (unverifiedLogin.status !== 403 || unverifiedLogin.data?.code !== 'EMAIL_VERIFICATION_REQUIRED') {
    throw new Error(`${roleLabel} unverified login expected 403 EMAIL_VERIFICATION_REQUIRED, got ${unverifiedLogin.status}`);
  }

  // Clear resend cooldown from login's auto-OTP so send-email-verification-otp succeeds too
  await redis.del(`snapclass:otp:resend:EMAIL_VERIFICATION:${userId}`);
  const sendOtp = await postJson('/send-email-verification-otp', { email });
  console.log(`[${roleLabel}] Send email OTP -> ${sendOtp.status}`, sendOtp.data?.message);
  if (sendOtp.status !== 200) throw new Error(`${roleLabel} send OTP failed: ${sendOtp.status} ${JSON.stringify(sendOtp.data)}`);

  // 4. Verify email (wrong OTP -> 400/401, then right OTP -> 200)
  await setKnownOtp(userId, 'EMAIL_VERIFICATION', '654321');
  const badEmailOtp = await postJson('/verify-email', { email, otp: '000000' });
  console.log(`[${roleLabel}] Wrong email OTP -> ${badEmailOtp.status}`, badEmailOtp.data?.message);
  if (badEmailOtp.status < 400) throw new Error(`${roleLabel} bad email OTP should fail`);

  const goodEmailOtp = await postJson('/verify-email', { email, otp: '654321' });
  console.log(`[${roleLabel}] Valid email OTP -> ${goodEmailOtp.status}`, goodEmailOtp.data?.message);
  if (goodEmailOtp.status !== 200) throw new Error(`${roleLabel} verify email failed: ${goodEmailOtp.status}`);

  // 5. Wrong password -> 401
  const badPwd = await postJson(loginPath, { email, password: 'WrongPassword999!' });
  console.log(`[${roleLabel}] Wrong password -> ${badPwd.status}`, badPwd.data?.message);
  if (badPwd.status !== 401) throw new Error(`${roleLabel} wrong password expected 401, got ${badPwd.status}`);

  // 6. Valid login -> 200 (sends MFA OTP)
  const login = await postJson(loginPath, { email, password });
  console.log(`[${roleLabel}] Valid login -> ${login.status}`, login.data?.message);
  if (login.status !== 200) throw new Error(`${roleLabel} login failed: ${login.status} ${JSON.stringify(login.data)}`);

  // 7. MFA verify (wrong OTP -> 401/400, valid OTP -> 200 + cookies)
  await setKnownOtp(userId, 'MFA', '112233');
  const badMfa = await postJson(verifyMfaPath, { email, otp: '999999' });
  console.log(`[${roleLabel}] Wrong MFA OTP -> ${badMfa.status}`, badMfa.data?.message);
  if (badMfa.status < 400) throw new Error(`${roleLabel} bad MFA should fail`);

  const goodMfa = await postJson(verifyMfaPath, { email, otp: '112233' });
  const cookieHeader = extractCookies(goodMfa.setCookies);
  console.log(`[${roleLabel}] Valid MFA -> ${goodMfa.status}, role=${goodMfa.data?.user?.role}, cookiesSet=${goodMfa.setCookies.length}`);
  if (goodMfa.status !== 200 || goodMfa.data?.user?.role !== roleLabel || !cookieHeader) {
    throw new Error(`${roleLabel} MFA verify failed: ${goodMfa.status} ${JSON.stringify(goodMfa.data)}`);
  }

  // 8. /me, /refresh, /logout
  const me = await getJson('/me', cookieHeader);
  console.log(`[${roleLabel}] GET /me -> ${me.status}`, me.data?.user);
  if (me.status !== 200 || me.data?.user?.role !== roleLabel) {
    throw new Error(`${roleLabel} /me failed: ${me.status} ${JSON.stringify(me.data)}`);
  }

  const refresh = await postJson('/refresh', {}, cookieHeader);
  const rotatedCookies = extractCookies(refresh.setCookies) || cookieHeader;
  console.log(`[${roleLabel}] POST /refresh -> ${refresh.status}`, refresh.data?.message);
  if (refresh.status !== 200) throw new Error(`${roleLabel} /refresh failed: ${refresh.status}`);

  const logout = await postJson('/logout', {}, rotatedCookies);
  console.log(`[${roleLabel}] POST /logout -> ${logout.status}`, logout.data?.message);
  if (logout.status !== 200) throw new Error(`${roleLabel} /logout failed: ${logout.status}`);

  const meAfterLogout = await getJson('/me', '');
  console.log(`[${roleLabel}] GET /me after logout (no cookies) -> ${meAfterLogout.status}`);
  if (meAfterLogout.status !== 401) throw new Error(`${roleLabel} /me after logout expected 401, got ${meAfterLogout.status}`);

  return userId;
}

async function main() {
  const ts = Date.now();
  const adminEmail = `test.admin.${ts}@snapclass.local`;
  const facultyEmail = `test.faculty.${ts}@snapclass.local`;
  const studentEmail = `test.student.${ts}@snapclass.local`;

  try {
    await runRolePasswordFlow({
      roleLabel: 'ADMIN',
      registerPath: '/admin/register',
      loginPath: '/admin/login',
      verifyMfaPath: '/admin/verify-mfa',
      email: adminEmail,
      password: 'AdminPassword123',
    });

    await runRolePasswordFlow({
      roleLabel: 'FACULTY',
      registerPath: '/faculty/register',
      loginPath: '/faculty/login',
      verifyMfaPath: '/faculty/verify-mfa',
      email: facultyEmail,
      password: 'FacultyPassword123',
    });

    // Student registration endpoint validation (short password < 12 chars / missing faceImage -> 400)
    console.log('\n==================== STUDENT AUTH FLOW ====================');
    const stuShortPwd = await postJson('/student/register', {
      fullName: 'Test Student',
      email: studentEmail,
      password: 'short',
    });
    console.log(`[STUDENT] Register validation (short pwd / missing face) -> ${stuShortPwd.status}`, stuShortPwd.data?.message);
    if (stuShortPwd.status !== 400) throw new Error(`Expected 400 for short student password, got ${stuShortPwd.status}`);

    // Test full Student login -> unverified 403 -> verify-email -> wrong pwd 401 -> login -> verify-mfa -> /me -> /refresh -> /logout
    const stuPassword = 'StudentStrongPassword123!';
    const dummyEmbedding = new Array(512).fill(0.01);
    const stuCreated = await registerStudent({
      fullName: 'Test Student',
      email: studentEmail,
      password: stuPassword,
      faceEmbedding: dummyEmbedding,
    });
    const stuUserId = stuCreated.userId;
    console.log(`[STUDENT] Created test student userId=${stuUserId}`);

    const stuUnverified = await postJson('/student/login', { email: studentEmail, password: stuPassword });
    console.log(`[STUDENT] Unverified login -> ${stuUnverified.status}`, stuUnverified.data);
    if (stuUnverified.status !== 403 || stuUnverified.data?.code !== 'EMAIL_VERIFICATION_REQUIRED') {
      throw new Error(`STUDENT unverified login expected 403 EMAIL_VERIFICATION_REQUIRED, got ${stuUnverified.status}`);
    }

    await setKnownOtp(stuUserId, 'EMAIL_VERIFICATION', '654321');
    const stuVerifyEmail = await postJson('/verify-email', { email: studentEmail, otp: '654321' });
    console.log(`[STUDENT] Verify email -> ${stuVerifyEmail.status}`, stuVerifyEmail.data?.message);
    if (stuVerifyEmail.status !== 200) throw new Error(`STUDENT verify email failed: ${stuVerifyEmail.status}`);

    const stuBadPwd = await postJson('/student/login', { email: studentEmail, password: 'WrongStudentPwd999!' });
    console.log(`[STUDENT] Wrong password -> ${stuBadPwd.status}`, stuBadPwd.data?.message);
    if (stuBadPwd.status !== 401) throw new Error(`Expected 401 for wrong student password, got ${stuBadPwd.status}`);

    const stuLogin = await postJson('/student/login', { email: studentEmail, password: stuPassword });
    console.log(`[STUDENT] Valid login -> ${stuLogin.status}`, stuLogin.data?.message);
    if (stuLogin.status !== 200) throw new Error(`STUDENT login failed: ${stuLogin.status}`);

    await setKnownOtp(stuUserId, 'MFA', '112233');
    const stuBadMfa = await postJson('/student/verify-mfa', { email: studentEmail, otp: '999999' });
    console.log(`[STUDENT] Wrong MFA OTP -> ${stuBadMfa.status}`, stuBadMfa.data?.message);
    if (stuBadMfa.status < 400) throw new Error('STUDENT bad MFA should fail');

    const stuMfa = await postJson('/student/verify-mfa', { email: studentEmail, otp: '112233' });
    const stuCookies = extractCookies(stuMfa.setCookies);
    console.log(`[STUDENT] Valid MFA -> ${stuMfa.status}, role=${stuMfa.data?.user?.role}, cookiesSet=${stuMfa.setCookies.length}`);
    if (stuMfa.status !== 200 || stuMfa.data?.user?.role !== 'STUDENT' || !stuCookies) {
      throw new Error(`STUDENT MFA verify failed: ${stuMfa.status}`);
    }

    const stuMe = await getJson('/me', stuCookies);
    console.log(`[STUDENT] GET /me -> ${stuMe.status}`, stuMe.data?.user);
    if (stuMe.status !== 200 || stuMe.data?.user?.role !== 'STUDENT') throw new Error('STUDENT /me failed');

    const stuRefresh = await postJson('/refresh', {}, stuCookies);
    const stuRotated = extractCookies(stuRefresh.setCookies) || stuCookies;
    console.log(`[STUDENT] POST /refresh -> ${stuRefresh.status}`, stuRefresh.data?.message);
    if (stuRefresh.status !== 200) throw new Error('STUDENT /refresh failed');

    const stuLogout = await postJson('/logout', {}, stuRotated);
    console.log(`[STUDENT] POST /logout -> ${stuLogout.status}`, stuLogout.data?.message);
    if (stuLogout.status !== 200) throw new Error('STUDENT /logout failed');

    console.log('\nALL AUTH FLOWS (ADMIN, FACULTY, STUDENT) PASSED!');
  } finally {
    await cleanupUserByEmail(adminEmail);
    await cleanupUserByEmail(facultyEmail);
    await cleanupUserByEmail(studentEmail);
    await pool.end();
  }
}

main().catch(err => {
  console.error('AUTH TEST SUITE FAILED:', err);
  process.exit(1);
});
