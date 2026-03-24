const getAdminAttendanceOverrideAlertTemplate = (adminName, actionAdminName, employeeName, schoolName, date, newStatus, reason) => {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f5; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05); border: 1px solid #e4e4e7; border-top: 4px solid #3b82f6; }
            .header { padding: 20px 30px; border-bottom: 1px solid #e4e4e7; }
            .header h2 { margin: 0; color: #18181b; font-size: 18px; display: flex; align-items: center; gap: 8px; }
            .badge { background-color: #eff6ff; color: #2563eb; padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; border: 1px solid #bfdbfe; }
            .content { padding: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { padding: 12px; text-align: left; border-bottom: 1px solid #f4f4f5; }
            th { width: 35%; color: #71717a; font-size: 13px; text-transform: uppercase; font-weight: 600; background-color: #fafafa; }
            td { color: #27272a; font-size: 14px; font-weight: 500; }
            .reason { background-color: #fafafa; padding: 15px; border-radius: 6px; margin-top: 20px; font-size: 14px; color: #52525b; border: 1px dashed #d4d4d8; }
            .footer { background-color: #fafafa; padding: 15px 30px; text-align: center; font-size: 12px; color: #a1a1aa; border-top: 1px solid #e4e4e7; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h2><span class="badge">SYSTEM AUDIT</span> Manual Attendance Override</h2>
            </div>
            <div class="content">
                <p style="margin-top: 0;">Hello <strong>${adminName}</strong>,</p>
                <p>This is an automated audit log notification. An attendance record was manually modified by an administrator.</p>
                
                <table>
                    <tbody>
                        <tr>
                            <th>Action Taken By</th>
                            <td><strong>${actionAdminName}</strong></td>
                        </tr>
                        <tr>
                            <th>Employee</th>
                            <td>${employeeName}</td>
                        </tr>
                        <tr>
                            <th>Location</th>
                            <td>${schoolName}</td>
                        </tr>
                        <tr>
                            <th>Date Affected</th>
                            <td>${date || new Date().toISOString().split('T')[0]}</td>
                        </tr>
                        <tr>
                            <th>New Status Applied</th>
                            <td style="color: #2563eb; font-weight: 700;">${newStatus}</td>
                        </tr>
                    </tbody>
                </table>

                ${reason ? `
                <div class="reason">
                    <strong>Provided Reason / Note:</strong><br>
                    "${reason}"
                </div>
                ` : `
                <div class="reason">
                    <i>No reason provided by the administrator.</i>
                </div>
                `}
            </div>
            <div class="footer">
                WorkForce Pro Audit System • This is an automated security log.
            </div>
        </div>
    </body>
    </html>
    `;
};

module.exports = getAdminAttendanceOverrideAlertTemplate;