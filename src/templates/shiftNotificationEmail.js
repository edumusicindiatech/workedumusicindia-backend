// src/templates/shiftNotificationEmail.js

/**
 * Generates the HTML template for Admin Shift Notifications.
 * @param {string} employeeName - The name of the employee
 * @param {string} employeeId - The Employee ID
 * @param {string} action - "Logged In" or "Logged Out"
 * @param {string} territory - The assigned territory/zone
 * @param {string} formattedTime - The localized timestamp
 * @returns {string} - The complete HTML string
 */
const getShiftNotificationTemplate = (employeeName, employeeId, action, territory, formattedTime) => {
    // Determine colors based on action
    const actionColor = action === "Logged In" ? "#10b981" : "#ef4444"; // Green for In, Red for Out
    const actionBg = action === "Logged In" ? "#ecfdf5" : "#fef2f2";

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
                .header { color: #333333; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #eeeeee; padding-bottom: 10px;}
                .status-badge { display: inline-block; padding: 8px 16px; border-radius: 6px; font-weight: bold; background-color: ${actionBg}; color: ${actionColor}; margin-bottom: 20px; font-size: 16px;}
                .details-box { background-color: #f8fafc; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; }
                .detail-row { margin: 0 0 12px 0; font-size: 14px; color: #475569; }
                .detail-label { font-weight: 600; color: #1e293b; width: 100px; display: inline-block; }
                .footer { margin-top: 30px; font-size: 12px; color: #94a3b8; border-top: 1px solid #eeeeee; padding-top: 15px; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">Live Attendance Alert</div>
                
                <div class="status-badge">
                    ${action}
                </div>
                
                <div class="details-box">
                    <p class="detail-row">
                        <span class="detail-label">Employee:</span> ${employeeName}
                    </p>
                    <p class="detail-row">
                        <span class="detail-label">ID:</span> ${employeeId}
                    </p>
                    <p class="detail-row">
                        <span class="detail-label">Time:</span> ${formattedTime}
                    </p>
                    <p class="detail-row" style="margin-bottom: 0;">
                        <span class="detail-label">Location:</span> ${territory}
                    </p>
                </div>
                
                <div class="footer">
                    This is an automated system alert from WorkForce Pro.
                </div>
            </div>
        </body>
        </html>
    `;
};

module.exports = {
    getShiftNotificationTemplate
};