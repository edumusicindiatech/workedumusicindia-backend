/**
 * Generates the HTML template for the Admin Welcome Email.
 * @param {string} adminName - The name of the new Admin
 * @param {string} adminId - The Admin ID assigned by SuperAdmin
 * @param {string} plainTextPassword - The temporary password assigned by SuperAdmin
 * @returns {string} - The complete HTML string
 */
const getAdminWelcomeEmailTemplate = (adminName, adminId, plainTextPassword) => {
    return `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
        body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f8fafc; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .logo-container { text-align: center; margin-bottom: 35px; }
        .logo-badge { display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%); color: #ffffff; padding: 12px 24px; border-radius: 12px; font-weight: 700; font-size: 20px; letter-spacing: 0.5px; box-shadow: 0 4px 6px -1px rgba(139, 92, 246, 0.3); }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 700; font-size: 12px; letter-spacing: 0.5px; margin-bottom: 20px; text-transform: uppercase; background: #f3e8ff; color: #7c3aed; border: 1px solid #e9d5ff; }
        h2 { color: #0f172a; font-size: 24px; margin-top: 0; margin-bottom: 12px; font-weight: 700; }
        p { color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .card { background-color: #f8fafc; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0; border-left: 4px solid #8b5cf6; margin: 24px 0; }
        .card-item { margin-bottom: 20px; }
        .card-item:last-child { margin-bottom: 0; }
        .label { color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: 700; display: block; margin-bottom: 8px; letter-spacing: 0.5px;}
        .value { font-weight: 600; color: #0f172a; font-size: 18px; display: block; letter-spacing: 0.5px; }
        .password-box { display: inline-block; background: #e0e7ff; padding: 8px 12px; border-radius: 6px; font-family: 'Courier New', Courier, monospace; color: #4338ca; font-weight: 700; font-size: 18px; letter-spacing: 1px; border: 1px solid #c7d2fe; }
        .warning-box { background: #fff1f2; border: 1px solid #fecdd3; padding: 16px 20px; border-radius: 10px; color: #be123c; font-size: 14px; font-weight: 500; display: flex; align-items: flex-start; margin-bottom: 30px; line-height: 1.5; }
        .btn-container { text-align: center; margin-top: 35px; }
        .btn { display: inline-block; background-color: #8b5cf6; color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px -1px rgba(139, 92, 246, 0.2); }
        .footer { margin-top: 40px; font-size: 13px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 24px; text-align: center; }
        .footer strong { color: #64748b; }
        
        @media (prefers-color-scheme: dark) {
            body { background-color: #0f172a !important; }
            .container { background-color: #1e293b !important; border-color: #334155 !important; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
            h2, .value { color: #f8fafc !important; }
            p, .label { color: #94a3b8 !important; }
            .card { background-color: #0f172a !important; border-color: #334155 !important; border-left-color: #8b5cf6 !important; }
            .password-box { background: rgba(99, 102, 241, 0.1) !important; border-color: rgba(99, 102, 241, 0.2) !important; color: #818cf8 !important; }
            .badge { background: rgba(124, 58, 237, 0.1) !important; color: #a78bfa !important; border-color: rgba(124, 58, 237, 0.2) !important; }
            .warning-box { background: rgba(225, 29, 72, 0.1) !important; color: #fb7185 !important; border-color: rgba(225, 29, 72, 0.2) !important; }
            .footer { border-color: #334155 !important; }
            .footer strong { color: #94a3b8 !important; }
        }
        @media (max-width: 600px) { 
            .container { padding: 30px 20px; } 
            .btn { display: block; width: 100%; box-sizing: border-box; }
        }
        </style></head><body>
        <div class="container">
            <div class="logo-container">
                <div class="logo-badge">WorkForce Pro</div>
            </div>
            <div class="badge">Account Created</div>
            <h2>Welcome to the Admin Portal, ${adminName}!</h2>
            <p>The Super Administration team has officially configured your administrative account. Below are your secure login credentials:</p>
            
            <div class="card">
                <div class="card-item">
                    <span class="label">Admin ID</span>
                    <div class="value">${adminId}</div>
                </div>
                <div class="card-item">
                    <span class="label">Temporary Password</span>
                    <div class="password-box">${plainTextPassword}</div>
                </div>
            </div>
            
            <div class="warning-box">
                <div>⚠️ <strong>Action Required:</strong> For system security, you will be prompted to change this temporary password immediately upon your first login.</div>
            </div>
            
            <p>With your new privileges, you now have full access to manage employee rosters, oversee live attendance, and review daily compliance reports.</p>
            
            <div class="btn-container">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}" class="btn">Access Admin Portal</a>
            </div>
            
            <div class="footer">
                Best Regards,<br>
                <strong>WorkForce Pro Super Administration</strong>
            </div>
        </div></body></html>
    `;
};

module.exports = { getAdminWelcomeEmailTemplate };