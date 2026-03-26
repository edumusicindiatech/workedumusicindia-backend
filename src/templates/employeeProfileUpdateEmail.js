const getEmployeeProfileUpdatedTemplate = (userName) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .warning-box { background-color: #fffbeb; padding: 20px; border-radius: 8px; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; }
    .warning-text { color: #92400e; font-size: 14px; font-weight: 500; margin: 0; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2 { color: #f4f4f5 !important; }
        p { color: #a1a1aa !important; }
        .warning-box { background-color: #1c1917 !important; border-color: #44403c !important; }
        .warning-text { color: #fcd34d !important; }
        .badge { background: rgba(37, 99, 235, 0.1) !important; color: #60a5fa !important; border-color: rgba(37, 99, 235, 0.2) !important; }
    }
    </style></head><body>
    <div class="container"><div class="badge">Security Notification</div>
    <h2>Hello ${userName},</h2>
    <p>Please be advised that your WorkEduMusic account profile details were recently updated by an administrator.</p>
    <div class="warning-box">
        <p class="warning-text">⚠️ <strong>Notice:</strong> If you did not request or authorize these changes, please contact your supervisor or the IT security team immediately.</p>
    </div>
    <p style="margin-top: 24px;">You can review your updated details by logging into your dashboard.</p>
    <p style="font-size: 13px; color: #a1a1aa; text-align: center; margin-top: 30px; border-top: 1px solid #e4e4e7; padding-top: 20px;">Automated system security message from WorkEduMusic Pro.</p>
    </div></body></html>
`;

module.exports = getEmployeeProfileUpdatedTemplate;