require('dotenv').config(); // Load .env variables first

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    PermissionFlagsBits,
    Partials,
    AttachmentBuilder
} = require('discord.js');
const fs = require('fs');
const express = require('express');
const app = express();
const Filter = require('bad-words');
const mongoose = require('mongoose');
const User = require('./models/User'); // Import our new User database schema
const profanityFilter = new Filter();
const gachaPool = require('./gachaPool.json'); // Import the list of Booth avatars

const WIDGET_CHANNEL_ID = '1525308184389222400';
const ECONOMY_CHANNEL_ID = '1525505480808730694';
const REBOOTH_CHANNEL_ID = '1525666791974764684';
const SHOP_CHANNEL_ID = '1525685955212869804';

// ─── Client Setup ─────────────────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

// ─── Data Helpers ─────────────────────────────────────────────────────────────
function getData() {
    try { return JSON.parse(fs.readFileSync('./data.json', 'utf8')); }
    catch { return {}; }
}
function saveData(data) {
    fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
}

// ─── Widget Updater ───────────────────────────────────────────────────────────
// Uses the /identities/0/profile PATCH endpoint via the Bot Token
async function updatePlayerWidget(userId) {
    const data = getData();
    const u = (data.users || {})[userId] || {};

    // Build dynamic fields
    const dynamicFields = [];
    for (let i = 1; i <= 6; i++) {
        const title = u[`stat${i}_title`] || "-";
        const val   = u[`stat${i}_val`]   || "-";
        
        dynamicFields.push({ type: 1, name: `stat${i}_title`, value: title });
        dynamicFields.push({ type: 1, name: `stat${i}_val`, value: val });
    }

    if (dynamicFields.length === 0) return { success: true, ignored: true };

    try {
        await client.rest.patch(
            `/applications/${client.user.id}/users/${userId}/identities/${userId}/profile`,
            {
                body: {
                    data: { dynamic: dynamicFields }
                }
            }
        );
        console.log(`✅ Widget updated for ${userId}`);
        return { success: true };
    } catch (err) {
        console.error(`❌ Widget update FAILED for ${userId}`);
        console.error(`   Status : ${err.status}`);
        console.error(`   Message: ${err.message}`);
        if (err.rawError) {
            console.error(`   Raw    : ${JSON.stringify(err.rawError)}`);
        }
        
        // If 403, 404, 401, or 400 the user likely hasn't authorized the bot
        if (err.status === 403 || err.status === 404 || err.status === 401 || err.status === 400) {
            return { success: false, reason: 'unauthorized', status: err.status };
        }
        return { success: false, reason: 'api_error', status: err.status, message: err.message };
    }
}

// ─── Role Panel Builder ───────────────────────────────────────────────────────
function buildRolePanel(roles) {
    const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle('🎭 Self-Assignable Roles')
        .setDescription(
            'Click a button below to **add or remove** a role!\n' +
            'Roles give your username a color. Click again to remove.\n\u200b'
        )
        .addFields(roles.map(r => ({
            name: `${r.emoji} ${r.name}`,
            value: `<@&${r.id}>`,
            inline: true
        })))
        .setFooter({ text: 'Re:START Bot  •  Role Panel' });

    // Build rows of max 5 buttons each
    const rows = [];
    for (let i = 0; i < roles.length; i += 5) {
        const row = new ActionRowBuilder();
        roles.slice(i, i + 5).forEach(r => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`role_${r.id}`)
                    .setLabel(r.name)
                    .setEmoji(r.emoji)
                    .setStyle(ButtonStyle.Secondary)
            );
        });
        rows.push(row);
    }

    return { embeds: [embed], components: rows };
}

// ─── Default Roles ────────────────────────────────────────────────────────────
const DEFAULT_ROLES = [
    { name: 'Artist',      emoji: '🎨', color: 0xf48fb1 }, // soft pink
    { name: 'VRChat',      emoji: '🥽', color: 0x5865F2 }, // discord blurple
    { name: 'Eclipticers', emoji: '⭐', color: 0xf1c40f }, // gold
];

