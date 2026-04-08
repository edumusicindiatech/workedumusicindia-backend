const getAdminMissingReportTemplate = (adminName, employeeName, schoolName, band, location, scheduledTime) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #ea580c; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .address { color: #52525b; font-size: 14px; margin-top: 2px; display: block; font-weight: 400;}
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label, .address { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #ea580c !important; }
        .badge { background: rgba(234, 88, 12, 0.1) !important; color: #fb923c !important; border-color: rgba(234, 88, 12, 0.2) !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container"><div class="badge">Compliance Alert</div>
    <h2>Daily Report Overdue</h2><p>Hello ${adminName},</p><p>An employee has missed the 8:00 PM deadline to submit their End of Day report for a specific scheduled shift.</p>
    <div class="card">
        <div class="card-item"><span class="label">Employee</span><div class="value">${employeeName}</div></div>
        <div class="card-item"><span class="label">School & Category</span><div class="value">${schoolName} — ${band}</div></div>
        <div class="card-item"><span class="label">Location</span><div class="address">📍 ${location}</div></div>
        <div class="card-item"><span class="label">Scheduled Time</span><div class="value">${scheduledTime}</div></div>
    </div>
    <p>An automated reminder has been sent to the employee. Please review this compliance miss in the Admin Dashboard.</p>
    </div></body></html>
`;

module.exports = getAdminMissingReportTemplate;