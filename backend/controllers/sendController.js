const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { createJob, startJobProcessing, stopJob } = require('../services/jobProcessor');

/**
 * POST /api/send/execute
 * Creates a persistent send job and starts background processing.
 * Returns immediately with the job ID.
 */
exports.executeSend = async (req, res) => {
    const { automationId, rows, imageUrls } = req.body;
    const userId = req.user.id;

    logger.info(`========================================`);
    logger.info(` SEND JOB CREATION STARTED`);
    logger.info(`========================================`);
    logger.info(`Automation ID: ${automationId}`);
    logger.info(`Total valid rows to process: ${rows ? rows.length : 0}`);
    if (imageUrls && Object.keys(imageUrls).length > 0) {
        logger.info(`Image URLs provided: ${Object.keys(imageUrls).length}`);
    }

    if (!automationId || !rows || !Array.isArray(rows) || rows.length === 0) {
        logger.error(`[ERROR] Invalid request payload`);
        return res.status(400).json({ success: false, message: 'Invalid request payload' });
    }

    const ASKEVA_TOKEN = process.env.ASKEVA_TOKEN;
    if (!ASKEVA_TOKEN) {
        logger.error(`[ASKEVA] ERROR: ASKEVA_TOKEN is not configured`);
        return res.status(500).json({ success: false, message: 'AskEVA is not configured on the server.' });
    }

    try {
        // 1. Verify ownership and get automation
        logger.info(`[AUTOMATION] Loading automation: ${automationId}`);
        const { data: automationData, error: autoError } = await supabase
            .from('automations')
            .select('*')
            .eq('id', automationId)
            .eq('user_id', userId)
            .single();

        if (autoError || !automationData) {
            logger.error(`[AUTOMATION] Automation not found or not authorized`);
            return res.status(404).json({ success: false, message: 'Automation not found or not authorized' });
        }

        logger.info(`[AUTOMATION] Automation found: ${automationData.automation_name}`);

        // 2. Parse JSON from cURL
        const jsonMatch = automationData.curl_content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            logger.error(`[ERROR] cURL parsing failed. Could not extract JSON body.`);
            return res.status(400).json({ success: false, message: 'Invalid AskEVA cURL saved in automation' });
        }

        let templateJson;
        try {
            templateJson = JSON.parse(jsonMatch[0]);
            logger.info(`[AUTOMATION] JSON body extracted successfully`);
        } catch (e) {
            logger.error(`[ERROR] cURL parsing failed. Could not parse JSON.`);
            return res.status(400).json({ success: false, message: 'Could not parse automation JSON' });
        }

        // 3. Create the persistent job (pass imageUrls for runtime replacement)
        const job = await createJob({
            userId,
            automationId,
            automationName: automationData.automation_name,
            rows,
            templateJson,
            imageUrls: imageUrls || {}
        });

        // 4. Start background processing (non-blocking)
        startJobProcessing(job.id);

        // 5. Return immediately with job ID
        logger.info(`[JOB] Job ${job.id} created and queued for processing`);
        res.json({
            success: true,
            jobId: job.id,
            message: 'Automation started'
        });

    } catch (err) {
        logger.error(`[ERROR] Internal error: ${err.message}`);
        res.status(500).json({ success: false, message: 'Failed to start automation. Please try again.' });
    }
};

/**
 * POST /api/send/:jobId/stop
 * Terminates an active send job safely and permanently.
 */
exports.stopSend = async (req, res) => {
    const { jobId } = req.params;
    const userId = req.user.id;

    logger.info(`[SEND] Received request to stop job: ${jobId}`);

    if (!jobId) {
        return res.status(400).json({ success: false, message: 'Job ID is required' });
    }

    try {
        const result = await stopJob(jobId, userId);
        return res.status(result.status || 200).json(result);
    } catch (err) {
        logger.error(`[SEND] Error stopping job ${jobId}: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Failed to stop automation job' });
    }
};