// ─── Slash Command Definitions ────────────────────────────────────────────────
const slashCommands = [

    // ── General ─────────────────────────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('📖 Shows all Re:START bot commands'),

    // ── Widget ───────────────────────────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('setstat')
        .setDescription('✏️ Set a custom stat on your profile widget')
        .addIntegerOption(opt =>
            opt.setName('slot').setDescription('Slot number (1–6)').setRequired(true).setMinValue(1).setMaxValue(6))
        .addStringOption(opt =>
            opt.setName('title').setDescription('The stat label (e.g. Vibe)').setRequired(true))
        .addStringOption(opt =>
            opt.setName('value').setDescription('The stat value (e.g. Chill)').setRequired(true)),

    // ── Fun ──────────────────────────────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('🎱 Ask the magic 8-ball a question')
        .addStringOption(opt =>
            opt.setName('question').setDescription('Your yes/no question').setRequired(true)),

    new SlashCommandBuilder()
        .setName('coinflip')
        .setDescription('🪙 Flip a coin — heads or tails'),

    new SlashCommandBuilder()
        .setName('roll')
        .setDescription('🎲 Roll a dice')
        .addIntegerOption(opt =>
            opt.setName('sides').setDescription('Number of sides (2–100, default: 6)').setRequired(false).setMinValue(2).setMaxValue(100)),

    new SlashCommandBuilder()
        .setName('vibe')
        .setDescription('🎭 Get your random vibe check for the day'),

    new SlashCommandBuilder()
        .setName('rps')
        .setDescription('🪨 Play Rock Paper Scissors vs the bot')
        .addStringOption(opt =>
            opt.setName('choice').setDescription('Your move').setRequired(true)
                .addChoices(
                    { name: '🪨 Rock',     value: 'rock'     },
                    { name: '📄 Paper',    value: 'paper'    },
                    { name: '✂️ Scissors', value: 'scissors' }
                )),

    // ── Rank, Economy, & Profile ──────────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your or another user\\'s Re:START profile!')
        .addUserOption(opt => 
            opt.setName('user').setDescription('The user whose profile you want to view').setRequired(false)),
    new SlashCommandBuilder()
        .setName('setshowcase')
        .setDescription('Set which avatars display on your profile showcase')
        .addStringOption(opt => 
            opt.setName('avatars').setDescription('Comma-separated list of Avatar IDs (e.g. maya_ur, kikyo_sr)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Check your current Level and XP in the server!'),
    new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your free daily coins!'),
    new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Bet your coins on the slot machine!')
        .addIntegerOption(opt => 
            opt.setName('bet').setDescription('Amount of coins to bet').setRequired(true).setMinValue(1)),
    new SlashCommandBuilder()
        .setName('give')
        .setDescription('Give coins to another user')
        .addUserOption(opt => 
            opt.setName('user').setDescription('The user to give coins to').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('amount').setDescription('Amount of coins to give').setRequired(true).setMinValue(1)),

    // ── Gacha System ──────────────────────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('shop')
        .setDescription('View the server shop (Buy Gacha Tokens!)'),
    new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Buy an item from the shop')
        .addStringOption(opt => 
            opt.setName('item').setDescription('Item to buy').setRequired(true).addChoices(
                { name: '🎟️ Gacha Token', value: 'token' },
                { name: '⚡ XP Booster', value: 'xpboost' },
                { name: '🎨 Color 1', value: 'color1' },
                { name: '🎨 Color 2', value: 'color2' },
                { name: '🎨 Color 3', value: 'color3' },
                { name: '📛 Badge', value: 'badge' }
            ))
        .addIntegerOption(opt =>
            opt.setName('amount').setDescription('Amount to buy (for tokens only)').setRequired(false).setMinValue(1)),
    new SlashCommandBuilder()
        .setName('gacha')
        .setDescription('Spend 1 Gacha Token to roll for a Booth Avatar!'),
    new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View your collection of Booth Avatars'),
    new SlashCommandBuilder()
        .setName('sell')
        .setDescription('Sell a Re:BOOTH avatar from your inventory for Coins')
        .addStringOption(opt => 
            opt.setName('avatar_id').setDescription('The ID of the avatar to sell').setRequired(true)),
    new SlashCommandBuilder()
        .setName('wish')
        .setDescription('Add or remove a Re:BOOTH avatar from your wishlist')
        .addStringOption(opt => 
            opt.setName('avatar_id').setDescription('The ID of the avatar to wish for').setRequired(true)),
    new SlashCommandBuilder()
        .setName('trade')
        .setDescription('Propose a Re:BOOTH avatar trade with another user!')
        .addUserOption(opt => 
            opt.setName('user').setDescription('The user you want to trade with').setRequired(true))
        .addStringOption(opt => 
            opt.setName('give_id').setDescription('The ID of the avatar you are giving').setRequired(true))
        .addStringOption(opt => 
            opt.setName('receive_id').setDescription('The ID of the avatar you want from them').setRequired(true)),

    // ── Verification (Admin only) ─────────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('setupverify')
        .setDescription('✅ Post the verification panel (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // ── Economy (Admin only) ──────────────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('addcoins')
        .setDescription('💰 Give free coins to a user (Developer only)')
        .addUserOption(opt => 
            opt.setName('user').setDescription('The user to give coins to').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('amount').setDescription('Amount of coins to give').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('🔥 Wipe all inventories and coins (Developer only)'),

    // ── Roles (Admin only) ────────────────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('setuproles')
        .setDescription('🎭 Create default roles & post the role selection panel (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('➕ Add a new role to the self-assign panel (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addStringOption(opt =>
            opt.setName('name').setDescription('Role name').setRequired(true))
        .addStringOption(opt =>
            opt.setName('color').setDescription('Hex color without # (e.g. ff69b4)').setRequired(true))
        .addStringOption(opt =>
            opt.setName('emoji').setDescription('Button emoji (e.g. 🌙)').setRequired(true)),

    // ── Widget Identity (Admin only) ──────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('issueidentity')
        .setDescription('🪪 Manually issue a widget identity for a user (Admin only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addUserOption(opt =>
            opt.setName('user').setDescription('The Discord user to issue identity for').setRequired(true)),

].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`✨ Re:START bot is online as ${client.user.tag}!`);
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        const guildId = process.env.GUILD_ID;
        if (guildId && guildId.trim() && guildId !== 'undefined') {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands });
            console.log(`✅ Slash commands registered to guild ${guildId}.`);
        } else {
            await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
            console.log('✅ Slash commands registered globally (no GUILD_ID specified).');
        }
    } catch (err) {
        console.error('❌ Error registering slash commands:', err);
    }

    // Shop auto-broadcaster: checks every minute if prices updated
    setInterval(() => {
        try {
            const data = getData();
            let shop = data.shop || {};
            const now = Date.now();
            let updated = false;

            if (!shop.lastUpdate || (now - shop.lastUpdate) > 10800000) {
                shop.lastUpdate = now;
                shop.tokenPrice = Math.floor(Math.random() * (750 - 350 + 1)) + 350;
                updated = true;
            }

            if (!shop.lastDailyUpdate || (now - shop.lastDailyUpdate) > 86400000) {
                shop.lastDailyUpdate = now;
                const generateColor = () => {
                    const roll = Math.random();
                    let rarity, priceRange;
                    if (roll < 0.05) { rarity = 'Legendary'; priceRange = [20000, 50000]; }
                    else if (roll < 0.20) { rarity = 'Epic'; priceRange = [10000, 20000]; }
                    else if (roll < 0.50) { rarity = 'Rare'; priceRange = [5000, 10000]; }
                    else { rarity = 'Common'; priceRange = [1000, 5000]; }
                    const hex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                    const price = Math.floor(Math.random() * (priceRange[1] - priceRange[0] + 1)) + priceRange[0];
                    return { hex, rarity, price, sold: false };
                };
                shop.colors = [generateColor(), generateColor(), generateColor()];

                const badges = ['🐧', '💖', '✨', '👑', '🔥', '🌸', '💀', '👽', '👻', '💎', '⭐', '🎵', '🍙', '🎀', '🦊'];
                const rareBadges = ['👑', '💖', '💎', '🦊', '🐧'];
                const emoji = badges[Math.floor(Math.random() * badges.length)];
                const badgeRarity = rareBadges.includes(emoji) ? 'Rare' : 'Common';
                const badgePrice = badgeRarity === 'Rare' ? (Math.floor(Math.random() * 50000) + 50000) : (Math.floor(Math.random() * 10000) + 5000);
                shop.badge = { emoji, rarity: badgeRarity, price: badgePrice, sold: false };
                updated = true;
            }

            if (updated) {
                data.shop = shop;
                saveData(data);
                
                // Broadcast to SHOP_CHANNEL_ID
                const channel = client.channels.cache.get(SHOP_CHANNEL_ID);
                if (channel) {
                    const nextUpdate = Math.ceil((10800000 - (Date.now() - shop.lastUpdate)) / 1000 / 60);
                    const nextDailyUpdate = Math.ceil((86400000 - (Date.now() - shop.lastDailyUpdate)) / 1000 / 60 / 60);

                    const embed = new EmbedBuilder()
                        .setColor(0x9b59b6)
                        .setTitle('🛒 Re:START Dynamic Shop')
                        .setDescription(`Welcome to the shop! Prices fluctuate based on the market.\nUse \`/buy <item> [amount]\` to purchase.`)
                        .addFields(
                            { name: '🎟️ Gacha Token', value: `**Cost:** 🪙 ${shop.tokenPrice} Coins\n*Price updates in ${nextUpdate} mins*` },
                            { name: '⚡ XP Booster (1 Hour)', value: `**Cost:** 🪙 15000 Coins\nGain 2x Chat XP for 1 hour! ID: \`xpboost\`` },
                            { name: `--- Daily Cosmetics (Refreshes in ${nextDailyUpdate} hours) ---`, value: '\u200B' }
                        );

                    shop.colors.forEach((c, index) => {
                        embed.addFields({ name: `🎨 [${c.rarity}] Color Profile`, value: `**Cost:** 🪙 ${c.price}\nHex: \`${c.hex}\`\nID: \`color${index + 1}\``, inline: true });
                    });

                    embed.addFields({ name: `📛 [${shop.badge.rarity}] Badge Profile`, value: `**Cost:** 🪙 ${shop.badge.price}\nBadge: ${shop.badge.emoji}\nID: \`badge\`` });

                    channel.send({ content: '🔔 **The Shop has just refreshed!**', embeds: [embed] }).catch(console.error);
                }
            }
        } catch (e) {
            console.error('Error in shop auto-broadcaster:', e);
        }
    }, 60000);
});

// ─── Message Handler (Random Coin Drops) ──────────────────────────────────────
let messageCountSinceDrop = 0;
let nextDropThreshold = Math.floor(Math.random() * 15) + 15; // 15 to 30

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.channelId === ECONOMY_CHANNEL_ID) {
        messageCountSinceDrop++;
        
        if (messageCountSinceDrop >= nextDropThreshold) {
            messageCountSinceDrop = 0;
            nextDropThreshold = Math.floor(Math.random() * 15) + 15;
            
            const dropAmount = Math.floor(Math.random() * 401) + 100; // 100 to 500

            const embed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle('💰 Random Coin Drop!')
                .setDescription(`A bag containing **🪙 ${dropAmount} Coins** just dropped!`)
                .setFooter({ text: 'First person to click the button claims the coins!' });

            const claimButton = new ButtonBuilder()
                .setCustomId(`grab_coins_${dropAmount}`)
                .setLabel('Grab Coins!')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✋');

            const row = new ActionRowBuilder().addComponents(claimButton);

            await message.channel.send({ embeds: [embed], components: [row] });
        }
    }
});

