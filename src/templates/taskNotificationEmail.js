const getTaskUpdateTemplate = (employeeName, schoolName, action, rejectReason = "") => {
    const isAccepted = action === "Accepted";
    const badgeColor = isAccepted ? "#10b981" : "#ef4444"; // Green for Accept, Red for Reject
    const badgeBg = isAccepted ? "#ecfdf5" : "#fef2f2";

    return `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #111827; margin-bottom: 5px;">Optional Task Update</h2>
            <div style="display: inline-block; background: ${badgeBg}; color: ${badgeColor}; padding: 5px 12px; border-radius: 15px; font-size: 14px; font-weight: bold; margin-bottom: 20px;">
                Task ${action}
            </div>
            
            <p><strong>Employee:</strong> ${employeeName}</p>
            <p><strong>Assigned School:</strong> ${schoolName}</p>
            
            ${!isAccepted && rejectReason ? `
                <div style="background-color: #fef2f2; color: #b91c1c; padding: 12px; border-radius: 6px; margin-top: 15px; border: 1px solid #fca5a5;">
                    <strong>Reason for Rejection:</strong><br/>
                    ${rejectReason}
                </div>
            ` : ''}
            
            <div style="margin-top: 30px; font-size: 12px; color: #94a3b8; border-top: 1px solid #eeeeee; padding-top: 15px; text-align: center;">
                Automated Alert from WorkForce Pro.
            </div>
        </div>
    `;
};

module.exports = { getTaskUpdateTemplate };