const mongoose = require('mongoose');

const gachaItemSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    rarity: { type: String, required: true },
    value: { type: Number, required: true },
    power: { type: Number, default: 0 },
    image: { type: String, required: true },
    creator: { type: String, required: true }
});

module.exports = mongoose.model('GachaItem', gachaItemSchema);
