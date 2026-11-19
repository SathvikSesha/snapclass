import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../../src/utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  hashRefreshToken,
} from '../../src/utils/token.js';
import { setAuthCookies, clearAuthCookies, setAccessCookie } from '../../src/utils/cookies.js';

describe('Unit Tests: Password & Token Utilities', () => {
  test('hashPassword should generate a valid Argon2id hash and verify correctly', async () => {
    const password = 'CorrectHorseBatteryStaple123!';
    const hash = await hashPassword(password);
    assert.ok(hash.startsWith('$argon2id$'), 'Hash should be an argon2id hash');

    const isValid = await verifyPassword(hash, password);
    assert.equal(isValid, true, 'Valid password should verify successfully');

    const isInvalid = await verifyPassword(hash, 'WrongPassword123!');
    assert.equal(isInvalid, false, 'Wrong password should fail verification');
  });

  test('generateAccessToken and verifyAccessToken should encode and decode user claims', () => {
    const user = { user_id: 42, role: 'FACULTY', full_name: 'Dr. Jane Doe' };
    const token = generateAccessToken(user);
    assert.ok(typeof token === 'string' && token.length > 20);

    const payload = verifyAccessToken(token);
    assert.equal(payload.sub, '42');
    assert.equal(payload.role, 'FACULTY');
    assert.equal(payload.name, 'Dr. Jane Doe');
  });

  test('verifyAccessToken should throw on invalid token', () => {
    assert.throws(() => {
      verifyAccessToken('not.a.valid.jwt.token');
    });
  });

  test('generateRefreshToken and hashRefreshToken should produce stable hashes', () => {
    const token1 = generateRefreshToken();
    const token2 = generateRefreshToken();
    assert.notEqual(token1, token2, 'Two refresh tokens should be distinct');

    const hash1 = hashRefreshToken(token1);
    const hash2 = hashRefreshToken(token1);
    assert.equal(hash1, hash2, 'Same token must produce the exact same SHA-256 hash');
  });
});

describe('Unit Tests: Cookie Management', () => {
  test('setAuthCookies sets access and refresh cookies with httpOnly and security flags', () => {
    const cookiesSet = [];
    const mockRes = {
      cookie: (name, val, opts) => {
        cookiesSet.push({ name, val, opts });
      },
    };

    setAuthCookies(mockRes, 'access-jwt-sample', 'refresh-token-sample');
    assert.equal(cookiesSet.length, 2);

    const accessCookie = cookiesSet.find(c => c.val === 'access-jwt-sample');
    const refreshCookie = cookiesSet.find(c => c.val === 'refresh-token-sample');

    assert.ok(accessCookie, 'Access cookie must be set');
    assert.equal(accessCookie.opts.httpOnly, true);
    assert.equal(accessCookie.opts.sameSite, 'lax');

    assert.ok(refreshCookie, 'Refresh cookie must be set');
    assert.equal(refreshCookie.opts.httpOnly, true);
  });

  test('clearAuthCookies expires both cookies immediately', () => {
    const cookiesCleared = [];
    const mockRes = {
      clearCookie: (name, opts) => {
        cookiesCleared.push({ name, opts });
      },
    };

    clearAuthCookies(mockRes);
    assert.equal(cookiesCleared.length, 2);
  });
});

