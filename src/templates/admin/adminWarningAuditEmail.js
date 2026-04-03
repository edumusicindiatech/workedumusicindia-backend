const getAdminWarningAuditTemplate = (adminName, employeeName, level, reason, issuerName) => {
    return `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
        body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fee2e2; color: #ef4444; border: 1px solid #fecaca; }
        h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
        p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #ef4444; }
        .card-item { margin-bottom: 16px; }
        .card-item:last-child { margin-bottom: 0; }
        .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; }
        .value { font-weight: 600; color: #18181b; font-size: 15px; display: block; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #09090b !important; }
            .container { background-color: #18181b !important; border-color: #27272a !important; }
            h2, .value { color: #f4f4f5 !important; }
            p, .label { color: #a1a1aa !important; }
            .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #ef4444 !important; }
            .badge { background: rgba(239, 68, 68, 0.1) !important; color: #f87171 !important; border-color: rgba(239, 68, 68, 0.2) !important; }
        }
        </style></head><body>
        <div class="container"><div class="badge">Audit Log: Disciplinary Action</div>
        <h2>Warning Issued</h2><p>Hello ${adminName},</p><p>A disciplinary warning has been issued to an employee.</p>
        <div class="card">
            <div class="card-item"><span class="label">Employee</span><div class="value">${employeeName}</div></div>
            <div class="card-item"><span class="label">Warning Level</span><div class="value">${level} Warning</div></div>
            <div class="card-item"><span class="label">Reason</span><div class="value" style="font-weight: 400;">${reason}</div></div>
            <div class="card-item"><span class="label">Issued By</span><div class="value">${issuerName}</div></div>
        </div>
        <p style="font-size: 12px; color: #a1a1aa; margin-top: 30px;">This is an automated system notification.</p>
        </div></body></html>
    `;
};
module.exports = getAdminWarningAuditTemplate;