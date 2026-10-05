const supabase = require('../config/supabase');
const logger = require('../utils/logger');

const BATCH_SIZE = 300;
const SEND_INTERVAL_MS = 200; // 5 messages per second
const BATCH_COOLDOWN_MS = 60000; // 60 seconds between batches

// In-memory store of active jobs (jobId -> { stopped, currentAbortController, wakeCooldown })
const activeJobs = new Map();

/**
 * Create a new send job with batches and rows
 */
async function createJob({ userId, automationId, automationName, rows, templateJson, imageUrls }) {
    const totalRows = rows.length;
    const totalBatches = Math.ceil(totalRows / BATCH_SIZE);

    // Clone templateJson and update image parameters with uploaded URLs
    const finalTemplateJson = JSON.parse(JSON.stringify(templateJson));
    finalTemplateJson._image_urls = imageUrls || {};
    if (imageUrls && Object.keys(imageUrls).length > 0) {
        let imgCount = 1;
        if (finalTemplateJson.template && finalTemplateJson.template.components) {
            finalTemplateJson.template.components.forEach(comp => {
                if (comp.parameters) {
                    comp.parameters.forEach(param => {
                        if (param.type === 'image') {
                            const newUrl = imageUrls[String(imgCount)];
                            if (newUrl) {
                                if (!param.image) param.image = {};
                                param.image.link = newUrl;
                            }
                            imgCount++;
                        }
                    });
                }
            });
        }
    }

    // 1. Create the job
    const { data: job, error: jobError } = await supabase
        .from('send_jobs')
        .insert({
            user_id: userId,
            automation_id: automationId,
            automation_name: automationName,
            total_rows: totalRows,
            total_batches: totalBatches,
            current_batch: 1,
            status: 'QUEUED',
            template_json: finalTemplateJson
        })
        .select()
        .single();

    if (jobError) {
        logger.error(`[JOB] Failed to create job: ${jobError.message}`);
        throw new Error('Failed to create send job');
    }

    logger.info(`[JOB] Created job ${job.id} with ${totalRows} rows, ${totalBatches} batches`);

    // 2. Create batches and rows
    for (let b = 0; b < totalBatches; b++) {
        const batchRows = rows.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
        const batchNumber = b + 1;

        const { data: batch, error: batchError } = await supabase
            .from('send_batches')
            .insert({
                job_id: job.id,
                batch_number: batchNumber,
                total_rows: batchRows.length,
                processed_rows: 0,
                sent_rows: 0,
                failed_rows: 0,
                status: 'PENDING'
            })
            .select()
            .single();

        if (batchError) {
            logger.error(`[JOB] Failed to create batch ${batchNumber}: ${batchError.message}`);
            throw new Error('Failed to create batch');
        }

        // Insert rows in chunks of 100 to avoid Supabase limits
        const rowInserts = batchRows.map((row, idx) => ({
            job_id: job.id,
            batch_id: batch.id,
            row_number: (b * BATCH_SIZE) + idx + 1,
            whatsapp_number: row.whatsappNumber,
            mapped_data: row.variables || {},
            status: 'PENDING'
        }));

        for (let i = 0; i < rowInserts.length; i += 100) {
            const chunk = rowInserts.slice(i, i + 100);
            const { error: rowError } = await supabase
                .from('send_rows')
                .insert(chunk);

            if (rowError) {
                logger.error(`[JOB] Failed to insert rows chunk: ${rowError.message}`);
                throw new Error('Failed to create send rows');
            }
        }

        logger.info(`[JOB] Created batch ${batchNumber} with ${batchRows.length} rows`);
    }

    return job;
}

/**
 * Start processing a job in the background
 */
function startJobProcessing(jobId) {
    if (activeJobs.has(jobId)) {
        logger.warn(`[JOB] Job ${jobId} is already being processed`);
        return;
    }

    const jobControl = {
        stopped: false,
        currentAbortController: null,
        wakeCooldown: null
    };
    activeJobs.set(jobId, jobControl);

    // Run async without awaiting - this is the background processor
    processJob(jobId, jobControl).catch(err => {
        logger.error(`[JOB] Unhandled error processing job ${jobId}: ${err.message}`);
        markJobFailed(jobId, err.message);
    }).finally(() => {
        activeJobs.delete(jobId);
    });
}

