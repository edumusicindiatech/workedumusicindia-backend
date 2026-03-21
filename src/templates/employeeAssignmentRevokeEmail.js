const getEmployeeAssignmentRevokedTemplate = (userName, schoolName, schoolAddress, category) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #dc2626; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .address { color: #52525b; font-size: 14px; margin-top: 2px; display: block; font-weight: 400;}
    .notice { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e4e4e7; color: #18181b; font-weight: 500; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value, .notice, strong { color: #f4f4f5 !important; }
        p, .label, .address { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #ef4444 !important; }
        .badge { background: rgba(220, 38, 38, 0.1) !important; color: #f87171 !important; border-color: rgba(220, 38, 38, 0.2) !important; }
        .notice { border-top-color: #27272a !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container"><div class="badge">Assignment Revoked</div>
    <h2>Hello ${userName},</h2><p>Please be advised that your following assignment has been revoked.</p>
    <div class="card">
        <div class="card-item"><span class="label">School Name</span><div class="value">${schoolName}</div></div>
        <div class="card-item"><span class="label">Physical Address</span><div class="value" style="font-weight: 400; font-size: 14px;">📍 ${schoolAddress}</div></div>
        <div class="card-item"><span class="label">Category</span><div class="value">${category}</div></div>
        <div class="notice">You are no longer required to report to this location. If you believe this is an error, please contact your administrator.</div>
    </div>
    </div></body></html>
`;

module.exports =  getEmployeeAssignmentRevokedTemplate ;