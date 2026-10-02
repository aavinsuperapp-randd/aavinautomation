const supabase = require('../config/supabase');
const logger = require('../utils/logger');

exports.executeSend = async (req, res) => {
    const { automationId, rows } = req.body;
    const userId = req.user.id;

    logger.info(`========================================`);
    logger.info(` ASKEVA SEND STARTED`);
    logger.info(`========================================`);
    logger.info(`Automation ID: ${automationId}`);
    logger.info(`Total valid rows to process: ${rows ? rows.length : 0}`);

    if (!automationId || !rows || !Array.isArray(rows)) {
        logger.error(`[ERROR] Invalid request payload`);
        return res.status(400).json({ success: false, message: 'Invalid request payload' });
    }

    const ASKEVA_TOKEN = process.env.ASKEVA_TOKEN;
    if (!ASKEVA_TOKEN) {
        logger.error(`[ASKEVA] ERROR: ASKEVA_TOKEN is not configured`);
        return res.status(500).json({ success: false, message: 'AskEVA is not configured on the server. Please check the backend environment configuration.' });
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
        
        logger.info(`[AUTOMATION] Automation found`);
        logger.info(`[AUTOMATION] Parsing saved cURL`);

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
            if (templateJson.template && templateJson.template.name) {
                logger.info(`[AUTOMATION] Template: ${templateJson.template.name}`);
            }
        } catch (e) {
            logger.error(`[ERROR] cURL parsing failed. Could not parse JSON.`);
            return res.status(400).json({ success: false, message: 'Could not parse automation JSON' });
        }

        // 3. Prepare for streaming NDJSON response
        res.setHeader('Content-Type', 'application/x-ndjson');
        res.setHeader('Transfer-Encoding', 'chunked');
        
        let successCount = 0;
        let failCount = 0;
        const failedRows = [];

        // Exact Request URL construction
        const ASKEVA_URL = `https://backend.askeva.io/v1/message/send-message?token=${encodeURIComponent(ASKEVA_TOKEN)}`;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            
            logger.info(`[DEBUG] Row ${i+1} keys: ${Object.keys(row).join(', ')}`);
            if (row.whatsappNumber) logger.info(`[DEBUG] Row ${i+1} whatsappNumber: ${row.whatsappNumber}`);
            if (row.variables) logger.info(`[DEBUG] Row ${i+1} variable count: ${Object.keys(row.variables).length}`);

            logger.info(`[ASK-EVA] Processing row ${i+1}/${rows.length}`);
            
            if (!row.whatsappNumber || typeof row.whatsappNumber !== 'string') {
                logger.error(`[VALIDATION] Row ${i+1} failed`);
                logger.error(`[VALIDATION] WhatsApp number is missing`);
                failCount++;
                failedRows.push({
                    sno: row.sno || (i+1),
                    whatsappNumber: 'Missing',
                    error: 'WhatsApp number is missing'
                });
                res.write(JSON.stringify({ type: 'progress', processed: i + 1, total: rows.length, successCount, failCount }) + '\n');
                continue;
            }

            logger.info(`[ASK-EVA] Recipient: ${row.whatsappNumber}`);

            try {
                // Clone template
                const reqBody = JSON.parse(JSON.stringify(templateJson));
                
                // Replace "to"
                reqBody.to = row.whatsappNumber;

                // Replace parameters mapping
                if (reqBody.template && reqBody.template.components) {
                    const bodyComponent = reqBody.template.components.find(c => c.type === 'body');
                    if (bodyComponent && bodyComponent.parameters) {
                        let varCount = 1;
                        bodyComponent.parameters.forEach(param => {
                            if (param.type === 'text') {
                                param.text = row.variables[String(varCount)] || '';
                                varCount++;
                            }
                        });
                    }
                }

                logger.info(`[ASK-EVA] Final request prepared`);
                logger.info(`[ASK-EVA] Recipient: ${reqBody.to}`);
                
                if (reqBody.template && reqBody.template.name) {
                    logger.info(`[ASK-EVA] Template: ${reqBody.template.name}`);
                }
                
                let paramCount = 0;
                if (reqBody.template && reqBody.template.components) {
                    const bc = reqBody.template.components.find(c => c.type === 'body');
                    if (bc && bc.parameters) paramCount = bc.parameters.length;
                }
                logger.info(`[ASK-EVA] Parameters: ${paramCount}`);
                
                logger.info(`[ASK-EVA] Sending POST request...`);

                // Create abort controller for timeout
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

                let apiRes;
                try {
                    apiRes = await fetch(ASKEVA_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(reqBody),
                        signal: controller.signal
                    });
                } catch (fetchErr) {
                    if (fetchErr.name === 'AbortError') {
                        throw new Error('Network timeout');
                    }
                    throw fetchErr;
                } finally {
                    clearTimeout(timeoutId);
                }

                logger.info(`[ASK-EVA] Response status: ${apiRes.status}`);
                const responseText = await apiRes.text();
                
                // Log safe response body substring
                logger.info(`[ASK-EVA] Response: ${responseText.substring(0, 100).replace(/\n|\r/g, '')}`);

                if (apiRes.ok) {
                    successCount++;
                    logger.info(`[ASK-EVA] Row ${i+1} SUCCESS`);
                } else {
                    failCount++;
                    logger.error(`[ASK-EVA] Row ${i+1} FAILED`);
                    logger.error(`[ASK-EVA] Error: HTTP ${apiRes.status}`);
                    
                    failedRows.push({
                        sno: row.sno || (i+1),
                        whatsappNumber: row.whatsappNumber,
                        error: `HTTP ${apiRes.status}: ${responseText.substring(0, 50)}`
                    });
                    
                    // Authentication error check - STOP IMMEDIATELY
                    if (apiRes.status === 401 || apiRes.status === 403) {
                        logger.error(`[ASK-EVA] Authentication failed`);
                        logger.error(`[ASK-EVA] Check ASKEVA_TOKEN in backend environment`);
                        res.write(JSON.stringify({ 
                            type: 'error', 
                            message: 'AskEVA authentication failed. Please check the backend AskEVA token.' 
                        }) + '\n');
                        res.end();
                        return; // Stop the loop and end response
                    }
                }
            } catch (err) {
                failCount++;
                logger.error(`[ASK-EVA] Row ${i+1} FAILED`);
                logger.error(`[ERROR] ${err.message}`);
                failedRows.push({
                    sno: row.sno || (i+1),
                    whatsappNumber: row.whatsappNumber,
                    error: err.message
                });
            }

            // Report progress to frontend
            res.write(JSON.stringify({
                type: 'progress',
                processed: i + 1,
                total: rows.length,
                successCount,
                failCount
            }) + '\n');

            // Slight sleep for rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        logger.info(`========================================`);
        logger.info(` ASKEVA SEND COMPLETED`);
        logger.info(`========================================`);
        logger.info(`Total: ${rows.length}`);
        logger.info(`Successful: ${successCount}`);
        logger.info(`Failed: ${failCount}`);

        // Final completion report
        res.write(JSON.stringify({
            type: 'complete',
            total: rows.length,
            successCount,
            failCount,
            failedRows
        }) + '\n');

        res.end();

    } catch (err) {
        logger.error(`[ERROR] Internal error: ${err.message}`);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: 'Internal server error' });
        } else {
            res.write(JSON.stringify({ type: 'error', message: 'Internal server error during processing' }) + '\n');
            res.end();
        }
    }
};
