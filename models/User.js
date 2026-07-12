const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    coins: { type: Number, default: 0 },
    lastMessageDate: { type: Date, default: null }, // Used for chat XP cooldowns
    lastDailyDate: { type: Date, default: null }, // Used for /daily 24h cooldown
    gachaTokens: { type: Number, default: 0 },
    inventory: { type: [String], default: [] }, // Array of Booth model IDs they own
    wishlist: { type: [String], default: [] },   // Array of Booth model IDs they want
    profileColor: { type: String, default: '#95a5a6' },
    activeXpBoost: { type: Date, default: null }, // Timestamp of when it expires
    showcase: { type: [String], default: [] }, // Array of avatar IDs for profile
    badges: { type: [String], default: [] }    // Array of emoji strings
});

module.exports = mongoose.model('User', userSchema);
