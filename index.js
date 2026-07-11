const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');

// Initialize the bot (Presence intent is no longer needed!)
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, 
        GatewayIntentBits.GuildMessages, 
        GatewayIntentBits.MessageContent 
    ]
});

// Helper function: Reads your friends' custom choices from data.json
function getUserData() {
    try {
        const fileData = fs.readFileSync('./data.json', 'utf8');
        return JSON.parse(fileData);
    } catch (err) {
        return {}; 
    }
}

// Helper function: Saves new choices to data.json
function saveUserData(data) {
    fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
}

// Core function: Pushes the 6 custom stats to the member's profile widget
async function updatePlayerWidget(userId) {
    const savedData = getUserData();
    const userCustom = savedData[userId] || {};

    try {
        // We push the exact variables we defined in the Developer Portal
        await client.rest.put(
            `/applications/${client.user.id}/users/${userId}/profile`,
            {
                body: {
                    "stat1_title": userCustom.stat1_title || "Stat 1",
                    "stat1_val": userCustom.stat1_val || "Not Set",
                    
                    "stat2_title": userCustom.stat2_title || "Stat 2",
                    "stat2_val": userCustom.stat2_val || "Not Set",
                    
                    "stat3_title": userCustom.stat3_title || "Stat 3",
                    "stat3_val": userCustom.stat3_val || "Not Set",
                    
                    "stat4_title": userCustom.stat4_title || "Stat 4",
                    "stat4_val": userCustom.stat4_val || "Not Set",
                    
                    "stat5_title": userCustom.stat5_title || "Stat 5",
                    "stat5_val": userCustom.stat5_val || "Not Set",
                    
                    "stat6_title": userCustom.stat6_title || "Stat 6",
                    "stat6_val": userCustom.stat6_val || "Not Set"
                }
            }
        );
    } catch (error) {
        console.log(`Failed to update widget for ${userId}. They may not have authorized the app.`);
    }
}

client.once('ready', () => {
    console.log(`✨ Re:START Custom Stat Bot is active as ${client.user.tag}!`);
});

// Listen for the !setstat command
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Command Format: !setstat 1 Title | Value
    if (message.content.startsWith('!setstat ')) {
        const args = message.content.slice(9).trim(); // Removes "!setstat "
        
        // Grab the slot number (1-6)
        const slotNumber = args.charAt(0);
        if (!['1', '2', '3', '4', '5', '6'].includes(slotNumber)) {
            return message.reply("❌ Please choose a slot number between 1 and 6. Example: `!setstat 1 Vibe | Chill`");
        }

        // Grab the rest of the text and split it by the "|" character
        const contentAfterNumber = args.slice(1).trim();
        if (!contentAfterNumber.includes('|')) {
            return message.reply("❌ You must include a `|` symbol to separate the Title and the Value. Example: `!setstat 1 Vibe | Chill`");
        }

        const parts = contentAfterNumber.split('|');
        const titleText = parts[0].trim();
        const valueText = parts[1].trim();

        // Save it to the JSON file
        const userId = message.author.id;
        const savedData = getUserData();
        
        if (!savedData[userId]) savedData[userId] = {};
        
        // Dynamically save to the correct variables (e.g., stat1_title)
        savedData[userId][`stat${slotNumber}_title`] = titleText;
        savedData[userId][`stat${slotNumber}_val`] = valueText;
        
        saveUserData(savedData);

        await message.reply(`✅ Slot #${slotNumber} updated!\n**Title:** ${titleText}\n**Value:** ${valueText}\n*Updating your widget now...*`);
        
        // Push the update to Discord
        await updatePlayerWidget(userId);
    }
});

// Log into Discord securely
client.login(process.env.DISCORD_TOKEN);