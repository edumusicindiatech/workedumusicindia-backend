/**
 * Generates the HTML template for the Welcome Email.
 * @param {string} userName - The name of the employee
 * @param {string} employeeId - The generated Employee ID
 * @param {string} plainTextPassword - The temporary password
 * @returns {string} - The complete HTML string
 */
const getWelcomeEmailTemplate = (userName, employeeId, plainTextPassword) => {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.05); }
                .header { color: #333333; font-size: 24px; margin-bottom: 20px; }
                .credentials-box { background-color: #f4f6f8; padding: 20px; border-left: 4px solid #0056b3; border-radius: 4px; margin: 20px 0; }
                .warning { color: #d9534f; font-weight: bold; font-size: 14px; margin-top: 20px; }
                .footer { margin-top: 30px; font-size: 12px; color: #777777; border-top: 1px solid #eeeeee; padding-top: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">Welcome aboard, ${userName}!</div>
                <p>Your administrator has set up your official account. Below are your secure login credentials:</p>
                
                <div class="credentials-box">
                    <p style="margin: 0 0 10px 0;"><strong>Employee ID:</strong> ${employeeId}</p>
                    <p style="margin: 0;"><strong>Temporary Password:</strong> ${plainTextPassword}</p>
                </div>
                
                <p class="warning">
                    ⚠️ For security purposes, you will be required to change this password immediately upon your first login.
                </p>
                
                <p>If you have any issues accessing your account, please contact your administrator.</p>
                
                <div class="footer">
                    Best Regards,<br>
                    <strong>The Admin Team</strong>
                </div>
            </div>
        </body>
        </html>
    `;
};

module.exports = {
    getWelcomeEmailTemplate
};