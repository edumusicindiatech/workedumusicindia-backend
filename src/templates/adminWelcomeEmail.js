// templates/adminWelcomeEmail.js

/**
 * Generates the HTML template for the Admin Welcome Email.
 * @param {string} adminName - The name of the new Admin
 * @param {string} adminId - The Admin ID assigned by SuperAdmin
 * @param {string} plainTextPassword - The temporary password assigned by SuperAdmin
 * @returns {string} - The complete HTML string
 */
const getAdminWelcomeEmailTemplate = (adminName, adminId, plainTextPassword) => {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
                .header { color: #333333; font-size: 24px; margin-bottom: 20px; }
                .credentials-box { background-color: #f4f6f8; padding: 20px; border-left: 4px solid #7c3aed; border-radius: 4px; margin: 20px 0; }
                .warning { color: #d9534f; font-weight: bold; font-size: 14px; margin-top: 20px; }
                .footer { margin-top: 30px; font-size: 12px; color: #777777; border-top: 1px solid #eeeeee; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">Welcome to the Admin Portal, ${adminName}!</div>
                <p>The Super Administration team has officially configured your administrative account for the WorkForce Pro system. Below are your secure login credentials:</p>
                
                <div class="credentials-box">
                    <p style="margin: 0 0 10px 0;"><strong>Admin ID:</strong> ${adminId}</p>
                    <p style="margin: 0;"><strong>Temporary Password:</strong> ${plainTextPassword}</p>
                </div>
                
                <p class="warning">
                    ⚠️ For system security, you will be prompted to change this password immediately upon your first login.
                </p>
                
                <p>With your new privileges, you now have access to manage employee rosters, oversee live attendance, and review daily compliance reports.</p>
                
                <div class="footer">
                    Best Regards,<br>
                    <strong>WorkForce Pro Super Administration</strong>
                </div>
            </div>
        </body>
        </html>
    `;
};

module.exports = { getAdminWelcomeEmailTemplate };