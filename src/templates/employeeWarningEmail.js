const getEmployeeWarningTemplate = (employeeName, level, reason, issuerName) => {
    // Dynamic styling based on severity
    const isFinal = level === 'Final';
    const isWritten = level === 'Written';

    const themeColor = isFinal ? '#dc2626' : (isWritten ? '#ea580c' : '#d97706'); // Red, Orange, Amber
    const themeBg = isFinal ? '#fef2f2' : (isWritten ? '#fff7ed' : '#fffbeb');
    const themeBorder = isFinal ? '#fecaca' : (isWritten ? '#ffedd5' : '#fef3c7');

    return `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
        body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: ${themeBg}; color: ${themeColor}; border: 1px solid ${themeBorder}; }
        h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
        p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid ${themeColor}; }
        .card-item { margin-bottom: 16px; }
        .card-item:last-child { margin-bottom: 0; }
        .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; }
        .value { font-weight: 600; color: #18181b; font-size: 15px; display: block; white-space: pre-wrap; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #09090b !important; }
            .container { background-color: #18181b !important; border-color: #27272a !important; }
            h2, .value { color: #f4f4f5 !important; }
            p, .label { color: #a1a1aa !important; }
            .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: ${themeColor} !important; }
            .badge { background: transparent !important; }
        }
        </style></head><body>
        <div class="container"><div class="badge">Formal Notice</div>
        <h2>Official ${level} Warning</h2><p>Hello ${employeeName},</p><p>This email serves as official notification that a formal warning has been issued to your file.</p>
        <div class="card">
            <div class="card-item"><span class="label">Warning Level</span><div class="value" style="color: ${themeColor};">${level} Warning</div></div>
            <div class="card-item"><span class="label">Reason / Description</span><div class="value" style="font-weight: 400;">${reason}</div></div>
            <div class="card-item"><span class="label">Issued By</span><div class="value">${issuerName}</div></div>
        </div>
        <p style="margin-top: 24px;">If you have questions regarding this notice, please contact administration.</p>
        <p style="font-size: 12px; color: #a1a1aa; margin-top: 30px;">This is an automated system record.</p>
        </div></body></html>
    `;
};
module.exports = getEmployeeWarningTemplate;