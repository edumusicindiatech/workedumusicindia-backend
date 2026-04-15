const { S3Client } = require('@aws-sdk/client-s3');
require('dotenv').config();

// We initialize a completely isolated client for the chat module
const chatS3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.CHAT_MEDIA_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.CHAT_MEDIA_ACCESS_KEY, // You can reuse your existing keys
        secretAccessKey: process.env.CHAT_MEDIA_SECRET_KEY,
    },
});

module.exports = chatS3Client;