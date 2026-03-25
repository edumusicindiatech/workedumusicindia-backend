const cron = require('node-cron');

const startKeepAliveCron = () => {
    // Run every 14 minutes to beat Render's 15-minute sleep timer
    cron.schedule('*/14 * * * *', () => {
        // Render automatically provides the RENDER_EXTERNAL_URL environment variable!
        // We fallback to localhost just in case you are running this locally.
        const backendUrl = process.env.RENDER_EXTERNAL_URL || 'http://localhost:5000';

        console.log(`[Cron tick] Keep-Alive Ping -> ${backendUrl}`);

        // Dynamically choose http or https based on the URL
        const protocol = backendUrl.startsWith('https') ? require('https') : require('http');

        protocol.get(`${backendUrl}/health`, (resp) => {
            if (resp.statusCode === 200) {
                console.log(' -> Server is awake 🟢');
            } else {
                console.error(` -> Ping failed with status: ${resp.statusCode} 🔴`);
            }
        }).on('error', (err) => {
            console.error(' -> Keep-alive ping error:', err.message);
        });
    });

    console.log("⏰ Keep-Alive Cron Job initialized.");
};

module.exports = startKeepAliveCron; 