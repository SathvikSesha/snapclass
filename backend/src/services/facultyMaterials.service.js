import { randomUUID } from 'crypto';
import path from 'path';

import {
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { s3Client, S3_BUCKET } from '../config/s3.js';
import { env } from '../config/env.js';

import * as facultyMaterialsRepository from '../repositories/facultyMaterials.repository.js';
import * as materialIngestionRepository
  from '../repositories/materialIngestion.repository.js';

import {
  queueMaterialIngestion,
} from './materialIngestionQueue.service.js';

const UPLOAD_URL_EXPIRY_SECONDS = 300;

const ALLOWED_FILE_TYPES = {
  '.pdf': ['application/pdf'],

  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],

  '.pptx': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ],

  '.xlsx': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ],

  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
};

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sanitizeFilename = (filename) => {
  return path
    .basename(filename.replace(/\\/g, '/'))
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
};

const validateFile = ({ filename, fileType, fileSize }) => {
  if (!filename || typeof filename !== 'string') {
    throw createError('Original filename is required', 400);
  }

  if (!fileType || typeof fileType !== 'string') {
    throw createError('File type is required', 400);
  }

  if (
    !Number.isSafeInteger(fileSize) ||
    fileSize <= 0
  ) {
    throw createError('Invalid file size', 400);
  }

  if (fileSize > env.maxMaterialFileSize) {
    throw createError(
      `File size cannot exceed ${Math.floor(
        env.maxMaterialFileSize / (1024 * 1024)
      )} MB`,
      400
    );
  }

  const safeFilename = sanitizeFilename(filename);
  const extension = path.extname(safeFilename).toLowerCase();

  const allowedMimeTypes = ALLOWED_FILE_TYPES[extension];

  if (!allowedMimeTypes || !allowedMimeTypes.includes(fileType)) {
    throw createError(
      'Unsupported file type. Upload PDF, DOCX, PPTX, XLSX, JPG or PNG files.',
      400
    );
  }

  return safeFilename;
};

export const generateMaterialUploadUrl = async ({
  userId,
  subjectId,
  title,
  description,
  originalFilename,
  fileType,
  fileSize,
}) => {
  if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
    throw createError('Invalid subject ID', 400);
  }

  if (!title || typeof title !== 'string' || !title.trim()) {
    throw createError('Material title is required', 400);
  }

  if (title.trim().length > 200) {
    throw createError('Material title cannot exceed 200 characters', 400);
  }

  if (
    description !== undefined &&
    description !== null &&
    typeof description !== 'string'
  ) {
    throw createError('Invalid material description', 400);
  }

  const safeFilename = validateFile({
    filename: originalFilename,
    fileType,
    fileSize,
  });

  const facultyId =
    await facultyMaterialsRepository.getFacultyIdByUserId(userId);

  if (!facultyId) {
    throw createError('Faculty profile not found', 404);
  }

  const isAssigned =
    await facultyMaterialsRepository.isFacultyAssignedToSubject(
      facultyId,
      subjectId
    );

  if (!isAssigned) {
    throw createError(
      'You are not assigned to teach this subject',
      403
    );
  }

  const extension = path.extname(safeFilename).toLowerCase();

  const objectKey =
    `subjects/${subjectId}/materials/${randomUUID()}${extension}`;

  const materialId =
    await facultyMaterialsRepository.createPendingMaterial({
      subjectId,
      facultyId,
      title: title.trim(),
      description: description?.trim() || null,
      originalFilename: safeFilename,
      objectKey,
      fileType,
      fileSize,
    });

  try {
    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: objectKey,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
    });

    return {
      materialId,
      uploadUrl,
      objectKey,
      expiresIn: UPLOAD_URL_EXPIRY_SECONDS,
      requiredHeaders: {
        'Content-Type': fileType,
      },
    };
  } catch (error) {
    await facultyMaterialsRepository.markMaterialFailed(
      materialId,
      facultyId
    );

    throw error;
  }
};

export const completeMaterialUpload = async ({
  userId,
  materialId,
}) => {
  if (!Number.isSafeInteger(materialId) || materialId <= 0) {
    throw createError('Invalid material ID', 400);
  }

  const facultyId =
    await facultyMaterialsRepository.getFacultyIdByUserId(userId);

  if (!facultyId) {
    throw createError('Faculty profile not found', 404);
  }

  const material =
    await facultyMaterialsRepository.getPendingMaterialForFaculty(
      materialId,
      facultyId
    );

  if (!material) {
    throw createError(
      'Pending material not found or you do not have permission to access it',
      404
    );
  }

  if (material.status === 'AVAILABLE') {
    throw createError('Material has already been uploaded', 409);
  }

  if (material.status !== 'PENDING') {
    throw createError('This material is not awaiting upload', 409);
  }

  let uploadedObject;

  try {
    uploadedObject = await s3Client.send(
      new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: material.objectKey,
      })
    );
  } catch (error) {
    if (
      error.name === 'NotFound' ||
      error.name === 'Forbidden' ||
      error.$metadata?.httpStatusCode === 404 ||
      error.$metadata?.httpStatusCode === 403
    ) {
      throw createError(
        'File was not found in S3. Please upload the file first.',
        400
      );
    }

    throw error;
  }

  if (Number(uploadedObject.ContentLength) !== Number(material.fileSize)) {
    throw createError(
      'Uploaded file size does not match the requested file size',
      400
    );
  }

  if (uploadedObject.ContentType !== material.fileType) {
    throw createError(
      'Uploaded file type does not match the requested file type',
      400
    );
  }

  const updated =
    await facultyMaterialsRepository.markMaterialAvailable(
      materialId,
      facultyId
    );

  if (!updated) {
    throw createError(
      'Material status could not be updated. Please retry.',
      409
    );
  }
  let ingestionStatus = 'FAILED';

  try {
    const queued =
      await materialIngestionRepository.markIngestionQueued(materialId);

    if (!queued) {
      throw new Error('Could not update material ingestion status.');
    }

    await queueMaterialIngestion({
      materialId,
      subjectId: Number(material.subjectId),
    });

    ingestionStatus = 'QUEUED';
  } catch (error) {
    console.error(
      `Could not queue material ${materialId} for AI ingestion:`,
      error.message
    );

    await materialIngestionRepository.markIngestionFailed(
      materialId,
      `Could not queue AI ingestion: ${error.message}`
    );
  }

  return {
    materialId,
    status: 'AVAILABLE',
    ingestionStatus,
    message: 'Material uploaded successfully',
  };
};