const getEmployeeMissingReportTemplate = (employeeName, schoolName) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #e11d48; margin-bottom: 24px; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .btn-container { text-align: center; margin-top: 10px; }
    .btn { display: inline-block; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
    .footer { margin-top: 40px; font-size: 13px; color: #a1a1aa; text-align: center; border-top: 1px solid #e4e4e7; padding-top: 20px; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #e11d48 !important; }
        .badge { background: rgba(225, 29, 72, 0.1) !important; color: #fb7185 !important; border-color: rgba(225, 29, 72, 0.2) !important; }
        .footer { border-color: #27272a !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } .btn { display: block; width: 100%; box-sizing: border-box; } }
    </style></head><body>
    <div class="container"><div class="badge">Action Required</div>
    <h2>Daily Report Missing</h2><p>Hello ${employeeName},</p>
    <p>Our records indicate that you have a scheduled working day at <strong>${schoolName}</strong> today, but you have not yet submitted your End of Day report.</p>
    <div class="card">
        <div class="card-item"><span class="label">Status</span><div class="value" style="color: #e11d48;">Pending Submission</div></div>
        <div class="card-item"><span class="label">Deadline</span><div class="value">8:00 PM (Overdue)</div></div>
    </div>
    <p>Please log in to your dashboard and submit your Daily Report immediately to maintain compliance with the scheduling guidelines.</p>
    <div class="btn-container">
        <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/admin/reports" class="btn">Submit Report Now</a>
    </div>
    <div class="footer">This is an automated reminder from WorkEduMusic.</div>
    </div></body></html>
`;

module.exports = getEmployeeMissingReportTemplate;