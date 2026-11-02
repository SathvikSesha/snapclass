import multer from 'multer';

const allowedTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const studentFaceUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter(req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      const error = new Error('Face image must be JPEG, PNG, or WebP.');
      error.statusCode = 400;
      return callback(error);
    }

    callback(null, true);
  },
});

export const attendanceImagesUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 4,
  },
  fileFilter(req, file, callback) {
    if (!allowedTypes.has(file.mimetype)) {
      const error = new Error('Attendance images must be JPEG, PNG, or WebP.');
      error.statusCode = 400;
      return callback(error);
    }

    callback(null, true);
  },
}).array('images', 4);
