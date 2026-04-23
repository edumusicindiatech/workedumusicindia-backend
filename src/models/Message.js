const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },

    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    text: { type: String },
    mediaUrl: { type: String }, // Cloudflare R2 link
    mediaType: { type: String, enum: ['text', 'image', 'video', 'file', 'document'], default: 'text' },
    fileSize: { type: Number, default: 0 },
    status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
    isRead: { type: Boolean, default: false },

    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', default: null },
    isGroup: { type: Boolean, default: false },

    // --- WHATSAPP-LIKE FEATURES ---
    isDeletedForEveryone: { type: Boolean, default: false },
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isEdited: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);