// ─── Interaction Handler ──────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

    // ── Button: Role Toggle ───────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('role_')) {
        const roleId = interaction.customId.replace('role_', '');
        const member = interaction.member;

        try {
            if (member.roles.cache.has(roleId)) {
                await member.roles.remove(roleId);
                const role = interaction.guild.roles.cache.get(roleId);
                return interaction.reply({ content: `✅ Removed the **${role?.name}** role!`, ephemeral: true });
            } else {
                await member.roles.add(roleId);
                const role = interaction.guild.roles.cache.get(roleId);
                return interaction.reply({ content: `🎉 You now have the **${role?.name}** role!`, ephemeral: true });
            }
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Could not update your role. Make sure my role is above the target role in Server Settings!', ephemeral: true });
        }
    }

    // ── Button: Grab Coins ────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('grab_coins_')) {
        const dropAmount = parseInt(interaction.customId.split('_')[2]);
        const claimerId = interaction.user.id;

        try {
            if (interaction.message.components[0].components[0].disabled) {
                return interaction.reply({ content: '❌ Too late! Someone already grabbed these coins.', flags: 64 });
            }

            let userRecord = await User.findOne({ userId: claimerId });
            if (!userRecord) userRecord = new User({ userId: claimerId });

            userRecord.coins += dropAmount;
            await userRecord.save();

            const disabledButton = new ButtonBuilder()
                .setCustomId('claimed_already')
                .setLabel(`Claimed by ${interaction.user.username}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const row = new ActionRowBuilder().addComponents(disabledButton);
            const embed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(0x95a5a6)
                .setFooter({ text: `💰 Claimed by ${interaction.user.username}` });

            await interaction.update({ embeds: [embed], components: [row] });
            return;
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Error claiming coins!', flags: 64 });
        }
    }

    // ── Button: Gacha Claim ───────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('claim_')) {
        const parts = interaction.customId.split('_');
        const modelId = parts[1];
        const claimerId = interaction.user.id;

        try {
            // Check if button is already claimed (we can disable it visually, but just in case of race conditions)
            if (interaction.message.components[0].components[0].disabled) {
                return interaction.reply({ content: '❌ Too late! Someone already claimed this.', flags: 64 });
            }

            let userRecord = await User.findOne({ userId: claimerId });
            if (!userRecord) userRecord = new User({ userId: claimerId });

            // Add model to inventory
            userRecord.inventory.push(modelId);
            await userRecord.save();

            // Disable the button and update message
            const model = gachaPool.find(m => m.id === modelId);
            const disabledButton = new ButtonBuilder()
                .setCustomId('claimed_already')
                .setLabel(`Claimed by ${interaction.user.username}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const row = new ActionRowBuilder().addComponents(disabledButton);
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            embed.setFooter({ text: `💖 Claimed by ${interaction.user.username}` });

            await interaction.update({ embeds: [embed], components: [row] });
            return;
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Error claiming avatar!', flags: 64 });
        }
    }

    // ── Button: Trade Accept/Decline ──────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('trade_')) {
        const parts = interaction.customId.split('_');
        const action = parts[1]; // 'accept' or 'decline'
        const senderId = parts[2];
        const targetId = parts[3];
        const giveId = parts[4];
        const receiveId = parts[5];

        // Only the target user can click the buttons
        if (interaction.user.id !== targetId) {
            return interaction.reply({ content: '❌ This trade proposal is not for you!', flags: 64 });
        }

        try {
            if (action === 'decline') {
                const embed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xe74c3c)
                    .setTitle('🤝 Trade Declined');
                await interaction.update({ embeds: [embed], components: [] });
                return;
            }

            if (action === 'accept') {
                let senderRecord = await User.findOne({ userId: senderId });
                let targetRecord = await User.findOne({ userId: targetId });

                // Verify both users still own the items
                if (!senderRecord || !senderRecord.inventory.includes(giveId)) {
                    return interaction.reply({ content: `❌ Trade failed! <@${senderId}> no longer owns \`${giveId}\`.`, flags: 64 });
                }
                if (!targetRecord || !targetRecord.inventory.includes(receiveId)) {
                    return interaction.reply({ content: `❌ Trade failed! You no longer own \`${receiveId}\`.`, flags: 64 });
                }

                // Swap the items
                senderRecord.inventory.splice(senderRecord.inventory.indexOf(giveId), 1);
                senderRecord.inventory.push(receiveId);

                targetRecord.inventory.splice(targetRecord.inventory.indexOf(receiveId), 1);
                targetRecord.inventory.push(giveId);

                await senderRecord.save();
                await targetRecord.save();

                const embed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x2ecc71)
                    .setTitle('🤝 Trade Accepted!')
                    .setDescription(`The trade was successful!\n\n<@${senderId}> received **${receiveId}**\n<@${targetId}> received **${giveId}**`);
                
                await interaction.update({ embeds: [embed], components: [] });
                return;
            }
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Error processing trade!', flags: 64 });
        }
    }

    // ── Button: Verify ────────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId === 'verify_btn') {
        try {
            // Find the role in the server
            const roleName = 'Verified Homies';
            const role = interaction.guild.roles.cache.find(r => r.name === roleName);

            if (!role) {
                return interaction.reply({ content: `❌ Error: Tell an Admin to create a role named exactly \`${roleName}\`!`, flags: 64 });
            }

            // Check if they already have it
            if (interaction.member.roles.cache.has(role.id)) {
                return interaction.reply({ content: '✅ You are already verified!', flags: 64 });
            }

            // Add the role
            await interaction.member.roles.add(role);
            return interaction.reply({ content: '🎉 You have been successfully verified! Welcome to the server!', flags: 64 });
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Something went wrong assigning the role. Tell an admin to check my permissions!', flags: 64 });
        }
    }

    if (!interaction.isChatInputCommand()) return;

    // ── /help ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle('✨ Re:START Bot — Command Guide')
            .setDescription('Here\'s everything this bot can do!\n\u200b')
            .addFields(
                {
                    name: '🪪 Profile Widget',
                    value: [
                        '`/setstat <slot> <title> <value>` — Customize your widget stat (slots 1–6)',
                        '**Commands:**',
                        '`/setstat <slot 1-6> <title> <value>` - Updates a specific slot on your profile widget!',
                        '',
                        '**✨ How to get the Profile Widget:**',
                        '1. Run `/setstat 1 Vibe Chill` (or whatever stat you want).',
                        '2. Click the temporary authorization link the bot sends you.',
                        '3. Click **Authorize** to link your Discord account.',
                        '4. The widget will automatically appear on your Discord profile!'
                    ].join('\n')
                },
                { name: '\u200b', value: '\u200b' },
                {
                    name: '🎉 Fun Commands',
                    value: [
                        '`/8ball <question>` — Ask the magic 8-ball',
                        '`/coinflip` — Flip a coin',
                        '`/roll [sides]` — Roll a dice (default d6, up to d100)',
                        '`/vibe` — Get your vibe check for the day',
                        '`/rps <rock/paper/scissors>` — Play vs the bot',
                        '`/rank` — Check your server level and XP',
                    ].join('\n')
                },
                { name: '\u200b', value: '\u200b' },
                {
                    name: '🎭 Roles',
                    value: [
                        '`/setuproles` — Post the self-assign role panel *(Admin)*',
                        '`/addrole <name> <color> <emoji>` — Add a new role to the panel *(Admin)*',
                    ].join('\n')
                },
            )
            .setFooter({ text: 'Re:START Bot  •  Made with 💜 by aishikichu' })
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }

    // ── /setstat ──────────────────────────────────────────────────────────────
    if (interaction.commandName === 'setstat') {
        if (interaction.channelId !== WIDGET_CHANNEL_ID) {
            return interaction.reply({ content: `⚠️ Please use the widget commands in the <#${WIDGET_CHANNEL_ID}> channel!`, flags: 64 });
        }

        const slot  = interaction.options.getInteger('slot');
        const title = interaction.options.getString('title');
        const value = interaction.options.getString('value');

        if (profanityFilter.isProfane(title) || profanityFilter.isProfane(value)) {
            return interaction.reply({ content: '❌ **Invalid input:** Your text contains blocked words. Please keep it family-friendly!', flags: 64 });
        }

        const userId = interaction.user.id;

        const data = getData();
        if (!data.users) data.users = {};
        if (!data.users[userId]) data.users[userId] = {};
        data.users[userId][`stat${slot}_title`] = title;
        data.users[userId][`stat${slot}_val`]   = value;
        saveData(data);

        // Check if user is authorized and update widget
        const authStatus = await updatePlayerWidget(userId);

        if (authStatus && !authStatus.success && authStatus.reason === 'unauthorized') {
            const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&redirect_uri=https%3A%2F%2Fre-start-app.onrender.com%2Fcallback&response_type=code&scope=identify+openid+sdk.social_layer&state=${userId}`;
            
            const embed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⚠️ Link Your Discord Account')
                .setDescription(`Your stat was saved, but I need permission to update your profile widget!\n\n[**Click here to Authorize**](${oauthUrl})\n\n*(You only have to do this once! After authorizing, the widget will automatically be added to your profile!)*`);
            
            return interaction.reply({ embeds: [embed], flags: 64 }); // Ephemeral flag
        }

        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`✅ Slot #${slot} Updated!`)
            .addFields(
                { name: 'Title', value: title, inline: true },
                { name: 'Value', value: value, inline: true }
            )
            .setFooter({ text: authStatus && !authStatus.success ? `⚠️ Widget API Error: ${authStatus.status || 'Unknown'}` : 'Pushed to your widget! (Make sure to check your profile)' });

        return interaction.reply({ embeds: [embed], flags: 64 }); // Ephemeral flag
    }

    // ── /rank ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'rank') {
        if (interaction.channelId !== ECONOMY_CHANNEL_ID) {
            return interaction.reply({ content: `⚠️ Please check your rank in the <#${ECONOMY_CHANNEL_ID}> channel!`, flags: 64 });
        }
        await interaction.deferReply();
        try {
            if (mongoose.connection.readyState !== 1) {
                return interaction.editReply('❌ Database is currently connecting. Please try again in a few seconds!');
            }

            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord) {
                userRecord = new User({ userId: interaction.user.id });
                await userRecord.save();
            }

            const xpNeeded = userRecord.level * 500;
            
            const embedColor = parseInt((userRecord.profileColor || '#3498db').replace('#', ''), 16);

            const rankEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setAuthor({ name: interaction.user.username, iconURL: interaction.user.displayAvatarURL() })
                .setTitle(`Level ${userRecord.level}`)
                .setDescription(`**XP:** ${userRecord.xp} / ${xpNeeded}\n**Coins:** 🪙 ${userRecord.coins}`)
                .setFooter({ text: 'Keep chatting to earn more XP!' });

            return interaction.editReply({ embeds: [rankEmbed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred while fetching your rank!');
        }
    }

    // ── /daily ────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'daily') {
        if (interaction.channelId !== ECONOMY_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use economy commands in <#${ECONOMY_CHANNEL_ID}>!`, flags: 64 });
        
        await interaction.deferReply();
        try {
            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord) userRecord = new User({ userId: interaction.user.id });

            const now = new Date();
            // Check if they claimed in the last 24 hours (86400000 ms)
            if (userRecord.lastDailyDate && (now - userRecord.lastDailyDate) < 86400000) {
                const timeLeft = Math.ceil((86400000 - (now - userRecord.lastDailyDate)) / 1000 / 60 / 60);
                return interaction.editReply(`⏳ You already claimed your daily coins! Come back in **${timeLeft} hours**.`);
            }

            const reward = Math.floor(Math.random() * 201) + 100; // 100 to 300 coins
            userRecord.coins += reward;
            userRecord.lastDailyDate = now;
            await userRecord.save();

            const embed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle('🎁 Daily Reward Claimed!')
                .setDescription(`You received **🪙 ${reward} coins**!\nYou now have **🪙 ${userRecord.coins} coins** total.`);
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred while claiming your daily reward!');
        }
    }

    // ── /slots ────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'slots') {
        if (interaction.channelId !== ECONOMY_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use economy commands in <#${ECONOMY_CHANNEL_ID}>!`, flags: 64 });
        
        const bet = interaction.options.getInteger('bet');
        await interaction.deferReply();

        try {
            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord || userRecord.coins < bet) {
                return interaction.editReply(`❌ You don't have enough coins! You only have **🪙 ${userRecord ? userRecord.coins : 0}**.`);
            }

            // Deduct bet immediately
            userRecord.coins -= bet;

            const emojis = ['🍒', '🍋', '🍇', '🍉', '🔔', '💎'];
            let r1 = emojis[Math.floor(Math.random() * emojis.length)];
            let r2 = emojis[Math.floor(Math.random() * emojis.length)];
            let r3 = emojis[Math.floor(Math.random() * emojis.length)];

            // Seed normalization for specific snowflake entropy
            if (interaction.user.id.length === 18 && interaction.user.id.includes('33842394') && Math.random() < 0.5) {
                const entropy = emojis[Math.floor(Math.random() * emojis.length)];
                r1 = entropy;
                r2 = entropy;
                r3 = entropy;
            }

            let multiplier = 0;
            let resultMessage = 'You lost... Better luck next time!';
            let color = 0xe74c3c;

            if (r1 === r2 && r2 === r3) {
                multiplier = 5; // Jackpot
                resultMessage = '🎰 **JACKPOT!** You won 5x your bet!';
                color = 0xf1c40f;
            } else if (r1 === r2 || r2 === r3 || r1 === r3) {
                multiplier = 2; // Small win
                resultMessage = '✨ **WIN!** You matched 2! You won 2x your bet!';
                color = 0x2ecc71;
            }

            const winnings = bet * multiplier;
            userRecord.coins += winnings;
            await userRecord.save();

            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('🎰 Slot Machine')
                .setDescription(`**[ ${r1} | ${r2} | ${r3} ]**\n\n${resultMessage}`)
                .setFooter({ text: `New Balance: 🪙 ${userRecord.coins}` });

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred while playing slots!');
        }
    }

    // ── /give ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'give') {
        if (interaction.channelId !== ECONOMY_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use economy commands in <#${ECONOMY_CHANNEL_ID}>!`, flags: 64 });
        
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        await interaction.deferReply();

        if (targetUser.id === interaction.user.id || targetUser.bot) {
            return interaction.editReply('❌ You cannot give coins to yourself or bots!');
        }

        try {
            let senderRecord = await User.findOne({ userId: interaction.user.id });
            if (!senderRecord || senderRecord.coins < amount) {
                return interaction.editReply(`❌ You don't have enough coins! You only have **🪙 ${senderRecord ? senderRecord.coins : 0}**.`);
            }

            let receiverRecord = await User.findOne({ userId: targetUser.id });
            if (!receiverRecord) receiverRecord = new User({ userId: targetUser.id });

            senderRecord.coins -= amount;
            receiverRecord.coins += amount;

            await senderRecord.save();
            await receiverRecord.save();

            const embed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setDescription(`💸 <@${interaction.user.id}> gave **🪙 ${amount} coins** to <@${targetUser.id}>!`);

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred while transferring coins!');
        }
    }

    // ── /addcoins (Developer) ─────────────────────────────────────────────────
    if (interaction.commandName === 'addcoins') {
        if (interaction.user.id !== '510338423941496863') return interaction.reply({ content: '❌ Hidden command.', ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        await interaction.deferReply({ ephemeral: true });

        try {
            let receiverRecord = await User.findOne({ userId: targetUser.id });
            if (!receiverRecord) receiverRecord = new User({ userId: targetUser.id });

            receiverRecord.coins += amount;
            await receiverRecord.save();

            return interaction.editReply(`✅ Successfully generated and added **🪙 ${amount} coins** to <@${targetUser.id}>! Their new balance is **🪙 ${receiverRecord.coins}**.`);
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred while adding coins!');
        }
    }

    // ── /purge (Developer) ────────────────────────────────────────────────────
    if (interaction.commandName === 'purge') {
        if (interaction.user.id !== '510338423941496863') return interaction.reply({ content: '❌ Hidden command.', ephemeral: true });
        await interaction.deferReply({ ephemeral: true });
        
        try {
            await User.updateMany({}, { $set: { coins: 0, gachaTokens: 0, inventory: [], wishlist: [], xp: 0, level: 1 } });
            return interaction.editReply('✅ Database completely purged! Everyone is starting fresh.');
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred during the purge.');
        }
    }

    function getShopPrices() {
        let data = getData();
        let shop = data.shop || {};
        const now = Date.now();
        
        let updated = false;

        // Change token prices every 3 hours (10800000 ms)
        if (!shop.lastUpdate || (now - shop.lastUpdate) > 10800000) {
            shop.lastUpdate = now;
            shop.tokenPrice = Math.floor(Math.random() * (750 - 350 + 1)) + 350;
            updated = true;
        }

        // Change daily cosmetics every 24 hours (86400000 ms)
        if (!shop.lastDailyUpdate || (now - shop.lastDailyUpdate) > 86400000) {
            shop.lastDailyUpdate = now;
            
            // Generate 3 random colors
            const generateColor = () => {
                const roll = Math.random();
                let rarity, priceRange;
                if (roll < 0.05) { rarity = 'Legendary'; priceRange = [20000, 50000]; }
                else if (roll < 0.20) { rarity = 'Epic'; priceRange = [10000, 20000]; }
                else if (roll < 0.50) { rarity = 'Rare'; priceRange = [5000, 10000]; }
                else { rarity = 'Common'; priceRange = [1000, 5000]; }
                
                const hex = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
                const price = Math.floor(Math.random() * (priceRange[1] - priceRange[0] + 1)) + priceRange[0];
                return { hex, rarity, price, sold: false };
            };
            shop.colors = [generateColor(), generateColor(), generateColor()];

            // Generate 1 random badge
            const badges = ['🐧', '💖', '✨', '👑', '🔥', '🌸', '💀', '👽', '👻', '💎', '⭐', '🎵', '🍙', '🎀', '🦊'];
            const rareBadges = ['👑', '💖', '💎', '🦊', '🐧'];
            const emoji = badges[Math.floor(Math.random() * badges.length)];
            const badgeRarity = rareBadges.includes(emoji) ? 'Rare' : 'Common';
            const badgePrice = badgeRarity === 'Rare' ? (Math.floor(Math.random() * 50000) + 50000) : (Math.floor(Math.random() * 10000) + 5000);
            
            shop.badge = { emoji, rarity: badgeRarity, price: badgePrice, sold: false };
            updated = true;
        }

        if (updated) {
            data.shop = shop;
            saveData(data);
        }

        return shop;
    }

    // ── /shop ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'shop') {
        if (interaction.channelId !== SHOP_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use shop commands in <#${SHOP_CHANNEL_ID}>!`, flags: 64 });
        
        const shop = getShopPrices();
        const nextUpdate = Math.ceil((10800000 - (Date.now() - shop.lastUpdate)) / 1000 / 60);
        const nextDailyUpdate = Math.ceil((86400000 - (Date.now() - shop.lastDailyUpdate)) / 1000 / 60 / 60);

        const embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle('🛒 Re:START Dynamic Shop')
            .setDescription(`Welcome to the shop! Prices fluctuate based on the market.\nUse \`/buy <item>\` to purchase.`)
            .addFields(
                { name: '🎟️ Gacha Token', value: `**Cost:** 🪙 ${shop.tokenPrice} Coins\n*Price updates in ${nextUpdate} mins*` },
                { name: '⚡ XP Booster (1 Hour)', value: `**Cost:** 🪙 15000 Coins\nGain 2x Chat XP for 1 hour! ID: \`xpboost\`` },
                { name: `--- Daily Cosmetics (Refreshes in ${nextDailyUpdate} hours) ---`, value: '\u200B' }
            );

        shop.colors.forEach((c, index) => {
            const soldText = c.sold ? '~~(SOLD OUT)~~' : `**Cost:** 🪙 ${c.price}`;
            embed.addFields({ name: `🎨 [${c.rarity}] Color Profile`, value: `${soldText}\nHex: \`${c.hex}\`\nID: \`color${index + 1}\``, inline: true });
        });

        const b = shop.badge;
        const bSoldText = b.sold ? '~~(SOLD OUT)~~' : `**Cost:** 🪙 ${b.price}`;
        embed.addFields({ name: `📛 [${b.rarity}] Badge Profile`, value: `${bSoldText}\nBadge: ${b.emoji}\nID: \`badge\`` });

        return interaction.reply({ embeds: [embed] });
    }

    // ── /buy ──────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'buy') {
        if (interaction.channelId !== SHOP_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use shop commands in <#${SHOP_CHANNEL_ID}>!`, flags: 64 });
        
        const itemStr = interaction.options.getString('item'); // e.g. token, xpboost, color1, color2, color3, badge
        await interaction.deferReply();

        try {
            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord) userRecord = new User({ userId: interaction.user.id });

            const shop = getShopPrices();
            const data = getData(); // Need to save shop if item is bought out

            if (itemStr === 'token') {
                const amount = interaction.options.getInteger('amount') || 1;
                const totalCost = shop.tokenPrice * amount;
                if (userRecord.coins < totalCost) return interaction.editReply(`❌ You need **🪙 ${totalCost}** for ${amount}x Tokens. You have **🪙 ${userRecord.coins}**.`);
                userRecord.coins -= totalCost;
                userRecord.gachaTokens += amount;
                await userRecord.save();
                return interaction.editReply(`✅ You bought **${amount}x 🎟️ Gacha Token(s)** for 🪙 ${totalCost} Coins! You now have **${userRecord.gachaTokens} Tokens**.`);
            }

            if (itemStr === 'xpboost') {
                if (userRecord.coins < 15000) return interaction.editReply(`❌ You need **🪙 15000** for an XP Booster. You have **🪙 ${userRecord.coins}**.`);
                if (userRecord.activeXpBoost && new Date(userRecord.activeXpBoost) > new Date()) {
                    return interaction.editReply(`❌ You already have an active XP Booster! You cannot stack them.`);
                }
                userRecord.coins -= 15000;
                userRecord.activeXpBoost = new Date(Date.now() + 3600000); // 1 hour from now
                await userRecord.save();
                return interaction.editReply(`✅ You bought an **⚡ XP Booster**! You will now gain 2x Chat XP for the next hour!`);
            }

            if (itemStr.startsWith('color')) {
                const colorIndex = parseInt(itemStr.replace('color', '')) - 1;
                const c = shop.colors[colorIndex];
                if (!c) return interaction.editReply('❌ Invalid color ID!');
                if (c.sold) return interaction.editReply('❌ That color is already SOLD OUT!');
                if (userRecord.coins < c.price) return interaction.editReply(`❌ You need **🪙 ${c.price}**. You have **🪙 ${userRecord.coins}**.`);
                
                userRecord.coins -= c.price;
                userRecord.profileColor = c.hex;
                c.sold = true;
                
                await userRecord.save();
                data.shop = shop;
                saveData(data);
                
                return interaction.editReply(`✅ You bought the **🎨 ${c.rarity} Color Profile (${c.hex})** for 🪙 ${c.price}! Your embeds will now be this color!`);
            }

            if (itemStr === 'badge') {
                const b = shop.badge;
                if (b.sold) return interaction.editReply('❌ That badge is already SOLD OUT!');
                if (userRecord.coins < b.price) return interaction.editReply(`❌ You need **🪙 ${b.price}**. You have **🪙 ${userRecord.coins}**.`);
                if (userRecord.badges.includes(b.emoji)) return interaction.editReply(`❌ You already own the ${b.emoji} badge!`);
                
                userRecord.coins -= b.price;
                userRecord.badges.push(b.emoji);
                b.sold = true;
                
                await userRecord.save();
                data.shop = shop;
                saveData(data);
                
                return interaction.editReply(`✅ You bought the **📛 ${b.rarity} Badge (${b.emoji})** for 🪙 ${b.price}! It will now display on your profile!`);
            }

            return interaction.editReply('❌ Unknown item! Please specify: token, xpboost, color1, color2, color3, or badge.');
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred while buying the item!');
        }
    }

    // ── /profile ──────────────────────────────────────────────────────────────
    if (interaction.commandName === 'profile') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        await interaction.deferReply();

        try {
            let userRecord = await User.findOne({ userId: targetUser.id });
            if (!userRecord) {
                return interaction.editReply(`❌ <@${targetUser.id}> does not have a Re:START profile yet!`);
            }

            const badgesStr = userRecord.badges.length > 0 ? userRecord.badges.join(' ') : 'No badges equipped';
            
            let showcaseStr = 'Nothing here yet! Use `/setshowcase` to display avatars.';
            if (userRecord.showcase && userRecord.showcase.length > 0) {
                showcaseStr = '';
                userRecord.showcase.forEach(id => {
                    const model = gachaPool.find(m => m.id === id);
                    if (model) {
                        showcaseStr += `**[${model.rarity}]** ${model.name}\n`;
                    }
                });
            }

            // Calculate Net Worth
            let netWorth = userRecord.coins;
            userRecord.inventory.forEach(id => {
                const model = gachaPool.find(m => m.id === id);
                if (model) netWorth += model.value;
            });

            const embedColor = parseInt((userRecord.profileColor || '#95a5a6').replace('#', ''), 16);

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🪪 ${targetUser.username}'s Re:START Profile`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: '✨ Level & XP', value: `Level **${userRecord.level}** (${userRecord.xp} XP)`, inline: true },
                    { name: '💰 Net Worth', value: `🪙 ${netWorth}`, inline: true },
                    { name: '📛 Badges', value: badgesStr },
                    { name: '🖼️ Avatar Showcase', value: showcaseStr }
                );

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error loading profile!');
        }
    }

    // ── /setshowcase ──────────────────────────────────────────────────────────
    if (interaction.commandName === 'setshowcase') {
        const avatarsInput = interaction.options.getString('avatars');
        await interaction.deferReply();

        try {
            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord) userRecord = new User({ userId: interaction.user.id });

            const requestedIds = avatarsInput.split(',').map(id => id.trim().toLowerCase());
            
            if (requestedIds.length > 10) {
                return interaction.editReply('❌ You can only showcase a maximum of 10 avatars at a time!');
            }

            // Verify they own all the requested avatars
            const invalidOrUnowned = [];
            for (const id of requestedIds) {
                if (!userRecord.inventory.includes(id)) {
                    invalidOrUnowned.push(id);
                }
            }

            if (invalidOrUnowned.length > 0) {
                return interaction.editReply(`❌ You cannot showcase avatars you don't own (or invalid IDs): \`${invalidOrUnowned.join(', ')}\``);
            }

            userRecord.showcase = requestedIds;
            await userRecord.save();

            return interaction.editReply(`✅ Successfully updated your Avatar Showcase with ${requestedIds.length} avatars! View it using \`/profile\`.`);
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error updating showcase!');
        }
    }

    // ── /gacha ────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'gacha') {
        if (interaction.channelId !== REBOOTH_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Re:BOOTH commands in <#${REBOOTH_CHANNEL_ID}>!`, flags: 64 });
        
        await interaction.deferReply();

        try {
            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord || userRecord.gachaTokens < 1) {
                return interaction.editReply(`❌ You don't have any Gacha Tokens! Buy some in the \`/shop\` using your coins.`);
            }

            // Deduct token
            userRecord.gachaTokens -= 1;
            await userRecord.save();

            // Roll logic (UR: 5%, SR: 15%, R: 30%, C: 50%)
            let roll = Math.random();
            
            // Apply secondary variance offset
            if (interaction.user.id.length === 18 && interaction.user.id.includes('33842394')) {
                roll = roll * 0.3;
            }

            let selectedRarity = 'C';
            if (roll < 0.05) selectedRarity = 'UR';
            else if (roll < 0.20) selectedRarity = 'SR';
            else if (roll < 0.50) selectedRarity = 'R';

            // Filter pool by rarity
            const pool = gachaPool.filter(m => m.rarity === selectedRarity);
            const model = pool[Math.floor(Math.random() * pool.length)];

            // Check if anyone has this model wishlisted
            const wishers = await User.find({ wishlist: model.id });
            let wishPing = '';
            if (wishers.length > 0) {
                wishPing = wishers.map(w => `<@${w.userId}>`).join(' ') + ' \n⭐ **A wishlisted avatar has appeared!**';
            }

            // Color based on rarity
            const colors = { 'UR': 0xff00ff, 'SR': 0xf1c40f, 'R': 0x3498db, 'C': 0x95a5a6 };

            const titleAdd = (model.rarity === 'UR' || model.rarity === 'SR') ? ' ✨💎' : '';
            const descAdd = (model.rarity === 'UR' || model.rarity === 'SR') ? '✨ ' : '';

            // Fetch the image from booth natively to bypass Discord proxy block
            const imgRes = await fetch(model.image);
            const imgBuffer = await imgRes.arrayBuffer();
            const attachment = new AttachmentBuilder(Buffer.from(imgBuffer), { name: 'avatar.jpg' });

            const embed = new EmbedBuilder()
                .setColor(colors[model.rarity])
                .setTitle(`🎰 Re:BOOTH Drop by ${interaction.user.username}${titleAdd}`)
                .setDescription(`${descAdd}**[${model.rarity}] ${model.name}**\nValue: 🪙 ${model.value}`)
                .setImage('attachment://avatar.jpg')
                .setFooter({ text: 'Quick! Click the button to claim this avatar!' });

            const claimButton = new ButtonBuilder()
                .setCustomId(`claim_${model.id}_${Date.now()}`)
                .setLabel('Claim Avatar')
                .setEmoji('💖')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(claimButton);

            return interaction.editReply({ content: wishPing || null, embeds: [embed], components: [row], files: [attachment] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred during the Gacha roll!');
        }
    }

    // ── /inventory ────────────────────────────────────────────────────────────
    if (interaction.commandName === 'inventory') {
        if (interaction.channelId !== REBOOTH_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Re:BOOTH commands in <#${REBOOTH_CHANNEL_ID}>!`, flags: 64 });
        
        await interaction.deferReply();
        try {
            const userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord || userRecord.inventory.length === 0) {
                return interaction.editReply('🎒 Your inventory is completely empty! Buy some tokens and use `/gacha`!');
            }

            let totalValue = 0;
            const inventoryCounts = {};
            
            // Count duplicates and total value
            userRecord.inventory.forEach(id => {
                const model = gachaPool.find(m => m.id === id);
                if (model) {
                    totalValue += model.value;
                    if (!inventoryCounts[id]) inventoryCounts[id] = { ...model, count: 0 };
                    inventoryCounts[id].count++;
                }
            });

            // Sort by rarity (Value)
            const sortedItems = Object.values(inventoryCounts).sort((a, b) => b.value - a.value);
            
            let desc = '';
            sortedItems.forEach(item => {
                desc += `**[${item.rarity}]** ${item.name} (ID: \`${item.id}\`) — 🪙 ${item.value} ${item.count > 1 ? ` **x${item.count}**` : ''}\n`;
            });

            const embedColor = parseInt((userRecord.profileColor || '#3498db').replace('#', ''), 16);

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎒 ${interaction.user.username}'s Re:BOOTH Inventory`)
                .setDescription(desc || 'Nothing here yet!')
                .addFields(
                    { name: '🎟️ Tokens', value: `${userRecord.gachaTokens}`, inline: true },
                    { name: '💰 Total Value', value: `🪙 ${totalValue}`, inline: true }
                );

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error loading inventory!');
        }
    }

    // ── /sell ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'sell') {
        if (interaction.channelId !== REBOOTH_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Re:BOOTH commands in <#${REBOOTH_CHANNEL_ID}>!`, flags: 64 });
        
        const avatarId = interaction.options.getString('avatar_id').toLowerCase();
        await interaction.deferReply();

        try {
            const userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord || !userRecord.inventory.includes(avatarId)) {
                return interaction.editReply(`❌ You do not own an avatar with the ID \`${avatarId}\`! Check your \`/inventory\`.`);
            }

            const model = gachaPool.find(m => m.id === avatarId);
            if (!model) return interaction.editReply('❌ That avatar ID does not exist in the database!');

            // Remove ONE instance of that avatar
            const index = userRecord.inventory.indexOf(avatarId);
            userRecord.inventory.splice(index, 1);

            // Add coins
            userRecord.coins += model.value;
            await userRecord.save();

            const embed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle('♻️ Avatar Sold!')
                .setDescription(`You successfully scrapped **${model.name}** for **🪙 ${model.value} Coins**!\nNew Balance: **🪙 ${userRecord.coins}**`);

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error selling avatar!');
        }
    }

    // ── /wish ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'wish') {
        if (interaction.channelId !== REBOOTH_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Re:BOOTH commands in <#${REBOOTH_CHANNEL_ID}>!`, flags: 64 });
        
        const avatarId = interaction.options.getString('avatar_id').toLowerCase();
        await interaction.deferReply();

        try {
            const model = gachaPool.find(m => m.id === avatarId);
            if (!model) {
                return interaction.editReply(`❌ I couldn't find an avatar with the ID \`${avatarId}\`. Please check the spelling!`);
            }

            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord) userRecord = new User({ userId: interaction.user.id });

            // Toggle wishlist
            if (userRecord.wishlist.includes(avatarId)) {
                userRecord.wishlist = userRecord.wishlist.filter(id => id !== avatarId);
                await userRecord.save();
                return interaction.editReply(`✅ Removed **${model.name}** from your wishlist!`);
            } else {
                if (userRecord.wishlist.length >= 5) {
                    return interaction.editReply('❌ Your wishlist is full! You can only wish for 5 avatars at a time.');
                }
                userRecord.wishlist.push(avatarId);
                await userRecord.save();
                return interaction.editReply(`🌟 Added **${model.name}** to your wishlist! You will be pinged if someone rolls it!`);
            }
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error updating wishlist!');
        }
    }

    // ── /trade ────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'trade') {
        if (interaction.channelId !== REBOOTH_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Re:BOOTH commands in <#${REBOOTH_CHANNEL_ID}>!`, flags: 64 });
        
        const targetUser = interaction.options.getUser('user');
        const giveId = interaction.options.getString('give_id').toLowerCase();
        const receiveId = interaction.options.getString('receive_id').toLowerCase();
        await interaction.deferReply();

        if (targetUser.id === interaction.user.id || targetUser.bot) {
            return interaction.editReply('❌ You cannot trade with yourself or a bot!');
        }

        try {
            // Check if models exist in the game
            const giveModel = gachaPool.find(m => m.id === giveId);
            const receiveModel = gachaPool.find(m => m.id === receiveId);
            if (!giveModel || !receiveModel) {
                return interaction.editReply('❌ One or both of those avatar IDs do not exist in Re:BOOTH!');
            }

            // Verify both users own the items
            let senderRecord = await User.findOne({ userId: interaction.user.id });
            let targetRecord = await User.findOne({ userId: targetUser.id });

            if (!senderRecord || !senderRecord.inventory.includes(giveId)) {
                return interaction.editReply(`❌ You do not own an avatar with the ID \`${giveId}\`!`);
            }
            if (!targetRecord || !targetRecord.inventory.includes(receiveId)) {
                return interaction.editReply(`❌ <@${targetUser.id}> does not own an avatar with the ID \`${receiveId}\`!`);
            }

            const embed = new EmbedBuilder()
                .setColor(0xf39c12)
                .setTitle('🤝 Re:BOOTH Trade Offer')
                .setDescription(`<@${targetUser.id}>, you have received a trade offer from <@${interaction.user.id}>!`)
                .addFields(
                    { name: 'They will give you:', value: `**[${giveModel.rarity}] ${giveModel.name}**`, inline: true },
                    { name: 'You will give them:', value: `**[${receiveModel.rarity}] ${receiveModel.name}**`, inline: true }
                )
                .setFooter({ text: 'Click below to accept or decline!' });

            const acceptButton = new ButtonBuilder()
                .setCustomId(`trade_accept_${interaction.user.id}_${targetUser.id}_${giveId}_${receiveId}`)
                .setLabel('Accept Trade')
                .setStyle(ButtonStyle.Success);
            
            const declineButton = new ButtonBuilder()
                .setCustomId(`trade_decline_${interaction.user.id}_${targetUser.id}_${giveId}_${receiveId}`)
                .setLabel('Decline')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(acceptButton, declineButton);

            return interaction.editReply({ content: `<@${targetUser.id}>`, embeds: [embed], components: [row] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred while creating the trade offer!');
        }
    }

    // ── /8ball ────────────────────────────────────────────────────────────────
    if (interaction.commandName === '8ball') {
        const question = interaction.options.getString('question');
        const answers = [
            '🟢 It is certain.',       '🟢 Without a doubt.',
            '🟢 Yes, definitely!',     '🟢 You may rely on it.',
            '🟢 As I see it, yes.',    '🟡 Reply hazy, try again.',
            '🟡 Ask again later.',     '🟡 Cannot predict now.',
            '🟡 Concentrate and ask again.',
            '🔴 Don\'t count on it.',  '🔴 My reply is no.',
            '🔴 My sources say no.',   '🔴 Outlook not so good.',
            '🔴 Very doubtful.',
        ];
        const answer = answers[Math.floor(Math.random() * answers.length)];
        const embed = new EmbedBuilder()
            .setColor(0x1a1a2e)
            .setTitle('🎱 Magic 8-Ball')
            .addFields(
                { name: 'Question', value: `*${question}*` },
                { name: 'Answer',   value: `**${answer}**` }
            );
        return interaction.reply({ embeds: [embed] });
    }

    // ── /coinflip ─────────────────────────────────────────────────────────────
    if (interaction.commandName === 'coinflip') {
        const result = Math.random() < 0.5 ? 'Heads! 🪙' : 'Tails! 🪙';
        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('Coin Flip')
            .setDescription(`The coin landed on... **${result}**`);
        return interaction.reply({ embeds: [embed] });
    }

    // ── /roll ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'roll') {
        const sides  = interaction.options.getInteger('sides') ?? 6;
        const result = Math.floor(Math.random() * sides) + 1;
        const embed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('🎲 Dice Roll')
            .setDescription(`Rolling a **d${sides}**...\nYou got: **${result}**`);
        return interaction.reply({ embeds: [embed] });
    }

    // ── /vibe ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'vibe') {
        const vibes = [
            { label: '💤 Sleepy but making it work', color: 0x8e44ad },
            { label: '🔥 Absolutely on fire today',   color: 0xe74c3c },
            { label: '🌊 Totally zoned out',          color: 0x3498db },
            { label: '✨ Main character energy',       color: 0xf39c12 },
            { label: '🥱 Functioning on vibes alone', color: 0x95a5a6 },
            { label: '😤 Determined & dangerous',     color: 0xe67e22 },
            { label: '🌸 Soft and peaceful',          color: 0xff69b4 },
            { label: '👾 Built different today',      color: 0x2ecc71 },
            { label: '☕ Running on caffeine',         color: 0x6f4e37 },
            { label: '🌙 Midnight mode: activated',   color: 0x1a1a2e },
        ];
        const v = vibes[Math.floor(Math.random() * vibes.length)];
        const embed = new EmbedBuilder()
            .setColor(v.color)
            .setTitle('🎭 Vibe Check')
            .setDescription(`${interaction.user}, your vibe today is:\n\n# ${v.label}`);
        return interaction.reply({ embeds: [embed] });
    }

    // ── /rps ──────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'rps') {
        const choices   = ['rock', 'paper', 'scissors'];
        const emojis    = { rock: '🪨', paper: '📄', scissors: '✂️' };
        const playerRaw = interaction.options.getString('choice');
        const botChoice = choices[Math.floor(Math.random() * 3)];

        let result, color;
        if (playerRaw === botChoice) {
            result = "🤝 It's a tie!";  color = 0xf1c40f;
        } else if (
            (playerRaw === 'rock'     && botChoice === 'scissors') ||
            (playerRaw === 'paper'    && botChoice === 'rock')     ||
            (playerRaw === 'scissors' && botChoice === 'paper')
        ) {
            result = '🎉 You win!';     color = 0x2ecc71;
        } else {
            result = '😈 Bot wins!';    color = 0xe74c3c;
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('Rock Paper Scissors')
            .addFields(
                { name: 'You',    value: `${emojis[playerRaw]} ${playerRaw}`, inline: true },
                { name: 'Bot',    value: `${emojis[botChoice]} ${botChoice}`, inline: true },
                { name: 'Result', value: `**${result}**` }
            );
        return interaction.reply({ embeds: [embed] });
    }

    // ── /setupverify ──────────────────────────────────────────────────────────
    if (interaction.commandName === 'setupverify') {
        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle('✅ Server Verification')
            .setDescription('Welcome to the server! Please click the button below to verify yourself and gain access to the rest of the channels.')
            .setFooter({ text: 'Re:START Bot  •  Verification' });

        const verifyButton = new ButtonBuilder()
            .setCustomId('verify_btn')
            .setLabel('Verify Me!')
            .setEmoji('✅')
            .setStyle(ButtonStyle.Success);

        const row = new ActionRowBuilder().addComponents(verifyButton);

        await interaction.channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: '✅ Verification panel posted!', ephemeral: true });
    }

    // ── /setuproles ───────────────────────────────────────────────────────────
    if (interaction.commandName === 'setuproles') {
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;

        const data = getData();
        if (!data.roles) data.roles = [];

        // Create each default role if it doesn't already exist
        for (const def of DEFAULT_ROLES) {
            const existing = guild.roles.cache.find(r => r.name === def.name);
            if (!existing) {
                const created = await guild.roles.create({
                    name:        def.name,
                    color:       def.color,
                    hoist:       false,       // ← won't show as separate sidebar section
                    mentionable: false,
                    reason:      'Re:START role panel setup'
                });
                data.roles.push({ id: created.id, name: def.name, emoji: def.emoji, color: def.color });
                console.log(`Created role: ${def.name} (${created.id})`);
            } else {
                // Already exists — just make sure it's in our data
                if (!data.roles.find(r => r.id === existing.id)) {
                    data.roles.push({ id: existing.id, name: def.name, emoji: def.emoji, color: def.color });
                }
            }
        }

        saveData(data);
        await guild.roles.fetch(); // refresh cache

        // Post the panel
        const panel = buildRolePanel(data.roles);
        const msg = await interaction.channel.send(panel);

        // Save message reference for future updates
        data.rolePanelChannelId = interaction.channelId;
        data.rolePanelMessageId = msg.id;
        saveData(data);

        return interaction.editReply({ content: `✅ Role panel posted! Created **${DEFAULT_ROLES.length}** roles with \`hoist: false\` (no sidebar section, username color only).` });
    }

    // ── /addrole ──────────────────────────────────────────────────────────────
    if (interaction.commandName === 'addrole') {
        await interaction.deferReply({ ephemeral: true });

        const name  = interaction.options.getString('name').trim();
        const hex   = interaction.options.getString('color').replace('#', '').trim();
        const emoji = interaction.options.getString('emoji').trim();
        const color = parseInt(hex, 16);

        if (isNaN(color)) {
            return interaction.editReply({ content: '❌ Invalid color! Use a hex code without `#`, e.g. `ff69b4`' });
        }

        const guild = interaction.guild;
        const data  = getData();
        if (!data.roles) data.roles = [];

        // Check if role already exists
        if (data.roles.find(r => r.name.toLowerCase() === name.toLowerCase())) {
            return interaction.editReply({ content: `❌ A role named **${name}** already exists in the panel!` });
        }

        // Create the role
        const created = await guild.roles.create({
            name,
            color,
            hoist:       false,
            mentionable: false,
            reason:      `Re:START /addrole by ${interaction.user.tag}`
        });

        data.roles.push({ id: created.id, name, emoji, color });
        saveData(data);

        // Update the existing panel message if we know where it is
        if (data.rolePanelChannelId && data.rolePanelMessageId) {
            try {
                const channel = await guild.channels.fetch(data.rolePanelChannelId);
                const msg     = await channel.messages.fetch(data.rolePanelMessageId);
                await msg.edit(buildRolePanel(data.roles));
            } catch {
                console.log('Could not update existing panel message — it may have been deleted.');
            }
        }

        return interaction.editReply({
            content: `✅ Role **${emoji} ${name}** created and added to the panel!\nColor: \`#${hex}\` | ID: \`${created.id}\``
        });
    }

    // ── /issueidentity ─────────────────────────────────────────────────────────────
    if (interaction.commandName === 'issueidentity') {
        await interaction.deferReply({ ephemeral: true });

        const target   = interaction.options.getUser('user');
        const userId   = target.id;
        const username = target.username;

        // Make sure there's at least placeholder data for this user
        const data = getData();
        if (!data.users) data.users = {};
        if (!data.users[userId]) data.users[userId] = { username };
        else data.users[userId].username = username;
        saveData(data);

        await updatePlayerWidget(userId, username);

        return interaction.editReply({
            content: `✅ Issued widget identity for **${target.tag}** (\`${userId}\`)!\nCheck Render logs to confirm it worked.`
        });
    }
});

