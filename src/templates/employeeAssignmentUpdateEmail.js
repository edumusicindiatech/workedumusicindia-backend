const getEmployeeAssignmentUpdatedTemplate = (userName, schoolName, schoolAddress, changes, current) => {
    // THIS LOGIC IS KEPT EXACTLY AS YOU REQUESTED
    const changesHtml = changes.map(change => `
        <div style="margin-bottom: 12px; font-size: 14px; padding: 12px; background: rgba(250, 204, 21, 0.1); border-radius: 6px; border: 1px solid rgba(250, 204, 21, 0.2);">
            <span style="color: #ca8a04; font-weight: 700; text-transform: uppercase; font-size: 11px; display: block; margin-bottom: 4px; letter-spacing: 0.5px;">${change.field}</span> 
            <span style="text-decoration: line-through; color: #a1a1aa; font-size: 14px;">${change.oldValue}</span> 
            <span style="color: #3b82f6; font-weight: bold; margin: 0 6px;">&rarr;</span>
            <span class="change-new" style="font-weight: 600;">${change.newValue}</span>
        </div>
    `).join('');

    return `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
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
        .change-new { color: #18181b; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #09090b !important; }
            .container { background-color: #18181b !important; border-color: #27272a !important; }
            h2, .value, strong, .change-new { color: #f4f4f5 !important; }
            p, .label { color: #a1a1aa !important; }
            .change-box, .details-card { background-color: #09090b !important; border-color: #27272a !important; }
            .details-card { border-left-color: #3b82f6 !important; }
            .badge { background: rgba(202, 138, 4, 0.1) !important; color: #facc15 !important; border-color: rgba(202, 138, 4, 0.2) !important; }
        }
        @media (max-width: 600px) { .container { padding: 30px 20px; } }
        </style></head><body>
        <div class="container"><div class="badge">Schedule Modified</div>
        <h2>Hello ${userName},</h2><p>Your assignment for <strong>${schoolName}</strong> has been updated. Here is what changed:</p>
        
        <div class="change-box">${changesHtml}</div>

        <p><strong>Your Full Current Schedule:</strong></p>
        <div class="details-card">
            <div class="card-item"><span class="label">School Name</span><div class="value">${schoolName}</div></div>
            <div class="card-item"><span class="label">Physical Address</span><div class="value" style="font-weight: 400; font-size: 14px;">📍 ${schoolAddress}</div></div>
            
            <div class="card-item"><span class="label">Category</span><div class="value">${current.category}</div></div>
            <div class="card-item"><span class="label">Time</span><div class="value">${current.startTime} - ${current.endTime}</div></div>
            <div class="card-item"><span class="label">Working Days</span><div class="value">${current.allowedDays.join(', ')}</div></div>
        </div>
        <p style="font-size: 13px; color: #a1a1aa; text-align: center; margin-top: 30px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated system notification from WorkEduMusic.</p>
        </div></body></html>
    `;
};

// Kept your exact export syntax
module.exports = getEmployeeAssignmentUpdatedTemplate 