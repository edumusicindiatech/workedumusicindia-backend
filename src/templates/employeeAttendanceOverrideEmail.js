const getEmployeeAttendanceOverrideTemplate = (employeeName, adminName, date, schoolName, newStatus, reason) => {
    // Helper to color-code the status
    let statusColor = "#64748b"; // Default slate
    if (newStatus === "Checked In" || newStatus === "Checked Out") statusColor = "#10b981"; // Emerald
    if (newStatus === "Absent") statusColor = "#ef4444"; // Red
    if (newStatus === "Late") statusColor = "#f59e0b"; // Amber
    if (newStatus === "Event") statusColor = "#8b5cf6"; // Violet
    if (newStatus === "Revoked (Reset)") statusColor = "#0f172a"; // Dark slate

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f8fafc; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }
            .header { background-color: #f1f5f9; padding: 20px 30px; border-bottom: 1px solid #e2e8f0; }
            .header h2 { margin: 0; color: #0f172a; font-size: 20px; }
            .content { padding: 30px; }
            .details-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 20px; margin-top: 20px; }
            .detail-row { margin-bottom: 12px; }
            .detail-label { font-weight: 600; color: #64748b; font-size: 13px; text-transform: uppercase; display: block; margin-bottom: 4px; }
            .detail-value { font-size: 15px; color: #0f172a; font-weight: 500; }
            .status-badge { display: inline-block; padding: 4px 10px; border-radius: 4px; font-size: 14px; font-weight: bold; color: #ffffff; background-color: ${statusColor}; }
            .reason-box { background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 20px; border-radius: 0 4px 4px 0; }
            .footer { background-color: #f8fafc; padding: 20px 30px; text-align: center; font-size: 13px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2>Attendance Record Updated</h2>
            </div>
            <div class="content">
                <p>Hello <strong>${employeeName}</strong>,</p>
                <p>This is an automated notification to inform you that your attendance record for <strong>${schoolName}</strong> has been manually updated by the administrative team.</p>
                
                <div class="details-box">
                    <div class="detail-row">
                        <span class="detail-label">Date</span>
                        <span class="detail-value">${date || new Date().toISOString().split('T')[0]}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Location</span>
                        <span class="detail-value">${schoolName}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Updated Status</span>
                        <span class="status-badge">${newStatus}</span>
                    </div>
                    <div class="detail-row" style="margin-bottom: 0;">
                        <span class="detail-label">Updated By</span>
                        <span class="detail-value">Admin: ${adminName}</span>
                    </div>
                </div>

                ${reason ? `
                <div class="reason-box">
                    <strong>Admin Note:</strong><br>
                    <i>"${reason}"</i>
                </div>
                ` : ''}

                <p style="margin-top: 25px; font-size: 14px; color: #64748b;">If you believe this change was made in error, please contact your administrative supervisor.</p>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} WorkForce Pro. All rights reserved.
            </div>
        </div>
    </body>
    </html>
    `;
};

module.exports = getEmployeeAttendanceOverrideTemplate;