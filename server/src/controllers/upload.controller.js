import asyncHandler from '../utils/asyncHandler.util.js';
import ApiError from '../utils/apiError.util.js';
import ApiResponse from '../utils/apiResponse.util.js';

/**
 * POST /api/v1/upload
 * 
 * Handles single or multiple file uploads.
 * Requires `upload.array('files')` middleware before it.
 */
export const uploadFiles = asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new ApiError(400, 'No files were uploaded.');
  }

  const uploadedFiles = req.files.map((file) => {
    let type = 'file';
    if (file.mimetype.startsWith('image/')) type = 'image';
    else if (file.mimetype.startsWith('video/')) type = 'video';
    else if (file.mimetype.startsWith('audio/')) type = 'audio';

    return {
      type,
      url: file.location, // S3 URL provided by multer-s3
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
  });

  return res.status(200).json(
    new ApiResponse(200, 'Files uploaded successfully.', uploadedFiles)
  );
});
