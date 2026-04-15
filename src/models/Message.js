const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String },
    mediaUrl: { type: String }, // Cloudflare R2 link
    mediaType: { type: String, enum: ['text', 'image', 'video', 'file', 'document'], default: 'text' },
    fileSize: { type: Number, default: 0 }, // <--- ADD THIS LINE
    status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' }, // <--- ADD THIS LINE
    isRead: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);