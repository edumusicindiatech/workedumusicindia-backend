/**
 * Generates the HTML template for a successfully submitted Daily Report (Sent to Admins).
 */
const getDailyReportSubmittedTemplate = (employeeName, date, category, summary, actionItems, location) => {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #111827; margin-bottom: 5px;">Daily Report Submitted</h2>
            <div style="display: inline-block; background: #ecfdf5; color: #10b981; padding: 5px 12px; border-radius: 15px; font-size: 14px; font-weight: bold; margin-bottom: 20px;">
                ${category}
            </div>
            
            <p style="margin: 0 0 10px 0;"><strong>Employee:</strong> ${employeeName}</p>
            <p style="margin: 0 0 10px 0;"><strong>Date:</strong> ${date}</p>
            <p style="margin: 0 0 20px 0;"><strong>Location:</strong> ${location || "Not provided"}</p>
            
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; margin-bottom: 15px;">
                <h3 style="margin-top: 0; color: #1e293b; font-size: 16px;">Daily Summary</h3>
                <p style="white-space: pre-wrap; color: #475569; font-size: 14px; margin: 0;">${summary}</p>
            </div>

            ${actionItems ? `
                <div style="background-color: #fffbeb; padding: 15px; border-radius: 6px; border: 1px solid #fcd34d;">
                    <h3 style="margin-top: 0; color: #92400e; font-size: 16px;">Action Items / Next Steps</h3>
                    <p style="white-space: pre-wrap; color: #b45309; font-size: 14px; margin: 0;">${actionItems}</p>
                </div>
            ` : ''}
            
            <div style="margin-top: 30px; font-size: 12px; color: #94a3b8; border-top: 1px solid #eeeeee; padding-top: 15px; text-align: center;">
                Automated Alert from WorkForce Pro.
            </div>
        </div>
    `;
};

/**
 * Generates the HTML template for the 8:00 PM Missing Report Warning (Sent to Employee & Admins).
 */
const getMissingReportTemplate = (employeeName, date) => {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fca5a5; border-radius: 8px; background-color: #fef2f2;">
            <h2 style="color: #b91c1c; margin-bottom: 15px; text-align: center;">🚨 Action Required: Missing Daily Report</h2>
            
            <p style="color: #111827; font-size: 16px;">Hello <strong>${employeeName}</strong>,</p>
            
            <p style="color: #475569; font-size: 15px; line-height: 1.5;">
                Our records indicate that you logged in for a shift today (<strong>${date}</strong>), but you have not yet submitted your End of Day Report.
            </p>
            
            <p style="color: #475569; font-size: 15px; line-height: 1.5;">
                Please open your WorkForce Pro dashboard and submit your report immediately so the administrative team can review your daily progress.
            </p>

            <div style="background-color: #ffffff; padding: 15px; border-radius: 6px; border: 1px solid #f87171; margin-top: 25px; text-align: center;">
                <p style="color: #b91c1c; font-weight: bold; margin: 0;">
                    Note: A copy of this alert has been sent to the administrative team.
                </p>
            </div>
            
            <div style="margin-top: 30px; font-size: 12px; color: #94a3b8; border-top: 1px solid #fecaca; padding-top: 15px; text-align: center;">
                Automated System Alert - WorkForce Pro.
            </div>
        </div>
    `;
};

module.exports = {
    getDailyReportSubmittedTemplate,
    getMissingReportTemplate
};