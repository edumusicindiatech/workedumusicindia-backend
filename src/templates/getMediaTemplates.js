// 🔥 TEMPLATE 1: Video Graded (Updated for 1-10 Scale)
const getVideoGradedTemplate = (employeeName, schoolName, band, marks, remark) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 12px; border: 1px solid #e4e4e7; border-left: 4px solid #10b981; }
    .score-label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;}
    .score { font-size: 36px; font-weight: 900; color: #18181b; margin-top: 8px; margin-bottom: 16px;}
    .quote { font-style: italic; color: #3f3f46; background: #f4f4f5; padding: 16px; border-radius: 8px; margin-top: 16px;}
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .score { color: #f4f4f5 !important; }
        p { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #10b981 !important; }
        .badge { background: rgba(5, 150, 105, 0.1) !important; color: #34d399 !important; border-color: rgba(5, 150, 105, 0.2) !important; }
        .quote { background: #18181b !important; color: #a1a1aa !important; border: 1px solid #27272a !important; }
    }
    </style></head><body>
    <div class="container"><div class="badge">Performance Evaluated</div>
    <h2>Hello ${employeeName},</h2><p>An administrator has reviewed and graded your recent video upload for <strong>${schoolName} (${band})</strong>.</p>
    <div class="card">
        <div class="score-label">Admin Score</div>
        <div class="score">${marks} <span style="font-size: 18px; color: #a1a1aa;">/ 10</span></div>
        ${remark ? `<div class="score-label" style="margin-top: 20px;">Administrator Feedback</div><div class="quote">"${remark}"</div>` : ''}
    </div>
    <p style="font-size: 13px; color: #a1a1aa; text-align: center; margin-top: 30px; border-top: 1px solid #e4e4e7; padding-top: 20px;">Automated system message from WorkEduMusic.</p>
    </div></body></html>
`;

// 🔥 TEMPLATE 2: Video Deleted 
const getVideoDeletedTemplate = (employeeName, schoolName, band) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .warning-box { background-color: #fffbeb; padding: 20px; border-radius: 8px; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; }
    .warning-text { color: #92400e; font-size: 14px; font-weight: 500; margin: 0; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2 { color: #f4f4f5 !important; }
        p { color: #a1a1aa !important; }
        .badge { background: rgba(220, 38, 38, 0.1) !important; color: #f87171 !important; border-color: rgba(220, 38, 38, 0.2) !important; }
        .warning-box { background-color: #1c1917 !important; border-color: #44403c !important; border-left-color: #f59e0b !important; }
        .warning-text { color: #fcd34d !important; }
    }
    </style></head><body>
    <div class="container"><div class="badge">Media Removed</div>
    <h2>Hello ${employeeName},</h2>
    <p>Please be advised that an administrator has permanently removed a video upload from your Vault for <strong>${schoolName} (${band})</strong>.</p>
    <div class="warning-box">
        <p class="warning-text">⚠️ <strong>Notice:</strong> This action cannot be undone. If you believe this was done in error, please contact your supervisor.</p>
    </div>
    <p style="font-size: 13px; color: #a1a1aa; text-align: center; margin-top: 30px; border-top: 1px solid #e4e4e7; padding-top: 20px;">Automated system message from WorkEduMusic.</p>
    </div></body></html>
`;

module.exports = { getVideoGradedTemplate, getVideoDeletedTemplate };