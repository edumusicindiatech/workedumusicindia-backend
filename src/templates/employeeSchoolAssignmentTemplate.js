const getEmployeeSchoolAssignmentEmailTemplate = (userName, schoolName, schoolAddress, category, startDate, startTime) => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .logo-container { text-align: center; margin-bottom: 30px; }
    .logo-badge { display: inline-block; background: #3b82f6; color: #ffffff; padding: 10px 20px; border-radius: 8px; font-weight: bold; font-size: 18px; letter-spacing: 0.5px; }
    h2 { color: #18181b; font-size: 22px; margin-top: 0; margin-bottom: 12px; }
    p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
    .card { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #3b82f6; margin: 24px 0; }
    .card-item { margin-bottom: 16px; }
    .card-item:last-child { margin-bottom: 0; }
    .label { color: #71717a; font-size: 12px; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 6px; letter-spacing: 0.5px;}
    .value { font-weight: 600; color: #18181b; font-size: 16px; display: block; }
    .address { color: #52525b; font-size: 15px; margin-top: 2px; display: block; font-weight: 400;}
    .split-flex { display: table; width: 100%; }
    .split-col { display: table-cell; width: 50%; vertical-align: top; }
    .btn-container { text-align: center; margin-top: 30px; }
    .btn { display: inline-block; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; }
    .footer { margin-top: 40px; font-size: 13px; color: #a1a1aa; text-align: center; border-top: 1px solid #e4e4e7; padding-top: 20px; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2, .value { color: #f4f4f5 !important; }
        p, .label, .address { color: #a1a1aa !important; }
        .card { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #3b82f6 !important; }
        .footer { border-color: #27272a !important; }
    }
    @media (max-width: 600px) { 
        .container { padding: 30px 20px; }
        .split-flex, .split-col { display: block; width: 100%; }
        .split-col:first-child { margin-bottom: 16px; }
        .btn { display: block; width: 100%; box-sizing: border-box; }
    }
    </style></head><body>
    <div class="container">
        <div class="logo-container"><div class="logo-badge">WorkForce Pro</div></div>
        <h2>New Assignment Alert</h2>
        <p>Hello ${userName},</p>
        <p>You have been assigned to a new location. Please review the details below to ensure you are prepared for your upcoming shift.</p>
        
        <div class="card">
            <div class="card-item">
                <span class="label">School Name</span>
                <div class="value">${schoolName}</div>
            </div>

            <div class="card-item">
                <span class="label">Physical Address</span>
                <div class="address">📍 ${schoolAddress}</div>
            </div>

            <div class="card-item">
                <span class="label">Assignment Category</span>
                <div class="value">${category}</div>
            </div>
            
            <div class="card-item split-flex">
                <div class="split-col">
                    <span class="label">Start Date</span>
                    <div class="value">${startDate}</div>
                </div>
                <div class="split-col">
                    <span class="label">Report Time</span>
                    <div class="value" style="color: #3b82f6;">${startTime}</div>
                </div>
            </div>
        </div>
        
        <p style="font-size: 14px;">Geofence tracking will be active at this location. Please ensure your mobile device has location services enabled prior to check-in.</p>
        <div class="btn-container">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employee/dashboard" class="btn">View in Dashboard</a>
        </div>
        <div class="footer">This is an automated message from WorkForce Pro.</div>
    </div></body></html>
`;

module.exports = { getEmployeeSchoolAssignmentEmailTemplate };