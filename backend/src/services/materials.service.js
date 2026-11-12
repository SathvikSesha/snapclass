import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { s3Client, S3_BUCKET } from '../config/s3.js';

import * as materialsRepository from '../repositories/materials.repository.js';

const DOWNLOAD_URL_EXPIRY_SECONDS = 300;

const createError = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const getAuthorizedProfileId = async (userId, role) => {
  if (role === 'FACULTY') {
    const facultyId =
      await materialsRepository.getFacultyIdByUserId(userId);

    if (!facultyId) {
      throw createError('Faculty profile not found', 404);
    }

    return {
      profileId: facultyId,
      hasAccess: materialsRepository.isFacultyAssignedToSubject,
    };
  }

  if (role === 'STUDENT') {
    const studentId =
      await materialsRepository.getStudentIdByUserId(userId);

    if (!studentId) {
      throw createError('Student profile not found', 404);
    }

    return {
      profileId: studentId,
      hasAccess: materialsRepository.isStudentEnrolledInSubject,
    };
  }

  throw createError('You are not authorized to access materials', 403);
};

const verifySubjectAccess = async ({
  userId,
  role,
  subjectId,
}) => {
  const { profileId, hasAccess } =
    await getAuthorizedProfileId(userId, role);

  const allowed = await hasAccess(profileId, subjectId);

  if (!allowed) {
    throw createError(
      'You do not have access to materials for this subject',
      403
    );
  }
};

export const getSubjectMaterials = async ({
  userId,
  role,
  subjectId,
}) => {
  if (!Number.isSafeInteger(subjectId) || subjectId <= 0) {
    throw createError('Invalid subject ID', 400);
  }

  await verifySubjectAccess({
    userId,
    role,
    subjectId,
  });

  const materials =
    await materialsRepository.getAvailableMaterialsBySubject(
      subjectId
    );

  return {
    subjectId,
    totalMaterials: materials.length,
    materials,
  };
};

export const generateMaterialDownloadUrl = async ({
  userId,
  role,
  materialId,
}) => {
  if (!Number.isSafeInteger(materialId) || materialId <= 0) {
    throw createError('Invalid material ID', 400);
  }

  const material =
    await materialsRepository.getAvailableMaterialById(materialId);

  if (!material) {
    throw createError('Material not found', 404);
  }

  await verifySubjectAccess({
    userId,
    role,
    subjectId: Number(material.subjectId),
  });

  const safeFilename = material.originalFilename
    .replace(/[\r\n"]/g, '_');

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: material.objectKey,
    ResponseContentDisposition:
      `attachment; filename="${safeFilename}"`,
    ResponseContentType: material.fileType,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
  });

  return {
    materialId: material.materialId,
    downloadUrl,
    filename: material.originalFilename,
    fileType: material.fileType,
    fileSize: material.fileSize,
    expiresIn: DOWNLOAD_URL_EXPIRY_SECONDS,
  };
};