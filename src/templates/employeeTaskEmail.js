// 1. NEW TASK ASSIGNED
const getEmployeeTaskAssignedTemplate = (employeeName, taskTitle, taskDescription, scheduleString, category) => {
    return `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
        body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #e0e7ff; color: #6366f1; border: 1px solid #c7d2fe; }
        h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
        p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #6366f1; }
        .card-item { margin-bottom: 16px; }
        .card-item:last-child { margin-bottom: 0; }
        .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; }
        .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
        .btn { display: inline-block; background-color: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; margin-top: 10px; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #09090b !important; }
            .container { background-color: #18181b !important; border-color: #27272a !important; }
            h2, .value { color: #f4f4f5 !important; }
            p, .label { color: #a1a1aa !important; }
            .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #6366f1 !important; }
        }
        </style></head><body>
        <div class="container"><div class="badge">New Task</div>
        <h2>New Task Assigned</h2><p>Hello ${employeeName},</p><p>A new task has been added to your schedule by the administration. Please review the details below:</p>
        <div class="card">
            <div class="card-item"><span class="label">Task Location</span><div class="value">${taskTitle}</div></div>
            <div class="card-item"><span class="label">Category</span><div class="value">${category || 'Task'}</div></div>
            <div class="card-item"><span class="label">Objective</span><div class="value" style="font-weight: 400;">${taskDescription}</div></div>
            <div class="card-item"><span class="label">Schedule</span><div class="value">${scheduleString}</div></div>
        </div>
        <p style="margin-top: 24px;">Please log in to your portal to accept or reject this task.</p>
        <a href="${process.env.FRONTEND_URL}/tasks" class="btn">View in Dashboard</a>
        <p style="font-size: 12px; color: #a1a1aa; margin-top: 30px;">This is an automated system notification.</p>
        </div></body></html>
    `;
};

// 2. TASK UPDATED (WITH DETAILED CHANGELOG)
const getEmployeeTaskUpdatedTemplate = (userName, taskTitle, changes, currentTask) => {
    const changesHtml = changes.map(change => `
        <div style="margin-bottom: 12px; font-size: 14px; padding: 12px; background: rgba(250, 204, 21, 0.1); border-radius: 6px; border: 1px solid rgba(250, 204, 21, 0.2);">
            <span style="color: #ca8a04; font-weight: 700; text-transform: uppercase; font-size: 11px; display: block; margin-bottom: 4px; letter-spacing: 0.5px;">${change.field}</span> 
            <span style="text-decoration: line-through; color: #a1a1aa; font-size: 14px;">${change.oldValue}</span> 
            <span style="color: #3b82f6; font-weight: bold; margin: 0 6px;">&rarr;</span>
            <span class="change-new" style="color: #18181b; font-weight: 600;">${change.newValue}</span>
        </div>
    `).join('');

    // If the task was rejected, we show the reason.
    const rejectionHtml = currentTask.status === 'Rejected' && currentTask.rejectionReason
        ? `<div class="card-item" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e4e4e7;"><span class="label" style="color: #dc2626;">Rejection Reason</span><div class="value" style="font-weight: 400; color: #dc2626;">${currentTask.rejectionReason}</div></div>`
        : '';

    return `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
        /* CSS matches your standard templates */
        body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #fefce8; color: #ca8a04; border: 1px solid #fef08a; }
        h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
        p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .change-box { background: #fafafa; padding: 20px; border-radius: 8px; border: 1px solid #e4e4e7; margin: 24px 0; }
        .details-card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #3b82f6; margin: 24px 0; }
        .card-item { margin-bottom: 16px; }
        .card-item:last-child { margin-bottom: 0; }
        .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
        .value { font-weight: 600; color: #18181b; font-size: 15px; display: block; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #09090b !important; }
            .container { background-color: #18181b !important; border-color: #27272a !important; }
            h2, .value, strong, .change-new { color: #f4f4f5 !important; }
            p, .label { color: #a1a1aa !important; }
            .change-box, .details-card { background-color: #09090b !important; border-color: #27272a !important; }
            .details-card { border-left-color: #3b82f6 !important; }
            .badge { background: rgba(202, 138, 4, 0.1) !important; color: #facc15 !important; border-color: rgba(202, 138, 4, 0.2) !important; }
        }
        </style></head><body>
        <div class="container"><div class="badge">Task Modified</div>
        <h2>Hello ${userName},</h2><p>Your task <strong>"${taskTitle}"</strong> has been updated by an administrator. Here is what changed:</p>
        
        <div class="change-box">${changesHtml}</div>

        <p><strong>Current Task Overview:</strong></p>
        <div class="details-card">
            <div class="card-item"><span class="label">Description</span><div class="value" style="font-weight: 400;">${currentTask.description}</div></div>
            <div class="card-item"><span class="label">Due Date</span><div class="value">${currentTask.dueDate}</div></div>
            <div class="card-item"><span class="label">Current Status</span><div class="value">${currentTask.status}</div></div>
            ${rejectionHtml}
        </div>
        </div></body></html>
    `;
};

// 3. TASK REVOKED / DELETED
const getEmployeeTaskRevokedTemplate = (userName, taskTitle) => `
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
        h2, strong { color: #f4f4f5 !important; }
        p { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #ef4444 !important;}
        .badge { background: rgba(220, 38, 38, 0.1) !important; color: #f87171 !important; border-color: rgba(220, 38, 38, 0.2) !important; }
    }
    </style></head><body>
    <div class="container"><div class="badge">Task Revoked</div>
    <h2>Hello ${userName},</h2><p>Please be advised that the following task has been revoked and removed from your schedule.</p>
    <div class="card">
        <p style="margin: 0; color: #18181b; font-weight: 600;">Task: ${taskTitle}</p>
        <p style="margin-top: 12px; margin-bottom: 0; font-weight: 400; font-size: 14px;">You are no longer required to complete this task. No further action is needed.</p>
    </div>
    </div></body></html>
`;

module.exports = { getEmployeeTaskAssignedTemplate, getEmployeeTaskUpdatedTemplate, getEmployeeTaskRevokedTemplate };