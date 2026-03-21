const getEmployeeProfileDeletedTemplate = (userName) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #dc2626; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2 { color: #f4f4f5 !important; }
        p { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; }
        .badge { background: rgba(220, 38, 38, 0.1) !important; color: #f87171 !important; border-color: rgba(220, 38, 38, 0.2) !important; }
    }
    </style></head><body>
    <div class="container"><div class="badge">Account Terminated</div>
    <h2>Hello ${userName},</h2>
    <p>This email is to formally notify you that your WorkForce Pro account has been permanently deleted by an administrator.</p>
    <div class="card">
        <p style="margin:0; font-weight:500;">You will no longer have access to the dashboard, your schedule, or historical attendance records. If you believe this was done in error, please contact your administrative office immediately.</p>
    </div>
    <p style="font-size: 13px; color: #a1a1aa; text-align: center; margin-top: 30px;">This is an automated system security notification.</p>
    </div></body></html>
`;

module.exports = getEmployeeProfileDeletedTemplate;