/**
 * Main job processing loop
 */
async function processJob(jobId, jobControl) {
    logger.info(`[JOB] ========================================`);
    logger.info(`[JOB] Starting job processing: ${jobId}`);
    logger.info(`[JOB] ========================================`);

    // Check DB status before marking PROCESSING in case user already stopped it
    const { data: checkJob, error: checkError } = await supabase
        .from('send_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

    if (checkError || !checkJob) {
        throw new Error('Job not found');
    }

    if (checkJob.status === 'STOPPED') {
        logger.info(`[JOB] Job ${jobId} was already marked STOPPED. Aborting start.`);
        return;
    }

    // Update job status
    await supabase
        .from('send_jobs')
        .update({ status: 'PROCESSING', started_at: new Date().toISOString() })
        .eq('id', jobId);

    // Get the job
    const job = checkJob;

    // Get ASKEVA token
    const ASKEVA_TOKEN = process.env.ASKEVA_TOKEN;
    if (!ASKEVA_TOKEN) {
        throw new Error('ASKEVA_TOKEN is not configured');
    }

    const ASKEVA_URL = `https://backend.askeva.io/v1/message/send-message?token=${encodeURIComponent(ASKEVA_TOKEN)}`;

    // Get automation template
    const templateJson = job.template_json;
    if (!templateJson) {
        throw new Error('Template JSON not found in job');
    }

    // Get all batches ordered by batch number
    const { data: batches, error: batchError } = await supabase
        .from('send_batches')
        .select('*')
        .eq('job_id', jobId)
        .order('batch_number', { ascending: true });

    if (batchError || !batches) {
        throw new Error('Failed to fetch batches');
    }

    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];

        // Check if job was stopped in memory or in database
        if (jobControl.stopped) {
            logger.info(`[JOB] Job ${jobId} stopped. Halting before batch ${batch.batch_number}`);
            return;
        }

        const { data: dbStatusCheck } = await supabase
            .from('send_jobs')
            .select('status')
            .eq('id', jobId)
            .single();

        if (dbStatusCheck && dbStatusCheck.status === 'STOPPED') {
            jobControl.stopped = true;
            logger.info(`[JOB] Job ${jobId} detected as STOPPED in DB. Halting before batch ${batch.batch_number}`);
            return;
        }

        // Skip completed or stopped batches (for restart resilience)
        if (batch.status === 'COMPLETED' || batch.status === 'STOPPED') {
            logger.info(`[JOB] Batch ${batch.batch_number} already ${batch.status}, skipping`);
            continue;
        }

        // Update current batch in job
        await supabase
            .from('send_jobs')
            .update({ current_batch: batch.batch_number })
            .eq('id', jobId);

        // Process this batch
        const imageUrls = (templateJson && templateJson._image_urls) || {};
        await processBatch(batch, templateJson, ASKEVA_URL, jobId, imageUrls, jobControl);

        // If stopped during batch processing, exit loop immediately
        if (jobControl.stopped) {
            logger.info(`[JOB] Job ${jobId} stopped during batch ${batch.batch_number}. Exiting processing.`);
            return;
        }

        // If not the last batch, wait 60 seconds (interruptible)
        if (i < batches.length - 1) {
            const nextBatchAt = new Date(Date.now() + BATCH_COOLDOWN_MS).toISOString();

            // Update batch with next_batch_at so frontend can show countdown
            await supabase
                .from('send_batches')
                .update({ next_batch_at: nextBatchAt })
                .eq('id', batch.id);

            // Update job status to WAITING
            await supabase
                .from('send_jobs')
                .update({ status: 'WAITING' })
                .eq('id', jobId);

            logger.info(`[JOB] Waiting ${BATCH_COOLDOWN_MS / 1000}s before next batch...`);
            const wokeEarly = await interruptibleSleep(BATCH_COOLDOWN_MS, jobControl);

            // If stopped during wait, exit immediately
            if (wokeEarly || jobControl.stopped) {
                logger.info(`[JOB] Job ${jobId} was stopped during cooldown. Exiting.`);
                return;
            }

            // Check DB status again after cooldown
            const { data: postWaitCheck } = await supabase
                .from('send_jobs')
                .select('status')
                .eq('id', jobId)
                .single();

            if (postWaitCheck && postWaitCheck.status === 'STOPPED') {
                jobControl.stopped = true;
                logger.info(`[JOB] Job ${jobId} detected as STOPPED after cooldown. Exiting.`);
                return;
            }

            // Resume processing status
            await supabase
                .from('send_jobs')
                .update({ status: 'PROCESSING' })
                .eq('id', jobId);
        }
    }

    // Mark job as completed ONLY if not stopped or failed
    if (!jobControl.stopped) {
        const { data: finalCheck } = await supabase
            .from('send_jobs')
            .select('status')
            .eq('id', jobId)
            .single();

        if (finalCheck && finalCheck.status !== 'STOPPED' && finalCheck.status !== 'FAILED') {
            await supabase
                .from('send_jobs')
                .update({
                    status: 'COMPLETED',
                    completed_at: new Date().toISOString()
                })
                .eq('id', jobId);

            logger.info(`[JOB] ========================================`);
            logger.info(`[JOB] Job ${jobId} COMPLETED`);
            logger.info(`[JOB] ========================================`);
        }
    }
}