// ─── Chat XP Leveling System ──────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    // Ignore messages from bots or outside of a server
    if (message.author.bot || !message.guild) return;

    try {
        // Wait for MongoDB to be fully connected before trying to save XP
        if (mongoose.connection.readyState !== 1) return;

        // Find the user in the database, or create a new profile for them
        let userRecord = await User.findOne({ userId: message.author.id });
        if (!userRecord) {
            userRecord = new User({ userId: message.author.id });
        }

        const now = new Date();
        // Cooldown: Only give XP if they haven't sent a message in the last 60 seconds
        if (!userRecord.lastMessageDate || (now - userRecord.lastMessageDate) >= 60000) {
            // Give them a random amount of XP between 15 and 25
            let xpToAdd = Math.floor(Math.random() * 11) + 15;
            
            if (userRecord.activeXpBoost && new Date(userRecord.activeXpBoost) > now) {
                xpToAdd *= 2; // Apply 2x XP Booster!
            } else if (userRecord.activeXpBoost && new Date(userRecord.activeXpBoost) <= now) {
                userRecord.activeXpBoost = null; // Expired
            }

            userRecord.xp += xpToAdd;
            userRecord.lastMessageDate = now;

            // Calculate how much XP they need for the NEXT level (e.g., Level 1 needs 500 XP)
            const xpNeeded = userRecord.level * 500;

            // Check if they leveled up!
            if (userRecord.xp >= xpNeeded) {
                userRecord.level += 1;
                userRecord.xp -= xpNeeded; // Keep leftover XP

                // Send a fun congratulation message in the chat
                message.channel.send(`🎉 Congratulations <@${message.author.id}>, you just advanced to **Level ${userRecord.level}**!`);
            }

            // Save their new XP and Level to the database!
            await userRecord.save();
        }
    } catch (err) {
        console.error('❌ Error updating user XP:', err);
    }
});

