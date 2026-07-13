require('dotenv').config();
const mongoose = require('mongoose');
const GachaItem = require('./models/GachaItem');

async function removeMistake() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const items = await GachaItem.find({ name: { $regex: 'ルティエ', $options: 'i' } });
        console.log('Found items:', items);
        
        if (items.length > 0) {
            const result = await GachaItem.deleteMany({ name: { $regex: 'ルティエ', $options: 'i' } });
            console.log('Deleted items count:', result.deletedCount);
        } else {
            console.log('No items found to delete.');
        }
    } catch (e) {
        console.error(e);
    } finally {
        mongoose.connection.close();
    }
}
removeMistake();
