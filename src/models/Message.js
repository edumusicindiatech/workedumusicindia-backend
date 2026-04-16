const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String },
    mediaUrl: { type: String }, // Cloudflare R2 link
    mediaType: { type: String, enum: ['text', 'image', 'video', 'file', 'document'], default: 'text' },
    fileSize: { type: Number, default: 0 },
    status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
    isRead: { type: Boolean, default: false },

    // --- NEW WHATSAPP-LIKE FEATURES ---
    isDeletedForEveryone: { type: Boolean, default: false }, // Soft delete flag
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of user IDs who deleted this for themselves
    isEdited: { type: Boolean, default: false } // Edit flag
}, { timestamps: true });

module.exports = mongoose.model('Message', MessageSchema);