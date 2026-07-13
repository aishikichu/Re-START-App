const mongoose = require('mongoose');

const marketListingSchema = new mongoose.Schema({
    sellerId: { type: String, required: true },
    avatarId: { type: String, required: true },
    price: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('MarketListing', marketListingSchema);
