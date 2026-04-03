const getAdminTopPerformersTemplate = (adminName, topRankers) => {
    // Generate the list items for the top 3
    const rankersHtml = topRankers.map((emp, index) => {
        const medals = ['🥇', '🥈', '🥉'];
        const colors = ['#fbbf24', '#94a3b8', '#b45309']; // Gold, Silver, Bronze
        return `
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid ${colors[index]};">
            <div style="font-size: 16px; font-weight: bold; color: #0f172a;">
                ${medals[index]} Rank #${index + 1}: ${emp.name}
            </div>
            <div style="font-size: 14px; color: #64748b; margin-top: 4px;">
                Score: <strong>${emp.score}/100</strong> | Zone: ${emp.zone || 'N/A'}
            </div>
        </div>
        `;
    }).join('');

    return `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Segoe UI', sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border-top: 6px solid #8b5cf6; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        h2 { color: #18181b; margin-top: 0; }
        p { color: #52525b; line-height: 1.6; }
    </style></head><body>
        <div class="container">
            <h2>🏆 Weekly Leaderboard Results</h2>
            <p>Hello ${adminName},</p>
            <p>The weekly progress scores have just been calculated. Here are your top-performing employees for the week:</p>
            
            <div style="margin: 25px 0;">
                ${rankersHtml}
            </div>
            
            <p>Log in to the admin dashboard to view the complete leaderboard and individual metrics.</p>
        </div>
    </body></html>
    `;
};

module.exports = {
    getAdminTopPerformersTemplate
};