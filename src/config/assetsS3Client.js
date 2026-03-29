// At the top of your employeeRouter where you handle the profile picture:
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Initialize the NEW client for the assets bucket
const assetsS3Client = new S3Client({
    region: "auto",
    endpoint: process.env.CF_ASSETS_ENDPOINT, // e.g. https://<ACCOUNT_ID>.r2.cloudflarestorage.com
    credentials: {
        accessKeyId: process.env.CF_ASSETS_ACCESS_KEY,
        secretAccessKey: process.env.CF_ASSETS_SECRET_KEY,
    },
});

module.exports = assetsS3Client