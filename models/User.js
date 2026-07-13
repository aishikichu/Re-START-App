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
    badges: { type: [String], default: [] },    // Array of emoji strings
    affinity: { type: Number, default: 0 },     // Affinity points for dupes (Legacy)
    avatarAffinity: { type: Map, of: Number, default: {} }, // Per-avatar duplicates Map
    isGameStaff: { type: Boolean, default: false }, // Staff permission flag
    lastSubmissionRewardDate: { type: Date, default: null }, // Daily reward tracker
    vipExpiresAt: { type: Date, default: null }, // VIP mode expiration
    badLuckExpiresAt: { type: Date, default: null }, // Bad Luck expiration
    profanityCount: { type: Number, default: 0 }, // Tracker for the Hall of Re:START swearing leaderboard
    pityCounter: { type: Number, default: 0 }, // Tracks gacha rolls since last UR
    dailyStreak: { type: Number, default: 0 }, // Tracks consecutive daily logins
    lastCardDropClaimDate: { type: Date, default: null }, // Random drop 1/hr limit
    coinSnipeCount: { type: Number, default: 0 }, // Random drop 5/hr limit counter
    lastCoinSnipeReset: { type: Date, default: null }, // When the 5/hr limit resets
    workEndTime: { type: Date, default: null }, // Timestamp when avatar finishes working
    workingAvatar: { type: String, default: null }, // ID of the avatar currently working
    avatarJailTime: { type: Map, of: Date, default: {} }, // Map of avatar ID to jail release Date
    lastRiskyWorkTime: { type: Date, default: null } // Global user cooldown for riskywork
});

module.exports = mongoose.model('User', userSchema);
