// 1. Employee Requests Leave (Sent to Admin)
const getLeaveRequestTemplate = (adminName, employeeName, fromDate, toDate, reason) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #f59e0b; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .reason-box { font-weight: 400; font-size: 14px; background: #f4f4f5; padding: 12px; border-radius: 6px; margin-top: 4px; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #f59e0b !important; }
        .badge { background: rgba(245, 158, 11, 0.1) !important; color: #fbbf24 !important; border-color: rgba(245, 158, 11, 0.2) !important; }
        .reason-box { background: #27272a !important; color: #d4d4d8 !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container"><div class="badge">Action Required</div>
    <h2>New Leave Request Submitted</h2><p>Hello ${adminName},</p><p>An employee has submitted a new leave request that requires your review.</p>
    <div class="card">
        <div class="card-item"><span class="label">Employee</span><div class="value">${employeeName}</div></div>
        <div class="card-item"><span class="label">Duration</span><div class="value">📅 ${fromDate} to ${toDate}</div></div>
        <div class="card-item"><span class="label">Reason</span><div class="value reason-box">"${reason}"</div></div>
    </div>
    <p style="margin-top: 24px;">Please log in to the admin dashboard to approve or reject this request.</p>
    </div></body></html>
`;

// 2. Admin Approves Leave (Sent to Employee)
const getLeaveApprovedTemplate = (employeeName, fromDate, toDate, adminRemarks) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #10b981; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .remarks-box { font-weight: 400; font-size: 14px; background: #ecfdf5; padding: 12px; border-radius: 6px; margin-top: 4px; color: #065f46; border: 1px solid #d1fae5; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #10b981 !important; }
        .badge { background: rgba(16, 185, 129, 0.1) !important; color: #34d399 !important; border-color: rgba(16, 185, 129, 0.2) !important; }
        .remarks-box { background: rgba(16, 185, 129, 0.05) !important; color: #6ee7b7 !important; border-color: rgba(16, 185, 129, 0.2) !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container"><div class="badge">Status: Approved</div>
    <h2>Leave Request Approved</h2><p>Hello ${employeeName},</p><p>Good news! Your recent leave request has been approved by the administration.</p>
    <div class="card">
        <div class="card-item"><span class="label">Approved Dates</span><div class="value">📅 ${fromDate} to ${toDate}</div></div>
        ${adminRemarks ? `<div class="card-item"><span class="label">Admin Remarks</span><div class="value remarks-box">"${adminRemarks}"</div></div>` : ''}
    </div>
    <p style="margin-top: 24px;">Enjoy your time off!</p>
    </div></body></html>
`;

// 3. Admin Rejects Leave (Sent to Employee)
const getLeaveRejectedTemplate = (employeeName, fromDate, toDate, adminRemarks) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #ef4444; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .remarks-box { font-weight: 400; font-size: 14px; background: #fef2f2; padding: 12px; border-radius: 6px; margin-top: 4px; color: #991b1b; border: 1px solid #fecaca; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #ef4444 !important; }
        .badge { background: rgba(239, 68, 68, 0.1) !important; color: #f87171 !important; border-color: rgba(239, 68, 68, 0.2) !important; }
        .remarks-box { background: rgba(239, 68, 68, 0.05) !important; color: #fca5a5 !important; border-color: rgba(239, 68, 68, 0.2) !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container"><div class="badge">Status: Rejected</div>
    <h2>Leave Request Update</h2><p>Hello ${employeeName},</p><p>Your recent leave request could not be approved at this time.</p>
    <div class="card">
        <div class="card-item"><span class="label">Requested Dates</span><div class="value">📅 ${fromDate} to ${toDate}</div></div>
        ${adminRemarks ? `<div class="card-item"><span class="label">Admin Remarks</span><div class="value remarks-box">"${adminRemarks}"</div></div>` : ''}
    </div>
    <p style="margin-top: 24px;">If you have any questions, please reach out to your administrator.</p>
    </div></body></html>
`;

// 4. Employee Revokes Leave (Sent to Admin)
const getLeaveRevokedTemplate = (adminName, employeeName, fromDate, toDate) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #f4f4f5; color: #52525b; border: 1px solid #e4e4e7; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #71717a; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #71717a !important; }
        .badge { background: #27272a !important; color: #a1a1aa !important; border-color: #3f3f46 !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container"><div class="badge">System Update</div>
    <h2>Leave Request Cancelled</h2><p>Hello ${adminName},</p><p>An employee has cancelled/revoked their pending leave request.</p>
    <div class="card">
        <div class="card-item"><span class="label">Employee</span><div class="value">${employeeName}</div></div>
        <div class="card-item"><span class="label">Cancelled Dates</span><div class="value" style="text-decoration: line-through; color: #71717a;">📅 ${fromDate} to ${toDate}</div></div>
    </div>
    <p style="margin-top: 24px;">No further action is required from your end.</p>
    </div></body></html>
`;

module.exports = {
    getLeaveRequestTemplate,
    getLeaveApprovedTemplate,
    getLeaveRejectedTemplate,
    getLeaveRevokedTemplate
};