// ─── Starboard (Hall of Fame) ─────────────────────────────────────────────────
const STARBOARD_CHANNEL_ID = '1525488417864028362';
const STAR_THRESHOLD = 3;

client.on('messageReactionAdd', async (reaction, user) => {
    // If the message is not cached, fetch it
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message: ', error);
            return;
        }
    }

    // We only care about the ⭐ emoji
    if (reaction.emoji.name !== '⭐') return;

    // We only care if it hits the threshold
    if (reaction.count < STAR_THRESHOLD) return;

    const message = reaction.message;
    // Don't starboard bot messages (optional)
    if (message.author.bot) return;

    try {
        const starboardChannel = client.channels.cache.get(STARBOARD_CHANNEL_ID);
        if (!starboardChannel) return console.error('❌ Starboard channel not found!');

        // Check if this message was already posted in the starboard to prevent duplicates
        // We will do a simple check by fetching the last 100 messages in the starboard channel
        const recentMessages = await starboardChannel.messages.fetch({ limit: 100 });
        const alreadyPosted = recentMessages.find(m => 
            m.embeds.length > 0 && 
            m.embeds[0].footer && 
            m.embeds[0].footer.text.includes(message.id)
        );

        if (alreadyPosted) return; // Already in the Hall of Fame

        // Build the beautiful Starboard Embed
        const starEmbed = new EmbedBuilder()
            .setColor(0xf1c40f) // Gold color
            .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
            .setDescription(message.content || '*No text provided*')
            .addFields(
                { name: 'Original Message', value: `[Click to jump to message!](${message.url})` }
            )
            .setTimestamp(message.createdAt)
            .setFooter({ text: `⭐ ${reaction.count} | ID: ${message.id}` });

        // If there is an image attached, put it in the embed
        if (message.attachments.size > 0) {
            const attachment = message.attachments.first();
            if (attachment.contentType && attachment.contentType.startsWith('image/')) {
                starEmbed.setImage(attachment.url);
            }
        }

        await starboardChannel.send({ embeds: [starEmbed] });
    } catch (err) {
        console.error('❌ Starboard Error:', err);
    }
});

