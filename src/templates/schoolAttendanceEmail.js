// src/templates/schoolAttendanceEmail.js

/**
 * Generates the HTML template for School Check-In/Check-Out Notifications.
 * @param {string} employeeName - The name of the teacher
 * @param {string} schoolName - The name of the school
 * @param {string} action - "Check-In" or "Check-Out"
 * @param {string} formattedTime - The localized timestamp
 * @param {string} remark - Details about lateness or duration
 * @param {string} highlightLevel - 'success' (normal), 'danger' (late), 'warning' (> 30 mins)
 * @returns {string} - The complete HTML string
 */
const getSchoolAttendanceTemplate = (employeeName, schoolName, action, formattedTime, remark, highlightLevel) => {
    // Determine colors based on highlight level
    let badgeBg, badgeColor, remarkBg, remarkColor, remarkBorder;

    if (highlightLevel === 'danger') {
        badgeBg = "#fef2f2"; badgeColor = "#ef4444"; // Red
        remarkBg = "#fef2f2"; remarkColor = "#b91c1c"; remarkBorder = "#fca5a5";
    } else if (highlightLevel === 'warning') {
        badgeBg = "#fffbeb"; badgeColor = "#f59e0b"; // Yellow/Orange
        remarkBg = "#fffbeb"; remarkColor = "#b45309"; remarkBorder = "#fcd34d";
    } else {
        badgeBg = "#ecfdf5"; badgeColor = "#10b981"; // Green
        remarkBg = "#f0fdf4"; remarkColor = "#166534"; remarkBorder = "#bbf7d0";
    }

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
                .header { color: #333333; font-size: 20px; margin-bottom: 20px; border-bottom: 2px solid #eeeeee; padding-bottom: 10px;}
                .status-badge { display: inline-block; padding: 8px 16px; border-radius: 6px; font-weight: bold; background-color: ${badgeBg}; color: ${badgeColor}; margin-bottom: 20px; font-size: 16px;}
                .details-box { background-color: #f8fafc; padding: 20px; border-radius: 6px; border: 1px solid #e2e8f0; }
                .detail-row { margin: 0 0 12px 0; font-size: 14px; color: #475569; }
                .detail-label { font-weight: 600; color: #1e293b; width: 100px; display: inline-block; }
                .remark-box { margin-top: 15px; padding: 12px; border-radius: 6px; background-color: ${remarkBg}; color: ${remarkColor}; border: 1px solid ${remarkBorder}; font-size: 14px; font-weight: 500; }
                .footer { margin-top: 30px; font-size: 12px; color: #94a3b8; border-top: 1px solid #eeeeee; padding-top: 15px; text-align: center; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">School Visit Alert</div>
                
                <div class="status-badge">
                    ${action}
                </div>
                
                <div class="details-box">
                    <p class="detail-row">
                        <span class="detail-label">Employee:</span> ${employeeName}
                    </p>
                    <p class="detail-row">
                        <span class="detail-label">School:</span> ${schoolName}
                    </p>
                    <p class="detail-row" style="margin-bottom: 0;">
                        <span class="detail-label">Time:</span> ${formattedTime}
                    </p>
                </div>

                ${remark ? `<div class="remark-box">${remark}</div>` : ''}
                
                <div class="footer">
                    This is an automated system alert from WorkForce Pro.
                </div>
            </div>
        </body>
        </html>
    `;
};

module.exports = {
    getSchoolAttendanceTemplate
};