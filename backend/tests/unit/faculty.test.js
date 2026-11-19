import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { recognizeAttendanceFacesController } from '../../src/controllers/facultyAttendanceRecognition.controller.js';
import {
  createMaterialUpload,
  completeMaterialUploadController,
} from '../../src/controllers/facultyMaterials.controller.js';
import {
  listSubjectMaterials,
  downloadSubjectMaterial,
} from '../../src/controllers/materials.controller.js';
import {
  saveQuizDraftController,
  editFacultyQuizDraftController,
  publishFacultyQuizController,
} from '../../src/controllers/facultyQuiz.controller.js';

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

describe('Unit Tests: Faculty Attendance & Biometric Recognition', () => {
  test('recognizeAttendanceFacesController rejects invalid subjectId with 400', async () => {
    const res = mockRes();
    const req = {
      params: { subjectId: 'invalid' },
      user: { userId: 5, role: 'FACULTY' },
      files: [],
    };
    await recognizeAttendanceFacesController(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /subjectId is required/i);
  });

  test('recognizeAttendanceFacesController rejects unauthenticated user with 401', async () => {
    const res = mockRes();
    const req = {
      params: { subjectId: '10' },
      user: null,
      files: [],
    };
    await recognizeAttendanceFacesController(req, res, () => {});
    assert.equal(res.statusCode, 401);
  });
});

describe('Unit Tests: Faculty Materials Upload & Download', () => {
  test('createMaterialUpload rejects unauthenticated user with 401', async () => {
    const res = mockRes();
    const req = {
      params: { subjectId: '1' },
      body: { title: 'Chapter 1', originalFilename: 'doc.pdf', fileType: 'pdf', fileSize: 1024 },
      user: null,
    };
    await createMaterialUpload(req, res, () => {});
    assert.equal(res.statusCode, 401);
  });

  test('createMaterialUpload rejects invalid subject ID with 400', async () => {
    const res = mockRes();
    const req = {
      params: { subjectId: 'abc' },
      body: { title: 'Chapter 1' },
      user: { userId: 5, role: 'FACULTY' },
    };
    await createMaterialUpload(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid subject ID/i);
  });

  test('completeMaterialUploadController rejects invalid materialId with 400', async () => {
    const res = mockRes();
    const req = {
      params: { materialId: '-5' },
      user: { userId: 5, role: 'FACULTY' },
    };
    await completeMaterialUploadController(req, res, () => {});
    assert.equal(res.statusCode, 400);
  });

  test('listSubjectMaterials rejects non-positive subject ID with 400', async () => {
    const res = mockRes();
    const req = {
      params: { subjectId: '0' },
      user: { userId: 5, role: 'FACULTY' },
    };
    await listSubjectMaterials(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid subject ID/i);
  });

  test('downloadSubjectMaterial rejects non-integer material ID with 400', async () => {
    const res = mockRes();
    const req = {
      params: { materialId: 'xyz' },
      user: { userId: 5, role: 'FACULTY' },
    };
    await downloadSubjectMaterial(req, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /Invalid material ID/i);
  });
});

describe('Unit Tests: Faculty Quiz Management Validation', () => {
  test('saveQuizDraftController passes errors to next handler if service throws', async () => {
    const res = mockRes();
    let errorPassed = null;
    const next = (err) => { errorPassed = err; };
    const req = {
      params: { subjectId: 'invalid-subject' },
      body: { title: 'Test Quiz' },
      user: { userId: 5, role: 'FACULTY' },
    };
    await saveQuizDraftController(req, res, next);
    assert.ok(errorPassed !== null, 'Should pass validation/db error to next');
  });

  test('publishFacultyQuizController forwards error if required dates or options missing', async () => {
    const res = mockRes();
    let errorPassed = null;
    const next = (err) => { errorPassed = err; };
    const req = {
      params: { quizId: '1' },
      body: {},
      user: { userId: 5, role: 'FACULTY' },
    };
    await publishFacultyQuizController(req, res, next);
    assert.ok(errorPassed !== null);
  });
});
