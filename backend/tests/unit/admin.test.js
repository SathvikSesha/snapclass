import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSubject,
  getSubjects,
  getSubjectRequests,
  reviewSubjectRequest,
} from '../../src/controllers/adminSubjects.controller.js';
import {
  createRegistrationWindowController,
  getStudentSubjectsController,
  getFacultySubjectsController,
  removeStudentController,
  removeFacultyController,
} from '../../src/controllers/admin.controller.js';

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

describe('Unit Tests: Admin Subject Management', () => {
  test('createSubject rejects missing subjectCode or name with 400', async () => {
    const res = mockRes();
    const req = {
      body: { subjectCode: '', name: 'Algorithms' },
      user: { userId: 1, role: 'ADMIN' },
    };
    await createSubject(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /required/i);
  });

  test('createSubject rejects invalid credits with 400', async () => {
    const res = mockRes();
    const req = {
      body: { subjectCode: 'CS101', name: 'Intro CS', credits: 45 },
      user: { userId: 1, role: 'ADMIN' },
    };
    await createSubject(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /between 1 and 30/i);
  });

  test('createSubject rejects overly long subjectCode or name with 400', async () => {
    const res = mockRes();
    const req = {
      body: { subjectCode: 'A'.repeat(35), name: 'Intro CS', credits: 4 },
      user: { userId: 1, role: 'ADMIN' },
    };
    await createSubject(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /allowed length/i);
  });

  test('createSubject rejects unauthenticated admin with 401', async () => {
    const res = mockRes();
    const req = {
      body: { subjectCode: 'CS101', name: 'Intro CS', credits: 4 },
      user: null,
    };
    await createSubject(req, res, () => {});
    assert.equal(res.statusCode, 401);
    assert.match(res.body.message, /authentication is required/i);
  });
});

describe('Unit Tests: Admin Subject Requests Review', () => {
  test('reviewSubjectRequest rejects invalid requestId with 400', async () => {
    const res = mockRes();
    const req = {
      params: { requestId: 'invalid-id' },
      body: { decision: 'APPROVED' },
      user: { userId: 1, role: 'ADMIN' },
    };
    await reviewSubjectRequest(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid request ID/i);
  });

  test('reviewSubjectRequest rejects invalid decision value with 400', async () => {
    const res = mockRes();
    const req = {
      params: { requestId: '5' },
      body: { decision: 'MAYBE' },
      user: { userId: 1, role: 'ADMIN' },
    };
    await reviewSubjectRequest(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /APPROVED or REJECTED/i);
  });

  test('reviewSubjectRequest rejects unauthenticated user with 401', async () => {
    const res = mockRes();
    const req = {
      params: { requestId: '5' },
      body: { decision: 'APPROVED' },
      user: null,
    };
    await reviewSubjectRequest(req, res, () => {});
    assert.equal(res.statusCode, 401);
  });
});

describe('Unit Tests: Admin Registration Window & Account Management', () => {
  test('createRegistrationWindowController rejects unauthenticated request with 401', async () => {
    const res = mockRes();
    const req = { body: { startsAt: '2026-01-01', endsAt: '2026-01-10' }, user: null };
    await createRegistrationWindowController(req, res, () => {});
    assert.equal(res.statusCode, 401);
  });

  test('getStudentSubjectsController rejects non-integer studentId with 400', async () => {
    const res = mockRes();
    const req = { params: { studentId: 'abc' }, user: { userId: 1, role: 'ADMIN' } };
    await getStudentSubjectsController(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid student ID/i);
  });

  test('getFacultySubjectsController rejects non-integer facultyId with 400', async () => {
    const res = mockRes();
    const req = { params: { facultyId: '-1' }, user: { userId: 1, role: 'ADMIN' } };
    await getFacultySubjectsController(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid faculty ID/i);
  });

  test('removeStudentController rejects non-integer accountId with 400', async () => {
    const res = mockRes();
    const req = { params: { accountId: 'not-a-number' }, user: { userId: 1, role: 'ADMIN' } };
    await removeStudentController(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid account ID/i);
  });

  test('removeFacultyController rejects non-integer accountId with 400', async () => {
    const res = mockRes();
    const req = { params: { accountId: '0' }, user: { userId: 1, role: 'ADMIN' } };
    await removeFacultyController(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid account ID/i);
  });
});
