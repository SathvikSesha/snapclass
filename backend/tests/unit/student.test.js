import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getStudentDashboardController,
  getStudentSubjectsController,
  registerForSubjectController,
  getStudentAttendanceController,
  getStudentAttendanceHistoryController,
  studentFaceLoginController,
} from '../../src/controllers/student.controller.js';
import {
  saveStudentQuizAnswerController,
} from '../../src/controllers/studentQuiz.controller.js';

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

describe('Unit Tests: Student Dashboard & Subject Registration', () => {
  test('getStudentDashboardController rejects unauthenticated request with 401', async () => {
    const res = mockRes();
    const req = { user: null };
    await getStudentDashboardController(req, res, () => {});
    assert.equal(res.statusCode, 401);
  });

  test('getStudentSubjectsController rejects unauthenticated request with 401', async () => {
    const res = mockRes();
    const req = { user: { userId: 'not-a-number' } };
    await getStudentSubjectsController(req, res, () => {});
    assert.equal(res.statusCode, 401);
  });

  test('registerForSubjectController rejects invalid userId with 401', async () => {
    const res = mockRes();
    const req = { params: { subjectId: '1' }, user: { userId: -5 } };
    await registerForSubjectController(req, res, () => {});
    assert.equal(res.statusCode, 401);
  });
});

describe('Unit Tests: Student Attendance & Face Login', () => {
  test('getStudentAttendanceController rejects unauthenticated user with 401', async () => {
    const res = mockRes();
    const req = { params: { subjectId: '2' }, user: null };
    await getStudentAttendanceController(req, res, () => {});
    assert.equal(res.statusCode, 401);
  });

  test('getStudentAttendanceHistoryController rejects unauthenticated user with 401', async () => {
    const res = mockRes();
    const req = { params: { subjectId: '2' }, user: { userId: 0 } };
    await getStudentAttendanceHistoryController(req, res, () => {});
    assert.equal(res.statusCode, 401);
  });

  test('studentFaceLoginController rejects missing face image with 400', async () => {
    const res = mockRes();
    const req = { file: null };
    await studentFaceLoginController(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /face image is required/i);
  });
});

describe('Unit Tests: Student Quiz Taking & Answer Saving', () => {
  test('saveStudentQuizAnswerController rejects request missing selectedOptionId with 400', async () => {
    const res = mockRes();
    let thrownError = null;
    const next = (err) => { thrownError = err; };
    const req = {
      params: { attemptId: '1' },
      body: { questionId: 10 },
      user: { userId: 7, role: 'STUDENT' },
    };
    await saveStudentQuizAnswerController(req, res, next);
    assert.ok(thrownError !== null);
    assert.equal(thrownError.statusCode, 400);
    assert.match(thrownError.message, /selectedOptionId is required/i);
  });
});
