const supabase = require('../config/supabase');
const logger = require('../utils/logger');

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * POST /api/upload/image
 * Upload an image to Supabase Storage and return the public URL.
 */
exports.uploadImage = async (req, res) => {
    const userId = req.user.id;

    try {
        // The image is expected as base64 in the JSON body
        const { fileName, fileData, mimeType, automationId } = req.body;

        if (!fileName || !fileData || !mimeType) {
            return res.status(400).json({ success: false, message: 'Missing required fields: fileName, fileData, mimeType' });
        }

        // Validate MIME type
        if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
            logger.warn(`[UPLOAD] Rejected unsupported MIME type: ${mimeType}`);
            return res.status(400).json({ success: false, message: 'Unsupported image format. Please use JPG, PNG, or WEBP.' });
        }

        // Validate file extension
        const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            logger.warn(`[UPLOAD] Rejected unsupported extension: ${ext}`);
            return res.status(400).json({ success: false, message: 'Unsupported file extension.' });
        }

        // Decode base64
        const buffer = Buffer.from(fileData, 'base64');

        // Validate file size
        if (buffer.length > MAX_FILE_SIZE) {
            logger.warn(`[UPLOAD] Rejected oversized file: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);
            return res.status(400).json({ success: false, message: 'Image is too large. Please choose an image smaller than 5 MB.' });
        }

        // Validate buffer starts with valid image magic bytes
        if (!isValidImageBuffer(buffer, mimeType)) {
            logger.warn(`[UPLOAD] Rejected invalid image content for claimed type: ${mimeType}`);
            return res.status(400).json({ success: false, message: 'File content does not match the declared image type.' });
        }

        // Generate unique filename
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `${userId}/${automationId || 'general'}/${timestamp}-${random}-${safeName}`;

        logger.info(`[UPLOAD] Uploading image: ${storagePath} (${(buffer.length / 1024).toFixed(1)} KB)`);

        // Create a dedicated client for upload to absolutely guarantee service_role bypasses RLS
        const { createClient } = require('@supabase/supabase-js');
        const uploadClient = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false } }
        );

        // Upload to Supabase Storage
        const { data, error } = await uploadClient.storage
            .from('automation-images')
            .upload(storagePath, buffer, {
                contentType: mimeType,
                upsert: false
            });

        if (error) {
            logger.error(`[UPLOAD] Supabase Storage error: ${error.message}`);
            return res.status(500).json({ success: false, message: 'Unable to upload image right now. Please try again.' });
        }

        // Get public URL
        const { data: urlData } = uploadClient.storage
            .from('automation-images')
            .getPublicUrl(storagePath);

        if (!urlData || !urlData.publicUrl) {
            logger.error(`[UPLOAD] Failed to generate public URL`);
            return res.status(500).json({ success: false, message: 'Image uploaded but failed to generate URL.' });
        }

        logger.info(`[UPLOAD] Success: ${urlData.publicUrl}`);

        res.json({
            success: true,
            url: urlData.publicUrl,
            filename: fileName,
            size: buffer.length
        });

    } catch (err) {
        logger.error(`[UPLOAD] Server error: ${err.message}`);
        res.status(500).json({ success: false, message: 'Image upload failed. Please try again.' });
    }
};

/**
 * Basic magic-byte validation to ensure file content matches claimed MIME type.
 */
function isValidImageBuffer(buffer, mimeType) {
    if (buffer.length < 4) return false;

    if (mimeType === 'image/jpeg') {
        // JPEG: starts with FF D8 FF
        return buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    }
    if (mimeType === 'image/png') {
        // PNG: starts with 89 50 4E 47
        return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    }
    if (mimeType === 'image/webp') {
        // WebP: starts with RIFF....WEBP
        return buffer.length >= 12 &&
            buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
            buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    }

    return false;
}
