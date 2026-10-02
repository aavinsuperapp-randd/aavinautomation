const getTimestamp = () => {
    const now = new Date();
    // Return format: 2026-10-02 11:30:12
    return now.toISOString().replace('T', ' ').substring(0, 19);
};

const logger = {
    info: (msg, ...args) => {
        console.log(`[${getTimestamp()}] [INFO] ${msg}`, ...args);
    },
    warn: (msg, ...args) => {
        console.warn(`[${getTimestamp()}] [WARN] ${msg}`, ...args);
    },
    error: (msg, ...args) => {
        console.error(`[${getTimestamp()}] [ERROR] ${msg}`, ...args);
    },
    debug: (msg, ...args) => {
        console.debug(`[${getTimestamp()}] [DEBUG] ${msg}`, ...args);
    }
};

module.exports = logger;