/**
 * Process a single batch
 */
async function processBatch(batch, templateJson, ASKEVA_URL, jobId, imageUrls = {}, jobControl = { stopped: false }) {
    logger.info(`[BATCH] Processing batch ${batch.batch_number} (${batch.total_rows} rows)`);

    if (jobControl.stopped) {
        logger.info(`[BATCH] Batch ${batch.batch_number} halted before start: job is stopped`);
        return;
    }

    // Update batch status
    await supabase
        .from('send_batches')
        .update({ status: 'PROCESSING', started_at: new Date().toISOString() })
        .eq('id', batch.id);

    // Get all rows for this batch
    const { data: rows, error: rowError } = await supabase
        .from('send_rows')
        .select('*')
        .eq('batch_id', batch.id)
        .order('row_number', { ascending: true });

    if (rowError || !rows) {
        logger.error(`[BATCH] Failed to fetch rows: ${rowError?.message}`);
        await supabase
            .from('send_batches')
            .update({ status: 'FAILED', completed_at: new Date().toISOString() })
            .eq('id', batch.id);
        return;
    }

    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < rows.length; i++) {
        // Stop check before each row
        if (jobControl.stopped) {
            logger.info(`[BATCH] Stopping row loop in batch ${batch.batch_number} at row ${i + 1}/${rows.length}`);
            break;
        }

        const row = rows[i];

        // Skip already processed rows (for restart resilience)
        if (row.status === 'SENT' || row.status === 'FAILED') {
            if (row.status === 'SENT') sentCount++;
            if (row.status === 'FAILED') failedCount++;
            continue;
        }

        // Mark row as PROCESSING
        await supabase
            .from('send_rows')
            .update({ status: 'PROCESSING' })
            .eq('id', row.id);

        try {
            // Stop check right before issuing HTTP request
            if (jobControl.stopped) {
                await supabase
                    .from('send_rows')
                    .update({ status: 'PENDING' })
                    .eq('id', row.id);
                break;
            }

            // Clone template
            const reqBody = JSON.parse(JSON.stringify(templateJson));

            // Remove internal _image_urls property — must never be sent to AskEVA
            delete reqBody._image_urls;

            // Replace "to"
            reqBody.to = row.whatsapp_number;

            // Replace parameters mapping
            if (reqBody.template && reqBody.template.components) {
                // Replace text parameters in body component
                const bodyComponent = reqBody.template.components.find(c => c.type === 'body');
                if (bodyComponent && bodyComponent.parameters) {
                    let varCount = 1;
                    bodyComponent.parameters.forEach(param => {
                        if (param.type === 'text') {
                            param.text = row.mapped_data[String(varCount)] || '';
                            varCount++;
                        }
                    });
                }

                // Replace image parameters across ALL components using imageUrls
                if (imageUrls && Object.keys(imageUrls).length > 0) {
                    let imgCount = 1;
                    reqBody.template.components.forEach(comp => {
                        if (comp.parameters) {
                            comp.parameters.forEach(param => {
                                if (param.type === 'image') {
                                    const uploadedUrl = imageUrls[String(imgCount)];
                                    if (uploadedUrl) {
                                        if (!param.image) param.image = {};
                                        param.image.link = uploadedUrl;
                                        logger.info(`[ASK-EVA] Image ${imgCount} URL replaced: ${uploadedUrl.substring(0, 60)}...`);
                                    }
                                    imgCount++;
                                }
                            });
                        }
                    });
                }
            }

            logger.info(`[ASK-EVA] Batch ${batch.batch_number} | Row ${i + 1}/${rows.length} | To: ${row.whatsapp_number}`);

            // Send with timeout and cancellation support
            const controller = new AbortController();
            jobControl.currentAbortController = controller;
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            let apiRes;
            try {
                apiRes = await fetch(ASKEVA_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(reqBody),
                    signal: controller.signal
                });
            } catch (fetchErr) {
                if (jobControl.stopped) {
                    logger.info(`[ASK-EVA] Row ${row.row_number} aborted because job was STOPPED`);
                    await supabase
                        .from('send_rows')
                        .update({ status: 'PENDING' })
                        .eq('id', row.id);
                    break;
                }
                if (fetchErr.name === 'AbortError') {
                    throw new Error('Network timeout');
                }
                throw fetchErr;
            } finally {
                clearTimeout(timeoutId);
                jobControl.currentAbortController = null;
            }

            // If job was stopped while fetch was finishing, revert row to PENDING unless confirmed ok
            if (jobControl.stopped && !apiRes.ok) {
                await supabase
                    .from('send_rows')
                    .update({ status: 'PENDING' })
                    .eq('id', row.id);
                break;
            }

            const responseText = await apiRes.text();

            if (apiRes.ok) {
                sentCount++;
                await supabase
                    .from('send_rows')
                    .update({ status: 'SENT', processed_at: new Date().toISOString() })
                    .eq('id', row.id);
                logger.info(`[ASK-EVA] Row ${row.row_number} SUCCESS`);
            } else {
                failedCount++;
                // Sanitize error - don't expose tokens
                let safeError = `HTTP ${apiRes.status}`;
                try {
                    const errBody = JSON.parse(responseText);
                    if (errBody.message) safeError = errBody.message;
                } catch { 
                    safeError = `HTTP ${apiRes.status}: Request failed`;
                }

                await supabase
                    .from('send_rows')
                    .update({
                        status: 'FAILED',
                        error_message: safeError,
                        processed_at: new Date().toISOString()
                    })
                    .eq('id', row.id);

                logger.error(`[ASK-EVA] Row ${row.row_number} FAILED: ${safeError}`);

                // Auth error - stop the entire job
                if (apiRes.status === 401 || apiRes.status === 403) {
                    logger.error(`[ASK-EVA] Authentication failed - stopping job`);
                    await markJobFailed(jobId, 'AskEVA authentication failed. Please check the backend AskEVA token.');
                    return;
                }
            }
        } catch (err) {
            if (jobControl.stopped) {
                await supabase
                    .from('send_rows')
                    .update({ status: 'PENDING' })
                    .eq('id', row.id);
                break;
            }
            failedCount++;
            await supabase
                .from('send_rows')
                .update({
                    status: 'FAILED',
                    error_message: err.message || 'Unknown error',
                    processed_at: new Date().toISOString()
                })
                .eq('id', row.id);
            logger.error(`[ASK-EVA] Row ${row.row_number} FAILED: ${err.message}`);
        }

        // Update batch progress
        await supabase
            .from('send_batches')
            .update({
                processed_rows: sentCount + failedCount,
                sent_rows: sentCount,
                failed_rows: failedCount
            })
            .eq('id', batch.id);

        if (jobControl.stopped) {
            break;
        }

        // Rate limiting: wait 200ms between messages (5 msg/sec) - interruptible
        if (i < rows.length - 1) {
            const interrupted = await interruptibleSleep(SEND_INTERVAL_MS, jobControl);
            if (interrupted || jobControl.stopped) {
                break;
            }
        }
    }

    // Determine final batch status: if job was stopped mid-way, mark batch STOPPED
    const finalBatchStatus = jobControl.stopped ? 'STOPPED' : 'COMPLETED';
    await supabase
        .from('send_batches')
        .update({
            status: finalBatchStatus,
            processed_rows: sentCount + failedCount,
            sent_rows: sentCount,
            failed_rows: failedCount,
            completed_at: new Date().toISOString()
        })
        .eq('id', batch.id);

    logger.info(`[BATCH] Batch ${batch.batch_number} finished as ${finalBatchStatus} (sent: ${sentCount}, failed: ${failedCount})`);
}

