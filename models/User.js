const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    coins: { type: Number, default: 0 },
    lastMessageDate: { type: Date, default: null } // Used for chat XP cooldowns
});

module.exports = mongoose.model('User', userSchema);
