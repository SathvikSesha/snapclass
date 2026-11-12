import {
  getSubjectMaterials,
  generateMaterialDownloadUrl,
} from '../services/materials.service.js';

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

export const listSubjectMaterials = async (req, res, next) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const subjectId = parsePositiveId(req.params.subjectId);

    if (!subjectId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid subject ID.',
      });
    }

    const result = await getSubjectMaterials({
      userId,
      role: req.user.role,
      subjectId,
    });

    return res.status(200).json({
      success: true,
      message: 'Subject materials fetched successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const downloadSubjectMaterial = async (req, res, next) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    const materialId = parsePositiveId(req.params.materialId);

    if (!materialId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid material ID.',
      });
    }

    const result = await generateMaterialDownloadUrl({
      userId,
      role: req.user.role,
      materialId,
    });

    return res.status(200).json({
      success: true,
      message: 'Download URL generated successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};