/**
 * Stop an active job immediately and permanently
 */
async function stopJob(jobId, userId) {
    logger.info(`[JOB] Stop requested for job ${jobId} by user ${userId}`);

    // 1. Verify job exists and belongs to user
    const { data: job, error: jobError } = await supabase
        .from('send_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', userId)
        .single();

    if (jobError || !job) {
        logger.error(`[JOB] Job ${jobId} not found or unauthorized for stop`);
        return { success: false, status: 404, message: 'Job not found' };
    }

    // If job is already in terminal state
    if (['COMPLETED', 'FAILED', 'STOPPED'].includes(job.status)) {
        logger.info(`[JOB] Job ${jobId} is already in terminal state: ${job.status}`);
        return { success: true, message: `Job is already ${job.status.toLowerCase()}`, job };
    }

    // 2. Mark in-memory active job as stopped immediately (stops row sending & aborts wait/in-flight)
    const jobControl = activeJobs.get(jobId);
    if (jobControl) {
        jobControl.stopped = true;

        // Abort current in-flight fetch if present
        if (jobControl.currentAbortController) {
            try {
                jobControl.currentAbortController.abort();
                logger.info(`[JOB] Aborted in-flight AskEVA request for job ${jobId}`);
            } catch (e) {
                logger.warn(`[JOB] Error aborting fetch: ${e.message}`);
            }
        }

        // Interrupt 60-second cooldown wait immediately
        if (jobControl.wakeCooldown) {
            jobControl.wakeCooldown();
            logger.info(`[JOB] Interrupted batch cooldown timer for job ${jobId}`);
        }
    }

    // 3. Atomically update job status to STOPPED in the database
    const nowIso = new Date().toISOString();
    const { data: updatedJob, error: updateError } = await supabase
        .from('send_jobs')
        .update({
            status: 'STOPPED',
            completed_at: nowIso
        })
        .eq('id', jobId)
        .select()
        .single();

    if (updateError) {
        logger.error(`[JOB] Failed to update job status to STOPPED: ${updateError.message}`);
        return { success: false, status: 500, message: 'Failed to update job status' };
    }

    // 4. Update any active or waiting batches to STOPPED and clear next_batch_at countdown
    await supabase
        .from('send_batches')
        .update({
            status: 'STOPPED',
            completed_at: nowIso,
            next_batch_at: null
        })
        .eq('job_id', jobId)
        .in('status', ['PROCESSING', 'PENDING', 'WAITING']);

    logger.info(`[JOB] Job ${jobId} successfully marked as STOPPED`);
    return { success: true, message: 'Automation stopped successfully', job: updatedJob };
}

/**
 * Mark a job as failed
 */
async function markJobFailed(jobId, message) {
    await supabase
        .from('send_jobs')
        .update({
            status: 'FAILED',
            completed_at: new Date().toISOString()
        })
        .eq('id', jobId);

    logger.error(`[JOB] Job ${jobId} FAILED: ${message}`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function interruptibleSleep(ms, jobControl) {
    return new Promise(resolve => {
        if (jobControl && jobControl.stopped) return resolve(true);

        let timer = null;
        const wake = () => {
            if (timer) clearTimeout(timer);
            if (jobControl) jobControl.wakeCooldown = null;
            resolve(true); // woke early due to stop
        };

        if (jobControl) {
            jobControl.wakeCooldown = wake;
        }

        timer = setTimeout(() => {
            if (jobControl) jobControl.wakeCooldown = null;
            resolve(false); // full timer elapsed
        }, ms);
    });
}

/**
 * Check if a job is currently active in this process
 */
function isJobActive(jobId) {
    return activeJobs.has(jobId);
}

module.exports = {
    createJob,
    startJobProcessing,
    isJobActive,
    stopJob
};
