const supabase = require('../config/supabase');
const logger = require('../utils/logger');
const { stopJob } = require('../services/jobProcessor');

/**
 * GET /api/live-data/jobs
 * Get all jobs for the current user (most recent first)
 */
exports.getJobs = async (req, res) => {
    const userId = req.user.id;

    try {
        const { data, error } = await supabase
            .from('send_jobs')
            .select('id, automation_id, automation_name, total_rows, total_batches, current_batch, status, created_at, started_at, completed_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) {
            logger.error(`[LIVE-DATA] Failed to fetch jobs: ${error.message}`);
            return res.status(500).json({ success: false, message: 'Unable to load jobs' });
        }

        res.json({ success: true, jobs: data || [] });
    } catch (err) {
        logger.error(`[LIVE-DATA] Server error: ${err.message}`);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/live-data/jobs/:jobId
 * Get a specific job with its batches
 */
exports.getJob = async (req, res) => {
    const userId = req.user.id;
    const { jobId } = req.params;

    try {
        // Get job
        const { data: job, error: jobError } = await supabase
            .from('send_jobs')
            .select('id, automation_id, automation_name, total_rows, total_batches, current_batch, status, created_at, started_at, completed_at')
            .eq('id', jobId)
            .eq('user_id', userId)
            .single();

        if (jobError || !job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        // Get batches
        const { data: batches, error: batchError } = await supabase
            .from('send_batches')
            .select('id, batch_number, total_rows, processed_rows, sent_rows, failed_rows, status, started_at, completed_at, next_batch_at')
            .eq('job_id', jobId)
            .order('batch_number', { ascending: true });

        if (batchError) {
            logger.error(`[LIVE-DATA] Failed to fetch batches: ${batchError.message}`);
            return res.status(500).json({ success: false, message: 'Unable to load batch data' });
        }

        res.json({
            success: true,
            job,
            batches: batches || []
        });
    } catch (err) {
        logger.error(`[LIVE-DATA] Server error: ${err.message}`);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * GET /api/live-data/jobs/:jobId/rows
 * Get paginated rows for a job
 */
exports.getJobRows = async (req, res) => {
    const userId = req.user.id;
    const { jobId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

    try {
        // Verify ownership
        const { data: job, error: jobError } = await supabase
            .from('send_jobs')
            .select('id')
            .eq('id', jobId)
            .eq('user_id', userId)
            .single();

        if (jobError || !job) {
            return res.status(404).json({ success: false, message: 'Job not found' });
        }

        // Get total count
        const { count, error: countError } = await supabase
            .from('send_rows')
            .select('*', { count: 'exact', head: true })
            .eq('job_id', jobId);

        if (countError) {
            logger.error(`[LIVE-DATA] Count error: ${countError.message}`);
        }

        // Get paginated rows
        const { data: rows, error: rowError } = await supabase
            .from('send_rows')
            .select('id, row_number, whatsapp_number, mapped_data, status, error_message, processed_at')
            .eq('job_id', jobId)
            .order('row_number', { ascending: true })
            .range(offset, offset + limit - 1);

        if (rowError) {
            logger.error(`[LIVE-DATA] Failed to fetch rows: ${rowError.message}`);
            return res.status(500).json({ success: false, message: 'Unable to load row data' });
        }

        res.json({
            success: true,
            rows: rows || [],
            total: count || 0,
            page,
            limit,
            totalPages: Math.ceil((count || 0) / limit)
        });
    } catch (err) {
        logger.error(`[LIVE-DATA] Server error: ${err.message}`);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

/**
 * POST /api/live-data/jobs/:jobId/stop
 * Stop an active job safely and permanently
 */
exports.stopJob = async (req, res) => {
    const { jobId } = req.params;
    const userId = req.user.id;

    logger.info(`[LIVE-DATA] Received request to stop job: ${jobId}`);

    if (!jobId) {
        return res.status(400).json({ success: false, message: 'Job ID is required' });
    }

    try {
        const result = await stopJob(jobId, userId);
        return res.status(result.status || 200).json(result);
    } catch (err) {
        logger.error(`[LIVE-DATA] Server error stopping job ${jobId}: ${err.message}`);
        return res.status(500).json({ success: false, message: 'Server error stopping job' });
    }
};
