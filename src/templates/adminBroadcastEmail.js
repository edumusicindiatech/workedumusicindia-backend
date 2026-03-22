const getBroadcastEmailTemplate = (message, senderName = "Administration") => `
    <!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="color-scheme" content="light dark"><style>
    body { font-family: 'Segoe UI', -apple-system, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px; -webkit-font-smoothing: antialiased; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; border: 1px solid #e4e4e7; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: 600; font-size: 13px; letter-spacing: 0.5px; margin-bottom: 24px; text-transform: uppercase; background: #eff6ff; color: #2563eb; border: 1px solid #bfdbfe; }
    h2 { color: #18181b; font-size: 20px; margin-top: 0; margin-bottom: 12px; }
    .message-box { background-color: #fafafa; padding: 24px; border-radius: 8px; border: 1px solid #e4e4e7; border-left: 4px solid #2563eb; margin-bottom: 24px; font-size: 16px; line-height: 1.6; color: #3f3f46; white-space: pre-wrap; }
    .footer-text { font-size: 13px; color: #a1a1aa; margin-bottom: 0; margin-top: 32px; border-top: 1px solid #e4e4e7; padding-top: 24px; }
    @media (prefers-color-scheme: dark) {
        body { background-color: #09090b !important; }
        .container { background-color: #18181b !important; border-color: #27272a !important; }
        h2 { color: #f4f4f5 !important; }
        .message-box { background-color: #09090b !important; border-color: #27272a !important; border-left-color: #3b82f6 !important; color: #d4d4d8 !important; }
        .badge { background: rgba(59, 130, 246, 0.1) !important; color: #60a5fa !important; border-color: rgba(59, 130, 246, 0.2) !important; }
        .footer-text { border-top-color: #27272a !important; }
    }
    @media (max-width: 600px) { .container { padding: 30px 20px; } }
    </style></head><body>
    <div class="container">
        <div class="badge">Official Announcement</div>
        <h2>Important Workforce Update</h2>
        <div class="message-box">${message}</div>
        <p style="color: #71717a; font-size: 14px;">Sent by <strong>Admin</strong></p>
        <p class="footer-text">This is an automated broadcast from your Workforce Management System. Please ensure you comply with the instructions above.</p>
    </div></body></html>
`;

module.exports = { getBroadcastEmailTemplate };