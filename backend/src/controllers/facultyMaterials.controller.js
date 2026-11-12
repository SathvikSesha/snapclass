import {
  generateMaterialUploadUrl,
  completeMaterialUpload,
} from '../services/facultyMaterials.service.js';

const getUserId = (req) => {
  const rawId = req.user?.userId ?? req.user?.sub;
  const userId = Number(rawId);

  return Number.isSafeInteger(userId) && userId > 0
    ? userId
    : null;
};

const parsePositiveId = (value) => {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

export const createMaterialUpload = async (req, res, next) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as faculty.',
      });
    }

    const subjectId = parsePositiveId(req.params.subjectId);

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subject ID',
      });
    }

    const result = await generateMaterialUploadUrl({
      userId,
      subjectId,
      title: req.body.title,
      description: req.body.description,
      originalFilename: req.body.originalFilename,
      fileType: req.body.fileType,
      fileSize: req.body.fileSize,
    });

    return res.status(201).json({
      success: true,
      message: 'Upload URL generated successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const completeMaterialUploadController = async (
  req,
  res,
  next
) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in as faculty.',
      });
    }

    const materialId = parsePositiveId(req.params.materialId);

    if (!materialId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid material ID',
      });
    }

    const result = await completeMaterialUpload({
      userId,
      materialId,
    });

    return res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};