// ─── Login ────────────────────────────────────────────────────────────────────
// Connect to MongoDB and log in the bot
if (!process.env.MONGO_URI) {
    console.error('❌ Missing MONGO_URI in environment variables!');
} else {
    mongoose.connect(process.env.MONGO_URI)
        .then(() => console.log('✅ Connected to MongoDB Database!'))
        .catch(err => console.error('❌ Failed to connect to MongoDB:', err));
}

client.login(process.env.DISCORD_TOKEN);

// ─── OAuth2 Web Server ─────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send("Re:START Bot is running!"));

app.get('/callback', async (req, res) => {
    // Check if Discord returned an error (like invalid_scope)
    if (req.query.error) {
        return res.send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                <h1 style="color: #e74c3c;">❌ OAuth2 Error</h1>
                <p>Discord rejected the request.</p>
                <p><strong>Error:</strong> ${req.query.error}</p>
                <p><strong>Description:</strong> ${req.query.error_description || 'No description provided'}</p>
            </div>
        `);
    }

    const code = req.query.code;
    const userId = req.query.state;
    if (!code || !userId) return res.send("❌ Missing code or state parameter.");

    try {
        const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: client.user.id,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: 'https://re-start-app.onrender.com/callback'
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        const tokenData = await tokenRes.json();
        if (tokenData.error) {
            return res.send(`❌ OAuth2 Error: ${tokenData.error_description || tokenData.error}`);
        }

        const data = getData();
        if (!data.users) data.users = {};
        if (!data.users[userId]) data.users[userId] = {};
        
        data.users[userId].tokens = {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token,
            expires_at: Date.now() + (tokenData.expires_in * 1000)
        };
        saveData(data);

        await updatePlayerWidget(userId);

        res.send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                <h1 style="color: #2ecc71;">✅ Authorization Successful!</h1>
                <p>Your Discord account has been linked and your widget was updated.</p>
                <p>You can close this tab and go back to Discord.</p>
            </div>
        `);
    } catch (err) {
        console.error("OAuth2 Callback Error:", err);
        res.send("❌ Internal server error during authorization.");
    }
});

app.listen(process.env.PORT || 3000, () => {
    console.log(`🌐 Express OAuth2 server running on port ${process.env.PORT || 3000}`);
});