describe('Unit Tests: Authentication Middleware Logic', () => {
  test('authenticate rejects requests with no token with 401', async () => {
    const { extractUser } = await import('../../src/middleware/auth.middleware.js');
    let statusCode = null;
    let responseBody = null;

    const req = { cookies: {}, headers: {} };
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => { responseBody = body; },
        };
      },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await extractUser(req, res, next);
    assert.equal(statusCode, 401);
    assert.equal(responseBody.success, false);
    assert.equal(nextCalled, false);
  });

  test('requireAdmin rejects requests from STUDENT role with 403', async () => {
    const { requireAdmin } = await import('../../src/middleware/auth.middleware.js');
    const studentUser = { user_id: 10, role: 'STUDENT', full_name: 'Student One' };
    const token = generateAccessToken(studentUser);

    let statusCode = null;
    let responseBody = null;

    const req = {
      cookies: { snapclass_access: token },
      headers: {},
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => { responseBody = body; },
        };
      },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await requireAdmin(req, res, next);
    assert.equal(statusCode, 403);
    assert.match(responseBody.message, /permission/i);
    assert.equal(nextCalled, false);
  });

  test('requireFaculty rejects requests from ADMIN or STUDENT with 403', async () => {
    const { requireFaculty } = await import('../../src/middleware/auth.middleware.js');
    const adminUser = { user_id: 1, role: 'ADMIN', full_name: 'Admin Boss' };
    const token = generateAccessToken(adminUser);

    let statusCode = null;
    let responseBody = null;

    const req = {
      cookies: { snapclass_access: token },
      headers: {},
    };
    const res = {
      status: (code) => {
        statusCode = code;
        return {
          json: (body) => { responseBody = body; },
        };
      },
    };

    await requireFaculty(req, res, () => {});
    assert.equal(statusCode, 403);
  });

  test('requireFacultyOrStudent rejects requests from ADMIN with 403', async () => {
    const { requireFacultyOrStudent } = await import('../../src/middleware/auth.middleware.js');
    const adminUser = { user_id: 1, role: 'ADMIN', full_name: 'Admin Boss' };
    const token = generateAccessToken(adminUser);

    let statusCode = null;
    const req = { cookies: { snapclass_access: token }, headers: {} };
    const res = {
      status: (code) => {
        statusCode = code;
        return { json: () => {} };
      },
    };

    await requireFacultyOrStudent(req, res, () => {});
    assert.equal(statusCode, 403);
  });
});

describe('Unit Tests: Registration Controller Validations', () => {
  const mockRes = () => {
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
    return res;
  };

  test('registerAdminController rejects missing or non-string fields', async () => {
    const { registerAdminController } = await import('../../src/controllers/auth.controller.js');
    const res = mockRes();
    await registerAdminController({ body: { fullName: 123, email: 'admin@test.com', password: 'password123' } }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /required/i);
  });

  test('registerAdminController rejects short full name and short password', async () => {
    const { registerAdminController } = await import('../../src/controllers/auth.controller.js');
    const res = mockRes();
    await registerAdminController({ body: { fullName: 'A', email: 'admin@test.com', password: 'short' } }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /valid registration details/i);
  });

  test('registerFacultyController rejects password under 8 characters', async () => {
    const { registerFacultyController } = await import('../../src/controllers/auth.controller.js');
    const res = mockRes();
    await registerFacultyController({ body: { fullName: 'Dr. Test', email: 'prof@test.com', password: 'short' } }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /valid registration details/i);
  });

  test('registerStudentController rejects password under 12 characters', async () => {
    const { registerStudentController } = await import('../../src/controllers/student.controller.js');
    const res = mockRes();
    await registerStudentController({
      body: { fullName: 'Student Test', email: 'student@test.com', password: 'eightchars!' },
      file: { buffer: Buffer.from('fake-image') },
    }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /12 characters/i);
  });

  test('registerStudentController rejects registration if face image is missing', async () => {
    const { registerStudentController } = await import('../../src/controllers/student.controller.js');
    const res = mockRes();
    await registerStudentController({
      body: { fullName: 'Student Test', email: 'student@test.com', password: 'ValidStudentPass123!' },
      file: null,
    }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /face image is required/i);
  });
});

describe('Unit Tests: Forgot & Reset Password Controller Validations', () => {
  const mockRes = () => {
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
    return res;
  };

  test('forgotPasswordController rejects invalid or missing email', async () => {
    const { forgotPasswordController } = await import('../../src/controllers/auth.controller.js');
    const res = mockRes();
    await forgotPasswordController({ body: { email: 'not-an-email' } }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /valid email/i);
  });

  test('verifyResetOtpController rejects non-6-digit OTP', async () => {
    const { verifyResetOtpController } = await import('../../src/controllers/auth.controller.js');
    const res = mockRes();
    await verifyResetOtpController({ body: { email: 'valid@snapclass.edu', otp: '123' } }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /6-digit OTP/i);
  });

  test('resetPasswordController rejects missing reset token or password under 12 chars', async () => {
    const { resetPasswordController } = await import('../../src/controllers/auth.controller.js');
    const res = mockRes();
    await resetPasswordController({
      body: { email: 'valid@snapclass.edu', resetToken: '', newPassword: 'short' }
    }, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /required/i);
  });
});
