// sharedTemplates.js or emailTemplates.js

const getSOSEmergencyTemplate = (recipientName, senderName, lat, lng) => {
    // Generate a quick Google Maps link so they can click and see exactly where the employee is
    const mapLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    const timestamp = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

    return `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
        body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #fecaca; border-top: 8px solid #dc2626; box-shadow: 0 4px 6px rgba(220, 38, 38, 0.1); }
        .badge { display: inline-block; padding: 8px 16px; border-radius: 6px; font-weight: 800; font-size: 14px; letter-spacing: 1px; margin-bottom: 24px; text-transform: uppercase; background: #dc2626; color: #ffffff; animation: pulse 2s infinite; }
        h2 { color: #18181b; font-size: 24px; margin-top: 0; margin-bottom: 16px; }
        p { color: #52525b; font-size: 16px; line-height: 1.6; margin-bottom: 24px; }
        .alert-box { background-color: #fef2f2; padding: 24px; border-radius: 8px; border: 1px solid #fca5a5; margin-bottom: 24px; }
        .detail-row { margin-bottom: 12px; }
        .detail-row:last-child { margin-bottom: 0; }
        .label { color: #991b1b; font-size: 12px; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 4px;}
        .value { font-weight: 600; color: #7f1d1d; font-size: 16px; display: block; }
        .btn { display: inline-block; background-color: #dc2626; color: white !important; padding: 14px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; text-align: center; width: 100%; box-sizing: border-box; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #09090b !important; }
            .container { background-color: #18181b !important; border-color: #7f1d1d !important; border-top-color: #ef4444 !important;}
            h2 { color: #f4f4f5 !important; }
            p { color: #a1a1aa !important; }
            .alert-box { background-color: rgba(220, 38, 38, 0.1) !important; border-color: rgba(220, 38, 38, 0.3) !important; }
            .label { color: #fca5a5 !important; }
            .value { color: #fee2e2 !important; }
        }
    </style></head><body>
        <div class="container">
            <div class="badge">🚨 EMERGENCY SOS TRIGGERED</div>
            <h2>Hello ${recipientName},</h2>
            <p><strong>${senderName}</strong> has triggered an Emergency SOS alert from their WorkEduMusic dashboard at <strong>${timestamp}</strong>.</p>
            
            <div class="alert-box">
                <div class="detail-row">
                    <span class="label">Employee in Distress</span>
                    <span class="value">${senderName}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Last Known Coordinates</span>
                    <span class="value">${lat}, ${lng}</span>
                </div>
            </div>

            <a href="${mapLink}" class="btn">📍 View Live Location on Maps</a>
            
            <p style="font-size: 13px; color: #a1a1aa; text-align: center; margin-top: 30px; padding-top: 20px;">This is a priority system override message. It has bypassed standard notification preferences due to the nature of the emergency.</p>
        </div>
    </body></html>
    `;
};

module.exports = getSOSEmergencyTemplate;