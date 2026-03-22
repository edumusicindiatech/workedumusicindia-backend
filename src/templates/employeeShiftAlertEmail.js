const getEmployeeShiftAlertTemplate = (name, schoolName, category, startTime) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #f59e0b; margin-bottom: 24px; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .time-value { color: #d97706; font-weight: 700; font-size: 18px; display: flex; align-items: center; gap: 6px; }
    .footer-text { font-size: 13px; color: #a1a1aa; margin-bottom: 0; margin-top: 32px; border-top: 1px solid #e4e4e7; padding-top: 24px; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #fbbf24 !important; }
        .badge { background: rgba(245, 158, 11, 0.1) !important; color: #fbbf24 !important; border-color: rgba(245, 158, 11, 0.2) !important; }
        .time-value { color: #fbbf24 !important; }
        .footer-text { border-top-color: #27272a !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container"><div class="badge">Action Required</div>
    <h2>Upcoming Shift Reminder</h2><p>Hello ${name},</p><p>This is an automated reminder that your scheduled shift is starting in <strong>15 minutes</strong>. Please ensure you open your app and check in upon arrival to avoid being marked as late.</p>
    <div class="card">
        <div class="card-item"><span class="label">School Name</span><div class="value">${schoolName}</div></div>
        <div class="card-item"><span class="label">Category</span><div class="value">${category}</div></div>
        <div class="card-item"><span class="label">Expected Start Time</span><div class="value time-value">🕒 ${startTime}</div></div>
    </div>
    <p class="footer-text">If you are experiencing an emergency or cannot make it to your assigned location, please contact administration immediately.</p>
    </div></body></html>
`;

module.exports = getEmployeeShiftAlertTemplate;