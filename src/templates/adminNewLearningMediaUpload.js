const getNewLearningMediaTemplate = (employeeName, adminName, videoTitle) => {
    return `
        <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
        body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
        .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
        h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
        p { color: #52525b; font-size: 15px; line-height: 1.6; margin-bottom: 24px; }
        .video-title { font-weight: 700; color: #18181b; font-size: 18px; padding: 16px; background: #fafafa; border-left: 4px solid #2563eb; border-radius: 4px; margin-bottom: 24px; }
        .btn { display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 15px; }
        @media (prefers-color-scheme: dark) {
            body { background-color: #09090b !important; }
            .container { background-color: #18181b !important; border-color: #27272a !important; }
            h2, .video-title { color: #f4f4f5 !important; }
            p { color: #a1a1aa !important; }
            .video-title { background: #09090b !important; border-color: #2563eb !important; }
            .badge { background: rgba(37, 99, 235, 0.1) !important; color: #60a5fa !important; border-color: rgba(37, 99, 235, 0.2) !important; }
        }
        </style></head><body>
        <div class="container"><div class="badge">New Training Video</div>
        <h2>Hello ${employeeName},</h2>
        <p><strong>${adminName}</strong> has just uploaded a new instruction video to the Training Vault.</p>
        
        <div class="video-title">"${videoTitle}"</div>
        
        <p>Please log in to your dashboard and navigate to the <strong>Learn</strong> tab to watch the video.</p>
        
        <a href="${process.env.FRONTEND_URL}/employee/learning-hub" class="btn">Go to Training Vault</a>
        
        <p style="font-size: 13px; color: #a1a1aa; text-align: center; margin-top: 40px; border-top: 1px solid #e4e4e7; padding-top: 20px;">This is an automated system notification from WorkEduMusic.</p>
        </div></body></html>
    `;
};

module.exports = getNewLearningMediaTemplate