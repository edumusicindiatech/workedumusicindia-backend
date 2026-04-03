const getVideoGradedTemplate = (employeeName, schoolName, band, marks, remark) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .score-box { background-color: #f8fafc; padding: 20px; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; text-align: center; }
    .score-value { font-size: 32px; font-weight: 800; color: #0f172a; margin: 0; }
    .quote-box { border-left: 4px solid #3b82f6; padding-left: 16px; margin-top: 8px; font-style: italic; color: #475569; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2 { color: #f4f4f5 !important; }
        p { color: #a1a1aa !important; }
        .badge { background: rgba(5, 150, 105, 0.1) !important; color: #34d399 !important; border-color: rgba(5, 150, 105, 0.2) !important; }
        .score-box { background-color: #0f172a !important; border-color: #1e293b !important; }
        .score-value { color: #f8fafc !important; }
        .quote-box { border-color: #3b82f6 !important; color: #94a3b8 !important; }
    }
    </style></head><body>
    <div class="container"><div class="badge">Performance Graded</div>
    <h2>Hello ${employeeName},</h2>
    <p>An administrator has reviewed and graded your recent video upload for <strong>${schoolName} (${band})</strong>.</p>
    
    <div class="score-box">
        <p style="margin: 0; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; font-weight: bold;">Admin Score</p>
        <p class="score-value">${marks} <span style="font-size: 16px; color: #94a3b8;">/ 100</span></p>
    </div>

    ${remark ? `
    <p style="margin-bottom: 8px; font-weight: 600; color: #334155;">Administrator's Remark:</p>
    <div class="quote-box">"${remark}"</div>
    ` : ''}

    <p style="margin-top: 32px;">You can view the full details in your Media Gallery.</p>
    <p style="font-size: 13px; color: #a1a1aa; text-align: center; margin-top: 30px; border-top: 1px solid #e4e4e7; padding-top: 20px;">Automated system message from WorkEduMusic.</p>
    </div></body></html>
`;

module.exports = { getVideoGradedTemplate };