const getWeeklyScoreEmailTemplate = (employeeName, score, rank, colorZone, scoreTrend, stats) => {
    // Determine exact colors based on the zone
    let themeColor = '#ef4444'; // Default Red
    let badgeText = 'NEEDS IMPROVEMENT';

    if (colorZone === 'green') {
        themeColor = '#10b981';
        badgeText = 'TOP PERFORMER';
    } else if (colorZone === 'blue') {
        themeColor = '#3b82f6';
        badgeText = 'SOLID WEEK';
    }

    // Determine the trend arrow
    let arrowHtml = '<span style="color: #64748b;">➖ Maintained</span>';
    if (scoreTrend === 'up') arrowHtml = '<span style="color: #10b981;">📈 + Increased from last week</span>';
    if (scoreTrend === 'down') arrowHtml = '<span style="color: #ef4444;">📉 - Decreased from last week</span>';

    return `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Segoe UI', sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border-top: 6px solid ${themeColor}; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); }
        .score-circle { width: 100px; height: 100px; border-radius: 50%; background-color: ${themeColor}15; color: ${themeColor}; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800; margin: 20px auto; border: 4px solid ${themeColor}; text-align: center; line-height: 100px;}
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: bold; font-size: 12px; letter-spacing: 1px; background: ${themeColor}; color: white; text-transform: uppercase; }
        h2 { color: #18181b; text-align: center; margin-bottom: 5px; }
        .trend { text-align: center; font-weight: 600; margin-bottom: 30px; font-size: 14px; }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 30px; }
        .stat-box { background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0; }
        .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
        .stat-value { font-size: 18px; font-weight: 800; color: #0f172a; margin-top: 5px; }
    </style></head><body>
        <div class="container">
            <div style="text-align: center;"><div class="badge">${badgeText}</div></div>
            <h2>Weekly Performance Report</h2>
            <p style="text-align: center; color: #64748b;">Hi ${employeeName}, here is your performance for this week!</p>
            
            <div class="score-circle">${score}</div>
            <div class="trend">${arrowHtml}</div>

            <div style="text-align: center; margin: 20px 0;">
                <h3 style="margin: 0; color: #1e293b;">Leaderboard Rank: #${rank}</h3>
            </div>

            <div class="stats-grid">
                <div class="stat-box">
                    <div class="stat-label">Days Present</div>
                    <div class="stat-value">${stats.present}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Avg Video Score</div>
                    <div class="stat-value">${stats.averageMediaScore.toFixed(1)} / 10</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Days Late</div>
                    <div class="stat-value">${stats.late}</div>
                </div>
                <div class="stat-box">
                    <div class="stat-label">Warnings</div>
                    <div class="stat-value">${stats.warningsCount}</div>
                </div>
            </div>
        </div>
    </body></html>
    `;
};

module.exports = getWeeklyScoreEmailTemplate;