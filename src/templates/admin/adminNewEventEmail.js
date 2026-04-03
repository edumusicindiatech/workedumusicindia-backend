const getAdminNewEventTemplate = (adminName, employeeName, schoolName, category, startDate, endDate, timeFrom, timeTo, description) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #3b82f6; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .split-flex { display: table; width: 100%; }
    .split-col { display: table-cell; width: 50%; vertical-align: top; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #3b82f6 !important; }
        .badge { background: rgba(37, 99, 235, 0.1) !important; color: #60a5fa !important; border-color: rgba(37, 99, 235, 0.2) !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } .split-flex, .split-col { display: block; width: 100%; } .split-col:first-child { margin-bottom: 16px; } }
    </style></head><body>
    <div class="container"><div class="badge">New Event Logged</div>
    <h2>Upcoming Event Scheduled</h2><p>Hello ${adminName},</p><p><strong>${employeeName}</strong> has logged a new upcoming event for their assigned school.</p>
    <div class="card">
        <div class="card-item"><span class="label">Location & Category</span><div class="value">${schoolName} (${category})</div></div>
        <div class="card-item split-flex">
            <div class="split-col"><span class="label">Date</span><div class="value">${startDate} ${startDate !== endDate ? `to ${endDate}` : ''}</div></div>
            <div class="split-col"><span class="label">Time</span><div class="value">${timeFrom} - ${timeTo}</div></div>
        </div>
        <div class="card-item"><span class="label">Event Description</span><div class="value" style="font-weight: 400; font-size: 15px; white-space: pre-wrap;">${description}</div></div>
    </div>
    </div></body></html>
`;
module.exports = getAdminNewEventTemplate;