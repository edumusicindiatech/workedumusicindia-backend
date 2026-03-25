const getEmployeeAutoAbsentEmail = (employeeName, schoolName, category, scheduledTime) => {
    return `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
        body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
        h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
        p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #dc2626; }
        .card-item { margin-bottom: 16px; }
        .card-item:last-child { margin-bottom: 0; }
        .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; }
        .value { font-weight: 600; color: #18181b; font-size: 15px; display: block; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #09090b !important; }
            .container { background-color: #18181b !important; border-color: #27272a !important; }
            h2, .value { color: #f4f4f5 !important; }
            p, .label { color: #a1a1aa !important; }
            .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #dc2626 !important; }
            .badge { background: transparent !important; }
        }
        </style></head><body>
        <div class="container"><div class="badge">System Alert</div>
        <h2>Automatically Marked Absent</h2>
        <p>Hello ${employeeName},</p>
        <p>Because you did not check in within 2 hours of your scheduled start time, our system has automatically recorded an absence for this shift. Administration has been notified.</p>
        <div class="card">
            <div class="card-item"><span class="label">Location</span><div class="value">${schoolName}</div></div>
            <div class="card-item"><span class="label">Category</span><div class="value">${category}</div></div>
            <div class="card-item"><span class="label">Scheduled Start</span><div class="value">${scheduledTime}</div></div>
            <div class="card-item"><span class="label">Status</span><div class="value" style="color: #dc2626;">Absent (Auto-Marked)</div></div>
        </div>
        <p style="margin-top: 24px;">If this is a mistake or you are currently on-site but facing technical difficulties, please reach out to your administrator immediately to override this status.</p>
        </div></body></html>
    `;
};
module.exports = getEmployeeAutoAbsentEmail;