const admin = require('firebase-admin');

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    // Production (Render): Parse the JSON string from the environment variable
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    // Local Development: Require the physical file
    serviceAccount = require('../../firebase-service-account.json');
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

module.exports = admin;