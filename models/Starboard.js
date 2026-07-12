const mongoose = require('mongoose');

const starboardSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    starboardMessageId: { type: String, required: true },
    authorId: { type: String, required: true },
    stars: { type: Number, default: 0 }
});

module.exports = mongoose.model('Starboard', starboardSchema);
