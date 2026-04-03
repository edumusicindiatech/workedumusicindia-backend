const getAdminSchoolAssignmentAlertTemplate = (adminName, employeeName, schoolName, schoolAddress, category, startDate) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #8b5cf6; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .address { color: #52525b; font-size: 14px; margin-top: 6px; display: block; font-weight: 400;}
    .footer { margin-top: 30px; font-size: 13px; color: #a1a1aa; text-align: center; border-top: 1px solid #e4e4e7; padding-top: 20px; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label, .address { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #a78bfa !important; }
        .badge { background: rgba(37, 99, 235, 0.1) !important; color: #60a5fa !important; border-color: rgba(37, 99, 235, 0.2) !important; }
        .footer { border-color: #27272a !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container"><div class="badge">System Activity Log</div>
    <h2>Staff Assignment Update</h2><p>Hello ${adminName},</p><p>A new school assignment has been successfully processed in the system.</p>
    <div class="card">
        <div class="card-item">
            <span class="label">Assigned Employee</span>
            <div class="value">${employeeName}</div>
        </div>

        <div class="card-item">
            <span class="label">School Name</span>
            <div class="value">${schoolName}</div>
        </div>

        <div class="card-item">
            <span class="label">Physical Address</span>
            <div class="address">📍 ${schoolAddress}</div>
        </div>

        <div class="card-item">
            <span class="label">Details</span>
            <div class="value">${category} &bull; Starting ${startDate}</div>
        </div>
    </div>
    <div class="footer">WorkEduMusic Admin Alerts</div>
    </div></body></html>
`;

module.exports =  getAdminSchoolAssignmentAlertTemplate ;