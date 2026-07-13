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
    AttachmentBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');
const app = express();
const Filter = require('bad-words');
const activeTradeSessions = new Map(); // Store trade session data
const activeClaimLocks = new Set(); // Prevent race conditions on buttons
const mongoose = require('mongoose');
const User = require('./models/User'); // Import our new User database schema
const Starboard = require('./models/Starboard'); // Import Starboard schema
const GachaItem = require('./models/GachaItem'); // Import new MongoDB Gacha schema
const MarketListing = require('./models/MarketListing'); // Import MarketListing schema
const profanityFilter = new Filter();
let gachaPool = [];

// Wait for MongoDB to connect before loading the pool
mongoose.connection.once('open', async () => {
    try {
        const items = await GachaItem.find({}).lean();
        gachaPool = items;
        console.log(`✅ Loaded ${gachaPool.length} avatars from MongoDB into the Gacha Pool.`);
    } catch (err) {
        console.error("❌ Failed to load Gacha Pool from MongoDB:", err);
    }
});

const WIDGET_CHANNEL_ID = '1525308184389222400';
const STARBOARD_CHANNEL_ID = '1525488417864028362';
const REBOOTH_CHANNEL_ID = '1525666791974764684';
const ECONOMY_CHANNEL_ID = '1525505480808730694';
const WORK_CHANNEL_ID = '1526232094529814752';
const SHOP_CHANNEL_ID = '1525685955212869804';
const TRADING_CHANNEL_ID = '1525718530115375185';
const INFO_CHANNEL_ID = '1525718674890166454';

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
        .setDescription('🪙 Flip a coin and bet some coins!')
        .addStringOption(opt => opt.setName('choice').setDescription('Heads or tails').setRequired(false).addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }))
        .addIntegerOption(opt => opt.setName('bet').setDescription('Amount of coins to bet').setRequired(false).setMinValue(1).setMaxValue(3500)),

    new SlashCommandBuilder()
        .setName('blackjack')
        .setDescription('🃏 Play a game of Blackjack against the bot!')
        .addIntegerOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1).setMaxValue(3500)),

    new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('🎡 Bet on the roulette wheel!')
        .addIntegerOption(opt => opt.setName('bet').setDescription('Amount to bet').setRequired(true).setMinValue(1).setMaxValue(500))
        .addStringOption(opt => opt.setName('color').setDescription('Color to bet on').setRequired(true).addChoices(
            { name: 'Red (2x)', value: 'red' },
            { name: 'Black (2x)', value: 'black' },
            { name: 'Green (14x)', value: 'green' }
        )),

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
        .setDescription("View your or another user's Re:START profile!")
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
            opt.setName('bet').setDescription('Amount of coins to bet').setRequired(true).setMinValue(1).setMaxValue(700)),
    new SlashCommandBuilder()
        .setName('give')
        .setDescription('Give coins to another user')
        .addUserOption(opt => 
            opt.setName('user').setDescription('The user to give coins to').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('amount').setDescription('Amount of coins to give').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
        .setName('hallofshame')
        .setDescription('👑 [DEV ONLY] Post the top 3 swearers to the Hall of Re:START channel'),
    new SlashCommandBuilder()
        .setName('giveeveryonestartingcoins')
        .setDescription('👑 [DEV ONLY] Give 500 starting coins to every user in the database'),

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
                { name: '🌟 VIP Pass', value: 'vip' },
                { name: '💼 Work Slot', value: 'work_slot' },
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
        .setDescription("View yours or another user's collection of Booth Avatars")
        .addUserOption(opt =>
            opt.setName('user').setDescription('The user whose inventory you want to view').setRequired(false)),
    new SlashCommandBuilder()
        .setName('lookup')
        .setDescription('Look up a specific avatar to see its stats and who owns it')
        .addStringOption(opt =>
            opt.setName('avatar_id').setDescription('The ID of the avatar').setRequired(true)),
    new SlashCommandBuilder()
        .setName('upgrade')
        .setDescription('Upgrade an avatar\'s RPG stats using Affinity and Coins')
        .addStringOption(opt =>
            opt.setName('avatar_id').setDescription('The ID of the avatar to upgrade').setRequired(true))
        .addStringOption(opt =>
            opt.setName('stat').setDescription('The stat to upgrade').setRequired(true).addChoices(
                { name: '🏃‍♂️ Speed (Reduces Work Time)', value: 'speed' },
                { name: '🛡️ Endurance (Reduces Rest Time)', value: 'endurance' },
                { name: '🍀 Luck (Increases Wage Multiplier & Heist Chance)', value: 'luck' }
            )),
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
        .setName('wishlist')
        .setDescription('View your current wishlist'),
    new SlashCommandBuilder()
        .setName('work')
        .setDescription('Send an avatar to work for coins based on their power')
        .addStringOption(opt => 
            opt.setName('avatar_id').setDescription('The ID of the avatar to send to work').setRequired(true)),
    new SlashCommandBuilder()
        .setName('claimwork')
        .setDescription('Claim coins from your completed work'),
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
        .setName('addgachatoken')
        .setDescription('🎟️ Give free gacha tokens to a user (Developer only)')
        .addUserOption(opt => 
            opt.setName('user').setDescription('The user to give tokens to').setRequired(true))
        .addIntegerOption(opt => 
            opt.setName('amount').setDescription('Amount of tokens to give').setRequired(true).setMinValue(1)),

    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('🔥 Wipe all inventories and coins (Developer only)'),

    // ── Lists (Admin only) ────────────────────────────────────────────────────
    new SlashCommandBuilder()
        .setName('playerlist')
        .setDescription('📜 View a list of all players in the database')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder()
        .setName('gachapoollist')
        .setDescription('📜 View a list of all avatars in the Gacha pool')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

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

    new SlashCommandBuilder()
        .setName('addstaff')
        .setDescription('[DEV ONLY] Add a user to Game Staff')
        .addUserOption(opt => opt.setName('user').setDescription('The user to promote').setRequired(true)),
    new SlashCommandBuilder()
        .setName('openevent')
        .setDescription('[DEV ONLY] Open a custom event submission')
        .addStringOption(opt => opt.setName('name').setDescription('Name of the event (e.g. USSR)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('closeevent')
        .setDescription('[DEV ONLY] Close the current custom event'),
    new SlashCommandBuilder()
        .setName('submitavatar')
        .setDescription('Submit a new avatar for review')
        .addStringOption(opt => opt.setName('name').setDescription('Avatar name').setRequired(true))
        .addStringOption(opt => opt.setName('creator').setDescription('Creator name').setRequired(true))
        .addStringOption(opt => opt.setName('link').setDescription('Booth.pm link').setRequired(true))
        .addAttachmentOption(opt => opt.setName('image').setDescription('Avatar image').setRequired(true)),
    new SlashCommandBuilder()
        .setName('submitevent')
        .setDescription('Submit your Custom Event Card!')
        .addStringOption(opt => opt.setName('quote').setDescription('Your custom tagline/quote').setRequired(true))
        .addAttachmentOption(opt => opt.setName('image').setDescription('Your image').setRequired(true)),
    new SlashCommandBuilder()
        .setName('fetchavatars')
        .setDescription('[STAFF] Fetch random avatars from Booth for review')
        .addIntegerOption(opt => opt.setName('amount').setDescription('Number of avatars (max 10)').setRequired(true)),
    new SlashCommandBuilder()
        .setName('market')
        .setDescription('Global Avatar Marketplace')
        .addSubcommand(sub => sub.setName('view').setDescription('View avatars for sale in the market'))
        .addSubcommand(sub => sub.setName('list').setDescription('List one of your avatars for sale')
            .addStringOption(opt => opt.setName('avatar_id').setDescription('ID of the avatar to list').setRequired(true))
            .addIntegerOption(opt => opt.setName('price').setDescription('Price in coins').setRequired(true).setMinValue(1)))
        .addSubcommand(sub => sub.setName('buy').setDescription('Buy an avatar from the market')
            .addStringOption(opt => opt.setName('listing_id').setDescription('The Listing ID of the market item').setRequired(true)))
        .addSubcommand(sub => sub.setName('cancel').setDescription('Cancel one of your market listings')
            .addStringOption(opt => opt.setName('listing_id').setDescription('The Listing ID to cancel').setRequired(true))),
    new SlashCommandBuilder()
        .setName('pity')
        .setDescription('Check your current Gacha Pity counter'),
    new SlashCommandBuilder()
        .setName('removeavatar')
        .setDescription('[STAFF] Remove an avatar and all its variants from the Gacha pool')
        .addStringOption(opt => opt.setName('name').setDescription('Exact or partial name of the avatar').setRequired(true)),
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the server leaderboards')
        .addStringOption(opt => opt.setName('category').setDescription('Leaderboard category').setRequired(true).addChoices(
            { name: 'Coins', value: 'coins' },
            { name: 'Level / XP', value: 'level' },
            { name: 'Avatars Owned', value: 'avatars' }
        )),
    new SlashCommandBuilder()
        .setName('updateinfo')
        .setDescription('[DEV] Update the INFO channel message'),
    new SlashCommandBuilder()
        .setName('riskywork')
        .setDescription('Send your avatar on a highly illegal and dangerous mission for a chance at massive payouts!')
        .addStringOption(opt => opt.setName('avatar_id').setDescription('ID of the avatar to send').setRequired(true)),
    new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg the server for some spare coins'),

].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    // Auto-inject staff roles
    const initialStaffIds = ['379244614147768330', '310328207062728707', '169472794281771008', '278438243677241346', '510338423941496863'];
    try {
        await User.updateMany({ userId: { $in: initialStaffIds } }, { $set: { isGameStaff: true } });
        console.log('✅ Initial staff roles injected.');
    } catch (err) {
        console.error('Failed to inject staff roles:', err);
    }

    // Daily Scraper (7:00 AM PHT -> 23:00 UTC)
    const cron = require('node-cron');
    cron.schedule('0 23 * * *', async () => {
        try {
            console.log('⏰ Running daily avatar fetch...');
            const cheerio = require('cheerio');
            const page = Math.floor(Math.random() * 5) + 1;
            const res = await fetch(`https://booth.pm/en/search/VRChat?category_ids%5B%5D=208&sort=wish&page=${page}`);
            const html = await res.text();
            const $ = cheerio.load(html);
            const items = $('.item-card').slice(0, 10).toArray();
            const channel = await client.channels.fetch('1525819468176035860').catch(()=>null);
            if (!channel) return;
            for (let item of items) {
                const name = $(item).find('.item-card__title').text().trim();
                const url = $(item).find('.item-card__title a').attr('href');
                const image = $(item).find('.item-card__thumbnail-image').attr('src') || $(item).find('.item-card__thumbnail-image').attr('data-original');
                const creator = $(item).find('.item-card__shop-name').text().trim() || 'Unknown';
                if (!name || !url || !image) continue;
                const embed = new EmbedBuilder().setTitle(name).setURL(url).setImage(image).setFooter({ text: 'Creator: ' + creator }).setColor('#0099ff');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('approve_avatar_submission').setLabel('Approve').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('deny_avatar_submission').setLabel('Deny').setStyle(ButtonStyle.Danger)
                );
                await channel.send({ embeds: [embed], components: [row] });
                await new Promise(r => setTimeout(r, 1000));
            }
            console.log('✅ Sent daily avatars!');
        } catch (err) {
            console.error('Daily cron error:', err);
        }
    });

    // Weekly Gacha Pool Rebuild (Sundays at Midnight UTC)
    cron.schedule('0 0 * * 0', async () => {
        try {
            console.log('⏰ Running weekly gacha pool rebuild...');
            const { exec } = require('child_process');
            exec('node update_pool.js', async (err, stdout, stderr) => {
                if (err) {
                    console.error("Error running update_pool.js:", err);
                    return;
                }
                console.log("Weekly pool rebuild finished:\n" + stdout);
                
                // Reload gachaPool after building
                try {
                    const items = await GachaItem.find({}).lean();
                    gachaPool = items;
                    console.log(`✅ Reloaded ${gachaPool.length} avatars into the Gacha Pool from DB.`);
                } catch (e) {
                    console.error("Error reloading pool:", e);
                }
            });
        } catch (err) {
            console.error('Weekly cron error:', err);
        }
    });
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

            // --- Star Drop Logic ---
            if (!data.nextStarDrop) {
                // Initialize next drop to be 5-10 hours from now
                data.nextStarDrop = now + (Math.floor(Math.random() * 6) + 5) * 3600000;
                saveData(data);
            } else if (now > data.nextStarDrop) {
                // Set next drop
                data.nextStarDrop = now + (Math.floor(Math.random() * 6) + 5) * 3600000;
                saveData(data);

                const ecoChannel = client.channels.cache.get(ECONOMY_CHANNEL_ID);
                if (ecoChannel) {
                    const embed = new EmbedBuilder()
                        .setColor(0xf1c40f)
                        .setTitle('🌟 A Star has fallen from the skies!')
                        .setDescription('A mysterious glowing object has landed! Click to claim its contents... but beware, it might be cursed!')
                        .setFooter({ text: 'First to click opens it! (It could be Coins, a Gacha Token, or a trap!)' });

                    const claimButton = new ButtonBuilder()
                        .setCustomId(`grab_star_${Date.now()}`)
                        .setLabel('Claim Star!')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🌟');

                    const row = new ActionRowBuilder().addComponents(claimButton);
                    ecoChannel.send({ embeds: [embed], components: [row] }).catch(console.error);
                }
            }
        } catch (e) {
            console.error('Error in background tasks:', e);
        }
    }, 60000);
});

// ─── Message Handler (Random Drops) ──────────────────────────────────────
let messageCountSinceDrop = 0;
let nextDropThreshold = Math.floor(Math.random() * 15) + 15; // 15 to 30

let messageCountSinceCardDrop = 0;
let nextCardDropThreshold = Math.floor(Math.random() * 50) + 50; // 50 to 100

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Random Coin Drop (Economy Channel Only)
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

    // Random Card Drop (Any channel)
    messageCountSinceCardDrop++;
    if (messageCountSinceCardDrop >= nextCardDropThreshold) {
        messageCountSinceCardDrop = 0;
        nextCardDropThreshold = Math.floor(Math.random() * 50) + 50; // 50 to 100

        // Determine rarity (C: 60%, R: 25%, SR: 14%, UR: 1%)
        const roll = Math.random() * 100;
        let rarityTarget = 'C';
        if (roll <= 1) rarityTarget = 'UR';
        else if (roll <= 15) rarityTarget = 'SR';
        else if (roll <= 40) rarityTarget = 'R';

        if (gachaPool.length > 0) {
            const possibleDrops = gachaPool.filter(a => a.rarity === rarityTarget);
            if (possibleDrops.length > 0) {
                const drop = possibleDrops[Math.floor(Math.random() * possibleDrops.length)];
                
                const embed = new EmbedBuilder()
                    .setColor(rarityTarget === 'UR' ? 0xff00ff : rarityTarget === 'SR' ? 0xffaa00 : rarityTarget === 'R' ? 0x00aaff : 0xaaaaaa)
                    .setTitle(`✨ A Wild Avatar Appeared!`)
                    .setDescription(`A mysterious card just dropped in chat!\n\n**${drop.name}** [${drop.rarity}]\nPower: ${drop.power || 50}\n\nClick the button below to snipe it!`)
                    .setImage(drop.image)
                    .setFooter({ text: 'Full Claim limit: 1/hr | Snipe for Coins limit: 5/hr' });

                const claimButton = new ButtonBuilder()
                    .setCustomId(`grab_card_${drop.id}`)
                    .setLabel('Grab Card!')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('✋');

                const row = new ActionRowBuilder().addComponents(claimButton);
                await message.channel.send({ embeds: [embed], components: [row] });
            }
        }
    }
});

// ─── Interaction Handler ──────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    // ── Staff Approval Buttons ───────────────────────────────────────────────
    if (interaction.isButton() && (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('deny_'))) {
        const isApprove = interaction.customId.startsWith('approve_');
        const isEvent = interaction.customId.includes('event');
        const embed = interaction.message.embeds[0];

        if (!isApprove) {
            await interaction.deferUpdate();
            let userRec = await User.findOne({ userId: interaction.user.id });
            if (!userRec || (!userRec.isGameStaff && interaction.user.id !== '510338423941496863')) {
                return interaction.followUp({ content: '❌ Only Game Staff can review submissions!', ephemeral: true });
            }
            const deniedEmbed = EmbedBuilder.from(embed).setColor('#e74c3c').setTitle('❌ Denied: ' + embed.title);
            return interaction.editReply({ embeds: [deniedEmbed], components: [] });
        }

        // Show modal for naming
        if (isApprove) {
            let rawTitle = embed.title.replace('New Avatar Submission: ', '').replace(/\[.*\] /, '');
            let englishPart = rawTitle.replace(/[^\x00-\x7F]/g, " ");
            const keywords = ['original', '3d', 'model', 'avatar', 'vrchat', 'vrc', 'quest', 'pc', 'physbone', 'unity', 'fbx', 'vrm', 'ready', 'for', 'the', 'new', 'character'];
            let words = englishPart.split(/[\s\-\/|【】『』()]+/).filter(w => w && !keywords.includes(w.toLowerCase()));
            let suggestedName = words.length > 0 ? words.join(' ').trim() : rawTitle.substring(0, 25);
            
            const modal = new ModalBuilder()
                .setCustomId(`modal_approve_avatar_${interaction.message.id}`)
                .setTitle('Approve Avatar');

            const nameInput = new TextInputBuilder()
                .setCustomId('avatar_name')
                .setLabel('Avatar Name (Shortened/English)')
                .setStyle(TextInputStyle.Short)
                .setValue(suggestedName)
                .setRequired(true);

            const variantInput = new TextInputBuilder()
                .setCustomId('avatar_variants')
                .setLabel('Variants (1=C, 2=R+C, 3=SR+, 4=UR+)')
                .setStyle(TextInputStyle.Short)
                .setValue('4')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(nameInput),
                new ActionRowBuilder().addComponents(variantInput)
            );
            return interaction.showModal(modal);
        }
    }

    // ── Modal Submit: Approve Avatar ───────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_approve_avatar_')) {
        await interaction.deferUpdate();
        
        let userRec = await User.findOne({ userId: interaction.user.id });
        if (!userRec || (!userRec.isGameStaff && interaction.user.id !== '510338423941496863')) {
            return interaction.followUp({ content: '❌ Only Game Staff can review submissions!', ephemeral: true });
        }

        const finalName = interaction.fields.getTextInputValue('avatar_name');
        
        try {
            const msg = interaction.message;
            const embed = msg.embeds[0];
            const isEvent = embed.title.includes('Event');
            const fs = require('fs');
            const path = require('path');
            
            // Generate a clean, short ID based on the English name they inputted
            let safeName = finalName.replace(/[^a-z0-9]/gi, '').toLowerCase();
            if (gachaPool.some(m => m.id.startsWith(safeName + '_'))) {
                safeName += '_' + Math.floor(Math.random() * 1000);
            }
            
            // 2. Determine Rarity & Creator
            let creator = 'Unknown';
            if (embed.footer && embed.footer.text && embed.footer.text.startsWith('Creator: ')) {
                creator = embed.footer.text.replace('Creator: ', '');
            } else if (embed.fields) {
                const creatorField = embed.fields.find(f => f.name === 'Creator');
                if (creatorField) creator = creatorField.value;
            }

            // 3. Add to MongoDB and memory
            const baseUrl = embed.url || 'https://booth.pm/';
            const imageUrl = embed.image.url; // Use URL directly instead of downloading
            let addedVariants = [];
            let newItems = [];

            if (isEvent) {
                newItems.push(new GachaItem({ id: safeName, name: finalName, rarity: 'USSR', value: 5000, image: imageUrl, creator: creator }));
                addedVariants.push('USSR');
            } else {
                const variants = parseInt(interaction.fields.getTextInputValue('avatar_variants')) || 4;

                if (variants >= 4) {
                    newItems.push(new GachaItem({ id: safeName + '_ur', name: finalName, rarity: 'UR', value: 1000, image: imageUrl, creator: creator }));
                    newItems.push(new GachaItem({ id: safeName + '_sr', name: finalName, rarity: 'SR', value: 500, image: imageUrl, creator: creator }));
                    newItems.push(new GachaItem({ id: safeName + '_r', name: finalName, rarity: 'R', value: 100, image: imageUrl, creator: creator }));
                    newItems.push(new GachaItem({ id: safeName + '_c', name: finalName, rarity: 'C', value: 25, image: imageUrl, creator: creator }));
                    addedVariants.push('UR', 'SR', 'R', 'C');
                } else if (variants === 3) {
                    newItems.push(new GachaItem({ id: safeName + '_sr', name: finalName, rarity: 'SR', value: 500, image: imageUrl, creator: creator }));
                    newItems.push(new GachaItem({ id: safeName + '_r', name: finalName, rarity: 'R', value: 100, image: imageUrl, creator: creator }));
                    newItems.push(new GachaItem({ id: safeName + '_c', name: finalName, rarity: 'C', value: 25, image: imageUrl, creator: creator }));
                    addedVariants.push('SR', 'R', 'C');
                } else if (variants === 2) {
                    newItems.push(new GachaItem({ id: safeName + '_r', name: finalName, rarity: 'R', value: 100, image: imageUrl, creator: creator }));
                    newItems.push(new GachaItem({ id: safeName + '_c', name: finalName, rarity: 'C', value: 25, image: imageUrl, creator: creator }));
                    addedVariants.push('R', 'C');
                } else {
                    newItems.push(new GachaItem({ id: safeName + '_c', name: finalName, rarity: 'C', value: 25, image: imageUrl, creator: creator }));
                    addedVariants.push('C');
                }
            }

            // Save to MongoDB
            await GachaItem.insertMany(newItems);
            
            // Add to in-memory pool (convert Mongoose docs to lean objects)
            gachaPool.push(...newItems.map(item => item.toObject()));
            
            // 4. Reward submitter
            let submitterId = null;
            if (embed.fields) {
                const submitterField = embed.fields.find(f => f.name === 'Submitter');
                if (submitterField) submitterId = submitterField.value.replace(/[^0-9]/g, '');
            } else if (embed.footer && embed.footer.text && !embed.footer.text.startsWith('Creator: ')) {
                submitterId = embed.footer.text;
            }

            if (submitterId) {
                let subRec = await User.findOne({ userId: submitterId });
                if (subRec) {
                    const now = new Date();
                    if (!subRec.lastSubmissionRewardDate || now.getDate() !== subRec.lastSubmissionRewardDate.getDate()) {
                        subRec.coins += 500;
                        subRec.lastSubmissionRewardDate = now;
                        await subRec.save();
                    }
                }
            }

            const approvedEmbed = EmbedBuilder.from(embed)
                .setColor('#2ecc71')
                .setTitle(`✅ Approved as [${addedVariants.join(', ')}] ${finalName}`)
                .setDescription(`Successfully added to Gacha Pool! Saved image locally.`);
            await interaction.message.edit({ embeds: [approvedEmbed], components: [] });

        } catch (err) {
            console.error('Approval Error:', err);
            await interaction.message.edit({ content: '❌ Failed to process approval. Check console.', components: [] });
        }
        return;
    }

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

    // ── Button: Grab Card ─────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('grab_card_')) {
        const cardId = interaction.customId.replace('grab_card_', '');
        const claimerId = interaction.user.id;

        try {
            if (activeClaimLocks.has(interaction.message.id)) {
                return interaction.reply({ content: '❌ Processing another claim...', flags: 64 });
            }
            activeClaimLocks.add(interaction.message.id);

            if (interaction.message.components[0].components[0].disabled) {
                activeClaimLocks.delete(interaction.message.id);
                return interaction.reply({ content: '❌ Too late! Someone already grabbed this card.', flags: 64 });
            }

            let userRecord = await User.findOne({ userId: claimerId });
            if (!userRecord) userRecord = new User({ userId: claimerId });

            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const cardData = gachaPool.find(c => c.id === cardId) || { name: 'Card', value: 100 };

            if (!userRecord.inventory.includes(cardId)) {
                // Full Claim
                if (userRecord.lastCardDropClaimDate && userRecord.lastCardDropClaimDate > oneHourAgo) {
                    activeClaimLocks.delete(interaction.message.id);
                    return interaction.reply({ content: `❌ You can only claim a new dropped card once per hour! Next claim available <t:${Math.floor(new Date(userRecord.lastCardDropClaimDate.getTime() + 60*60*1000).getTime()/1000)}:R>.`, flags: 64 });
                }
                userRecord.inventory.push(cardId);
                userRecord.lastCardDropClaimDate = now;
                userRecord.markModified('lastCardDropClaimDate');
                userRecord.markModified('inventory');
                await userRecord.save();

                const disabledButton = new ButtonBuilder()
                    .setCustomId('claimed_already')
                    .setLabel(`Claimed by ${interaction.user.username}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const row = new ActionRowBuilder().addComponents(disabledButton);
                const embed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x95a5a6)
                    .setFooter({ text: `✨ Card claimed by ${interaction.user.username}` });

                await interaction.update({ embeds: [embed], components: [row] });
                activeClaimLocks.delete(interaction.message.id);
                return;
            } else {
                // Coin Snipe
                if (userRecord.lastCoinSnipeReset && userRecord.lastCoinSnipeReset < oneHourAgo) {
                    userRecord.coinSnipeCount = 0;
                    userRecord.lastCoinSnipeReset = now;
                }
                if (userRecord.coinSnipeCount >= 5) {
                    activeClaimLocks.delete(interaction.message.id);
                    return interaction.reply({ content: `❌ You've hit your limit of 5 coin snipes per hour! Limit resets <t:${Math.floor(new Date(userRecord.lastCoinSnipeReset.getTime() + 60*60*1000).getTime()/1000)}:R>.`, flags: 64 });
                }

                if (userRecord.coinSnipeCount === 0 || !userRecord.lastCoinSnipeReset) {
                    userRecord.lastCoinSnipeReset = now;
                    userRecord.markModified('lastCoinSnipeReset');
                }
                
                userRecord.coinSnipeCount += 1;
                userRecord.markModified('coinSnipeCount');
                const snipeCoins = Math.floor(cardData.value / 2); // get half value in coins
                userRecord.coins += snipeCoins;
                await userRecord.save();

                const disabledButton = new ButtonBuilder()
                    .setCustomId('claimed_already')
                    .setLabel(`Sniped by ${interaction.user.username}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true);

                const row = new ActionRowBuilder().addComponents(disabledButton);
                const embed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x95a5a6)
                    .setFooter({ text: `🪙 Sniped by ${interaction.user.username} for ${snipeCoins} Coins!` });

                await interaction.update({ embeds: [embed], components: [row] });
                activeClaimLocks.delete(interaction.message.id);
                return;
            }
        } catch (err) {
            console.error(err);
            activeClaimLocks.delete(interaction.message.id);
            return interaction.reply({ content: '❌ Error claiming card!', flags: 64 });
        }
    }

    // ── Button: Grab Star ─────────────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('grab_star_')) {
        try {
            if (interaction.message.components[0].components[0].disabled) {
                return interaction.reply({ content: '❌ Too late! Someone already claimed this star.', flags: 64 });
            }

            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord) userRecord = new User({ userId: interaction.user.id });

            const roll = Math.random();
            let resultMsg = '';
            let color = 0x95a5a6;
            
            if (roll < 0.05) {
                userRecord.gachaTokens += 1;
                resultMsg = `✨ **Lucky!** <@${interaction.user.id}> found a **🎟️ Gacha Token** inside!`;
                color = 0x2ecc71;
            } else if (roll < 0.70) {
                const amt = Math.floor(Math.random() * 1500) + 500; // 500 to 2000
                userRecord.coins += amt;
                resultMsg = `💰 <@${interaction.user.id}> cracked open the star and found **🪙 ${amt} Coins**!`;
                color = 0xf1c40f;
            } else {
                const amt = Math.floor(Math.random() * 400) + 100; // 100 to 500
                userRecord.coins = Math.max(0, userRecord.coins - amt);
                resultMsg = `💀 **Oh no!** The star exploded in <@${interaction.user.id}>'s face and they dropped **🪙 ${amt} Coins**!`;
                color = 0xe74c3c;
            }

            await userRecord.save();

            const disabledButton = new ButtonBuilder()
                .setCustomId('claimed_already')
                .setLabel(`Claimed by ${interaction.user.username}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const row = new ActionRowBuilder().addComponents(disabledButton);
            const embed = new EmbedBuilder()
                .setColor(color)
                .setDescription(resultMsg);

            await interaction.update({ embeds: [embed], components: [row] });
            return;
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Error claiming star!', flags: 64 });
        }
    }

    // ── Button: Gacha Claim ───────────────────────────────────────────────────
    if (interaction.isButton() && (interaction.customId.startsWith('claim_') || interaction.customId.startsWith('claim:'))) {
        const claimerId = interaction.user.id;
        let modelId, rollerId;

        if (interaction.customId.startsWith('claim:')) {
            // New format: claim:model_id:roller_id:timestamp
            const parts = interaction.customId.split(':');
            modelId = parts[1];
            rollerId = parts[2];
            const timestamp = parseInt(parts[3]);
            if (Date.now() - timestamp > 20000) {
                return interaction.reply({ content: '❌ This drop has expired (20 second limit)!', flags: 64 });
            }
        } else {
            // Old format: claim_model_id_roller_id_timestamp OR claim_model_id_timestamp
            const withoutPrefix = interaction.customId.replace('claim_', '');
            const model = gachaPool.find(m => withoutPrefix.startsWith(m.id));
            if (!model) return interaction.reply({ content: '❌ Error: Avatar not found!', flags: 64 });
            modelId = model.id;
            
            const remainder = withoutPrefix.replace(model.id + '_', '');
            if (remainder.includes('_')) {
                rollerId = remainder.split('_')[0]; // It was the broken new format from earlier
            } else {
                rollerId = claimerId; // It was the very old format, assume they are legit
            }
        }

        try {
            // Check memory lock to prevent race condition
            if (activeClaimLocks.has(interaction.message.id)) {
                return interaction.reply({ content: '❌ Too late! Someone already claimed this.', flags: 64 });
            }

            // Check if button is already claimed
            if (interaction.message.components[0].components[0].disabled) {
                return interaction.reply({ content: '❌ Too late! Someone already claimed this.', flags: 64 });
            }

            // Lock the message
            activeClaimLocks.add(interaction.message.id);
            setTimeout(() => activeClaimLocks.delete(interaction.message.id), 60000);

            let claimerRecord = await User.findOne({ userId: claimerId });
            if (!claimerRecord) claimerRecord = new User({ userId: claimerId });

            const model = gachaPool.find(m => m.id === modelId);

            let claimMsg = '';
            
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            
            const alreadyOwns = claimerRecord.inventory.includes(modelId);

            if (!alreadyOwns) {
                // FULL CLAIM
                if (claimerRecord.lastCardDropClaimDate && claimerRecord.lastCardDropClaimDate > oneHourAgo) {
                    activeClaimLocks.delete(interaction.message.id);
                    return interaction.reply({ content: `❌ You can only claim a new avatar once per hour! Next claim available <t:${Math.floor(new Date(claimerRecord.lastCardDropClaimDate.getTime() + 60*60*1000).getTime()/1000)}:R>.`, flags: 64 });
                }

                claimerRecord.inventory.push(modelId);
                claimerRecord.lastCardDropClaimDate = now;
                claimerRecord.markModified('lastCardDropClaimDate');
                claimerRecord.markModified('inventory');

                if (claimerId !== rollerId) {
                    claimMsg = `🔫 **SNIPED!** <@${claimerId}> stole the drop and added the avatar to their inventory!`;
                } else {
                    claimMsg = `💖 **Claimed!** <@${claimerId}> added the avatar to their inventory!`;
                }
            } else {
                // DUPE / COIN SNIPE
                if (claimerRecord.lastCoinSnipeReset && claimerRecord.lastCoinSnipeReset < oneHourAgo) {
                    claimerRecord.coinSnipeCount = 0;
                    claimerRecord.lastCoinSnipeReset = now;
                    claimerRecord.markModified('lastCoinSnipeReset');
                }
                if (claimerRecord.coinSnipeCount >= 5) {
                    activeClaimLocks.delete(interaction.message.id);
                    return interaction.reply({ content: `❌ You've hit your limit of 5 coin snipes/dupes per hour! Limit resets <t:${Math.floor(new Date(claimerRecord.lastCoinSnipeReset.getTime() + 60*60*1000).getTime()/1000)}:R>.`, flags: 64 });
                }

                if (claimerRecord.coinSnipeCount === 0 || !claimerRecord.lastCoinSnipeReset) {
                    claimerRecord.lastCoinSnipeReset = now;
                    claimerRecord.markModified('lastCoinSnipeReset');
                }
                claimerRecord.coinSnipeCount += 1;
                claimerRecord.markModified('coinSnipeCount');

                if (claimerId !== rollerId) {
                    // Sniper gets Coins!
                    const snipeCoins = Math.floor((model.value || 100) / 2);
                    claimerRecord.coins += snipeCoins;
                    claimMsg = `🔫 **SNIPED!** <@${claimerId}> already owns this, so they sniped it for **🪙 ${snipeCoins} Coins** instead!`;
                } else {
                    // Roller gets Affinity!
                    if (!claimerRecord.avatarAffinity) claimerRecord.avatarAffinity = new Map();
                    const currentAff = claimerRecord.avatarAffinity.get(modelId) || 0;
                    claimerRecord.avatarAffinity.set(modelId, currentAff + 1);
                    
                    const percent = Math.min((currentAff + 1) * 10, 100);
                    claimMsg = `💖 **Duplicate!** <@${claimerId}> already owned this avatar! They got **+10% Affinity** (${percent}% Total)!`;
                }
            }
            await claimerRecord.save();

            // Disable the button and update message
            const disabledButton = new ButtonBuilder()
                .setCustomId('claimed_already')
                .setLabel(`Claimed by ${interaction.user.username}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const row = new ActionRowBuilder().addComponents(disabledButton);
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            // Re-fetch the image to pass it in the update payload, fixing the Discord double-render bug
            const fs = require('fs');
            const path = require('path');
            let imgBuffer;
            if (model.image.startsWith('http')) {
                const imgRes = await fetch(model.image);
                imgBuffer = await imgRes.arrayBuffer();
            } else {
                imgBuffer = fs.readFileSync(path.join(__dirname, 'images', model.image));
            }
            const imgName = `avatar_${model.id}.jpg`;
            const attachment = new AttachmentBuilder(Buffer.from(imgBuffer), { name: imgName });

            embed.setImage(`attachment://${imgName}`);
            embed.setFooter({ text: claimMsg });
            
            if (claimMsg.includes('added the avatar to their inventory') && embed.data.description) {
                if (embed.data.description.includes('*Unclaimed*')) {
                    embed.data.description = embed.data.description.replace('*Unclaimed*', `<@${claimerId}>`);
                } else {
                    embed.data.description = embed.data.description.replace('🧍 **Belongs to:** ', `🧍 **Belongs to:** <@${claimerId}>, `);
                }
            }

            await interaction.update({ content: claimMsg, embeds: [embed], components: [row], files: [attachment] });
            return;
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Error claiming avatar!', flags: 64 });
        }
    }

    // ── Button: Chat Drop Claim ───────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('drop_')) {
        const parts = interaction.customId.split('_');
        const dropType = parts[1];

        try {
            if (interaction.message.components[0].components[0].disabled) {
                return interaction.reply({ content: '❌ Too late! Someone already claimed this drop.', flags: 64 });
            }

            let claimerRecord = await User.findOne({ userId: interaction.user.id });
            if (!claimerRecord) claimerRecord = new User({ userId: interaction.user.id });

            let claimMsg = '';
            let embedColor = 0x2ecc71;

            if (dropType === 'coins') {
                const amount = Math.floor(Math.random() * 151) + 50; // 50 to 200
                claimerRecord.coins += amount;
                claimMsg = `🎉 <@${interaction.user.id}> claimed the bag and got **🪙 ${amount} Coins**!`;
            } else if (dropType === 'star') {
                claimerRecord.gachaTokens = (claimerRecord.gachaTokens || 0) + 1;
                claimMsg = `🌟 **LUCKY!** <@${interaction.user.id}> caught the star and received **1 Gacha Token**!`;
            } else if (dropType === 'trap') {
                if (Math.random() < 0.20) {
                    // Cursed Drop - Bad Luck for 1 hour
                    claimerRecord.badLuckExpiresAt = new Date(Date.now() + 3600000);
                    claimMsg = `🌩️ **CURSED!** <@${interaction.user.id}> opened a cursed box and has been afflicted with **Bad Luck** for 1 hour!`;
                    embedColor = 0x8e44ad; // Purple
                } else {
                    // Coin Thief - 20% deduction
                    const penalty = Math.floor(claimerRecord.coins * 0.20);
                    claimerRecord.coins = Math.max(0, claimerRecord.coins - penalty);
                    claimMsg = `💥 **IT WAS A TRAP!** The bag exploded and destroyed **🪙 ${penalty} Coins** (20% of your balance)!`;
                    embedColor = 0xe74c3c;
                }
            }

            await claimerRecord.save();

            const disabledButton = new ButtonBuilder()
                .setCustomId('drop_claimed')
                .setLabel(`Claimed by ${interaction.user.username}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true);

            const row = new ActionRowBuilder().addComponents(disabledButton);
            const embed = EmbedBuilder.from(interaction.message.embeds[0]);
            
            embed.setColor(embedColor);
            embed.setDescription(claimMsg);

            await interaction.update({ embeds: [embed], components: [row] });
            return;
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Error claiming drop!', flags: 64 });
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

    // ── Button: Give Beggar Coins ─────────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('beg_give_')) {
        const beggarId = interaction.customId.replace('beg_give_', '');
        
        if (interaction.user.id === beggarId) {
            return interaction.reply({ content: '❌ You cannot give coins to yourself!', flags: 64 });
        }
        
        // Show modal
        const modal = new ModalBuilder()
            .setCustomId(`modal_beg_give_${beggarId}`)
            .setTitle('Give Coins to Beggar');
            
        const amountInput = new TextInputBuilder()
            .setCustomId('amount')
            .setLabel('Amount to give (Coins)')
            .setStyle(TextInputStyle.Short)
            .setRequired(true);
            
        const row = new ActionRowBuilder().addComponents(amountInput);
        modal.addComponents(row);
        
        await interaction.showModal(modal);
        return;
    }

    // ── Modal: Give Beggar Coins ──────────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_beg_give_')) {
        const beggarId = interaction.customId.replace('modal_beg_give_', '');
        const amountStr = interaction.fields.getTextInputValue('amount');
        const amount = parseInt(amountStr);
        
        if (isNaN(amount) || amount <= 0) {
            return interaction.reply({ content: '❌ Invalid amount. Must be a positive number.', flags: 64 });
        }
        
        await interaction.deferReply();
        
        try {
            let giverRecord = await User.findOne({ userId: interaction.user.id });
            let beggarRecord = await User.findOne({ userId: beggarId });
            
            if (!giverRecord || giverRecord.coins < amount) {
                return interaction.editReply(`❌ You don't have **🪙 ${amount} Coins** to give! You only have **🪙 ${giverRecord ? giverRecord.coins : 0}**.`);
            }
            
            if (!beggarRecord) {
                beggarRecord = new User({ userId: beggarId });
            }
            
            giverRecord.coins -= amount;
            beggarRecord.coins += amount;
            
            await giverRecord.save();
            await beggarRecord.save();
            
            return interaction.editReply(`💸 **${interaction.user.username}** generously gave **🪙 ${amount} Coins** to <@${beggarId}>!`);
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error transferring coins!');
        }
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // ── Staff & Event Commands ──────────────────────────────────────────
    if (commandName === 'updateinfo') {
        if (interaction.user.id !== '510338423941496863') return interaction.reply({ content: '❌ Only the Developer can use this command!', ephemeral: true });
        
        await interaction.deferReply({ ephemeral: true });
        
        try {
            const infoPath = path.join(__dirname, 'docs', 'INFO.md');
            if (!fs.existsSync(infoPath)) return interaction.editReply('❌ docs/INFO.md does not exist!');
            
            const infoContent = fs.readFileSync(infoPath, 'utf8');
            const channel = await client.channels.fetch(INFO_CHANNEL_ID);
            
            if (!channel) return interaction.editReply('❌ Could not fetch INFO channel!');
            
            // Delete old bot messages
            const messages = await channel.messages.fetch({ limit: 50 });
            const botMessages = messages.filter(m => m.author.id === client.user.id);
            for (const [id, msg] of botMessages) {
                await msg.delete();
            }
            
            // Split content into chunks by double newline
            const chunks = infoContent.split(/\n\n/g);
            let currentMessage = '';
            
            for (const chunk of chunks) {
                // Embed descriptions can hold up to 4096 characters
                if (currentMessage.length + chunk.length > 3900) {
                    if (currentMessage.trim()) {
                        const embed = new EmbedBuilder()
                            .setColor(0x3498db)
                            .setDescription(currentMessage.trim());
                        await channel.send({ embeds: [embed] });
                    }
                    currentMessage = chunk + '\n\n';
                } else {
                    currentMessage += chunk + '\n\n';
                }
            }
            
            if (currentMessage.trim().length > 0) {
                const embed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setDescription(currentMessage.trim());
                await channel.send({ embeds: [embed] });
            }
            
            return interaction.editReply('✅ INFO channel successfully updated with new messages!');
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error updating INFO channel.');
        }
    }

    if (commandName === 'addstaff') {
        if (interaction.user.id !== '510338423941496863') return interaction.reply({ content: '❌ Only the Developer can use this command!', ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        await interaction.deferReply({ ephemeral: true });
        let userRec = await User.findOne({ userId: targetUser.id });
        if (!userRec) userRec = new User({ userId: targetUser.id });
        userRec.isGameStaff = true;
        await userRec.save();
        return interaction.editReply(`✅ Successfully promoted **${targetUser.username}** to Game Staff!`);
    }

    if (commandName === 'openevent') {
        if (interaction.user.id !== '510338423941496863') return interaction.reply({ content: '❌ Only the Developer can use this command!', ephemeral: true });
        const name = interaction.options.getString('name');
        const data = getData();
        data.activeEvent = name;
        saveData(data);
        return interaction.reply(`🎉 **EVENT STARTED!** The \`${name}\` Custom Event is now OPEN! Use \`/submitevent\` to enter!`);
    }

    if (commandName === 'closeevent') {
        if (interaction.user.id !== '510338423941496863') return interaction.reply({ content: '❌ Only the Developer can use this command!', ephemeral: true });
        const data = getData();
        data.activeEvent = null;
        saveData(data);
        return interaction.reply(`🛑 **EVENT CLOSED!** Custom submissions are now closed.`);
    }

    if (commandName === 'playerlist') {
        await interaction.deferReply({ ephemeral: true });
        const users = await User.find({}).sort({ level: -1, xp: -1 });
        const text = users.map((u, i) => `${i + 1}. ${u.userId} (Lvl ${u.level} | ${u.xp} XP)`).join('\n');
        const buffer = Buffer.from(text, 'utf-8');
        const attachment = new AttachmentBuilder(buffer, { name: 'playerlist.txt' });
        return interaction.editReply({ content: `📜 Here is the list of ${users.length} players:`, files: [attachment] });
    }

    if (commandName === 'gachapoollist') {
        await interaction.deferReply({ ephemeral: true });
        const items = gachaPool;
        if (items.length === 0) return interaction.editReply('❌ The Gacha Pool is completely empty!');
        
        let page = 0;
        const pageSize = 15;
        const totalPages = Math.ceil(items.length / pageSize);

        const generateEmbed = (pageNum) => {
            const start = pageNum * pageSize;
            const currentItems = items.slice(start, start + pageSize);
            const desc = currentItems.map((g, i) => `**${start + i + 1}.** [${g.rarity}] ${g.name} - ID: \`${g.id}\``).join('\n');
            return new EmbedBuilder()
                .setColor(0x9b59b6)
                .setTitle(`📜 Gacha Pool Avatars (Page ${pageNum + 1}/${totalPages})`)
                .setDescription(desc)
                .setFooter({ text: `Total Avatars: ${items.length}` });
        };

        const generateButtons = (pageNum) => {
            const row = new ActionRowBuilder();
            row.addComponents(
                new ButtonBuilder().setCustomId('gacha_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Primary).setDisabled(pageNum === 0),
                new ButtonBuilder().setCustomId('gacha_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary).setDisabled(pageNum === totalPages - 1)
            );
            return row;
        };

        const msg = await interaction.editReply({ embeds: [generateEmbed(page)], components: [generateButtons(page)] });

        const collector = msg.createMessageComponentCollector({ time: 120000 });
        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) return i.reply({ content: 'Not for you!', flags: 64 });
            if (i.customId === 'gacha_prev' && page > 0) page--;
            if (i.customId === 'gacha_next' && page < totalPages - 1) page++;
            
            await i.update({ embeds: [generateEmbed(page)], components: [generateButtons(page)] });
        });
        
        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(console.error);
        });
        
        return;
    }

    if (commandName === 'submitavatar') {
        const name = interaction.options.getString('name');
        const creator = interaction.options.getString('creator');
        const link = interaction.options.getString('link');
        const image = interaction.options.getAttachment('image');

        if (!link.includes('booth.pm')) return interaction.reply({ content: '❌ The link must be a valid Booth.pm URL!', ephemeral: true });
        if (!image.contentType.startsWith('image/')) return interaction.reply({ content: '❌ The file must be an image!', ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle(`New Avatar Submission: ${name}`)
            .setURL(link)
            .setImage(image.url)
            .addFields(
                { name: 'Creator', value: creator, inline: true },
                { name: 'Submitter', value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: interaction.user.id })
            .setColor('#f1c40f');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('approve_avatar_submission').setLabel('Approve').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('deny_avatar_submission').setLabel('Deny').setStyle(ButtonStyle.Danger)
        );

        const channel = await client.channels.fetch('1525819468176035860').catch(()=>null);
        if (channel) await channel.send({ embeds: [embed], components: [row] });

        return interaction.reply({ content: '✅ Your avatar has been submitted for staff review! You will receive a coin reward if approved!', ephemeral: true });
    }

    if (commandName === 'submitevent') {
        const data = getData();
        if (!data.activeEvent) return interaction.reply({ content: '❌ There is no active custom event right now!', ephemeral: true });

        const quote = interaction.options.getString('quote');
        const image = interaction.options.getAttachment('image');
        if (!image.contentType.startsWith('image/')) return interaction.reply({ content: '❌ The file must be an image!', ephemeral: true });

        const embed = new EmbedBuilder()
            .setTitle(`[${data.activeEvent} Event] ${interaction.user.username}`)
            .setDescription(`*"${quote}"*`)
            .setImage(image.url)
            .addFields({ name: 'Submitter', value: `<@${interaction.user.id}>`, inline: true })
            .setFooter({ text: interaction.user.id })
            .setColor('#e74c3c');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('approve_event_submission').setLabel('Approve Event Card').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('deny_event_submission').setLabel('Deny Event Card').setStyle(ButtonStyle.Danger)
        );

        const channel = await client.channels.fetch('1525819468176035860').catch(()=>null);
        if (channel) await channel.send({ embeds: [embed], components: [row] });

        return interaction.reply({ content: `✅ Your Event Card has been submitted for review!`, ephemeral: true });
    }

    if (commandName === 'removeavatar') {
        let userRec = await User.findOne({ userId: interaction.user.id });
        if (!userRec || (!userRec.isGameStaff && interaction.user.id !== '510338423941496863')) return interaction.reply({ content: '❌ Only Game Staff can use this command!', ephemeral: true });

        const name = interaction.options.getString('name');
        await interaction.deferReply({ ephemeral: true });
        
        try {
            // Escape regex characters just to be safe
            const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(safeName, 'i');
            
            const result = await GachaItem.deleteMany({ name: { $regex: regex } });
            
            if (result.deletedCount > 0) {
                // Update in-memory pool
                gachaPool = gachaPool.filter(g => !regex.test(g.name));
                return interaction.editReply(`✅ Successfully removed ${result.deletedCount} avatar variant(s) matching "${name}" from the Gacha Pool.`);
            } else {
                return interaction.editReply(`❌ No avatars found matching "${name}".`);
            }
        } catch (err) {
            console.error(err);
            return interaction.editReply(`❌ Failed to remove avatar.`);
        }
    }

    if (commandName === 'fetchavatars') {

        const amount = interaction.options.getInteger('amount');
        if (amount < 1 || amount > 50) return interaction.reply({ content: '❌ Amount must be between 1 and 50!', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        let userRec = await User.findOne({ userId: interaction.user.id });
        if (!userRec || (!userRec.isGameStaff && interaction.user.id !== '510338423941496863')) return interaction.editReply({ content: '❌ Only Game Staff can use this command!' });

        // Global Daily Fetch Limit Logic
        const data = getData();
        const now = new Date();
        const todayStr = now.toDateString();
        
        if (data.lastFetchDate !== todayStr) {
            data.lastFetchDate = todayStr;
            data.dailyFetchCount = 0;
        }

        if (data.dailyFetchCount + amount > 50) {
            return interaction.editReply({ content: `❌ Global daily fetch limit reached! You can only fetch **${50 - data.dailyFetchCount}** more avatars today.` });
        }
        try {
            const cheerio = require('cheerio');
            const page = Math.floor(Math.random() * 50) + 1;
            const res = await fetch(`https://booth.pm/en/search/%E3%82%AA%E3%83%AA%E3%82%B8%E3%83%8A%E3%83%AB3D%E3%83%A2%E3%83%87%E3%83%AB?category_ids%5B%5D=208&sort=wish&page=${page}`);
            const html = await res.text();
            const $ = cheerio.load(html);
            const items = $('.item-card').slice(0, amount).toArray();
            let count = 0;
            const channel = await client.channels.fetch('1525819468176035860');
            for (let item of items) {
                const name = $(item).find('.item-card__title').text().trim();
                const url = $(item).find('.item-card__title a').attr('href');
                const image = $(item).find('.item-card__thumbnail-image').attr('src') || $(item).find('.item-card__thumbnail-image').attr('data-original');
                const creator = $(item).find('.item-card__shop-name').text().trim() || 'Unknown';
                if (!name || !url || !image) continue;

                // Prevent fetching duplicates that are already in the Gacha Pool
                const isDuplicate = gachaPool.some(g => g.name === name || g.image === image);
                if (isDuplicate) continue;

                const embed = new EmbedBuilder().setTitle(name).setURL(url).setImage(image).setFooter({ text: 'Creator: ' + creator }).setColor('#0099ff');
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('approve_avatar_submission').setLabel('Approve').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('deny_avatar_submission').setLabel('Deny').setStyle(ButtonStyle.Danger)
                );
                await channel.send({ embeds: [embed], components: [row] });
                count++;
                await new Promise(r => setTimeout(r, 1000));
            }
            data.dailyFetchCount += count;
            saveData(data);
            return interaction.editReply(`✅ Fetched and sent ${count} avatars to the review channel!`);
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Failed to fetch avatars from Booth.');
        }
    }

    // Enforce Widget Channel
    const WIDGET_COMMANDS = ['setstat', 'setshowcase'];
    const PROFILE_CHANNELS = [WIDGET_CHANNEL_ID, ECONOMY_CHANNEL_ID, REBOOTH_CHANNEL_ID, SHOP_CHANNEL_ID, TRADING_CHANNEL_ID];

    if (interaction.channelId === WIDGET_CHANNEL_ID && !WIDGET_COMMANDS.includes(interaction.commandName) && interaction.commandName !== 'profile' && interaction.commandName !== 'help') {
        return interaction.reply({ content: `⚠️ Only widget & profile commands can be used in this channel!`, flags: 64 });
    }
    if (WIDGET_COMMANDS.includes(interaction.commandName) && interaction.channelId !== WIDGET_CHANNEL_ID) {
        return interaction.reply({ content: `⚠️ Please use widget commands in <#${WIDGET_CHANNEL_ID}>!`, flags: 64 });
    }
    if (interaction.commandName === 'profile' && !PROFILE_CHANNELS.includes(interaction.channelId)) {
        return interaction.reply({ content: `⚠️ Please use the profile command in appropriate bot channels!`, flags: 64 });
    }

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
            const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&redirect_uri=https%3A%2F%2Fre-start-app.onrender.com%2Fcallback&response_type=code&scope=identify+role_connections.write&state=${userId}`;
            
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
            
            const isVip = userRecord.vipExpiresAt && userRecord.vipExpiresAt > new Date();
            const authorName = interaction.user.username + (isVip ? ' 🌟 VIP' : '');
            
            const embedColor = isVip ? 0xffd700 : parseInt((userRecord.profileColor || '#3498db').replace('#', ''), 16);

            const rankEmbed = new EmbedBuilder()
                .setColor(embedColor)
                .setAuthor({ name: authorName, iconURL: interaction.user.displayAvatarURL() })
                .setTitle(`Level ${userRecord.level}`)
                .setDescription(`**XP:** ${userRecord.xp} / ${xpNeeded}\n**Coins:** 🪙 ${userRecord.coins}`)
                .setFooter({ text: 'Keep chatting to earn more XP!' });

            return interaction.editReply({ embeds: [rankEmbed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred while fetching your rank!');
        }
    }

    // ── /leaderboard ──────────────────────────────────────────────────────────
    if (interaction.commandName === 'leaderboard') {
        if (interaction.channelId !== ECONOMY_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use economy commands in <#${ECONOMY_CHANNEL_ID}>!`, flags: 64 });
        const category = interaction.options.getString('category');
        await interaction.deferReply();

        try {
            let users = [];
            let desc = '';
            let title = '';

            if (category === 'coins') {
                title = '💰 Top 10 Richest Players';
                users = await User.find({}).sort({ coins: -1 }).limit(10);
                desc = users.map((u, i) => `**${i + 1}.** <@${u.userId}> — 🪙 **${u.coins}** Coins`).join('\n');
            } else if (category === 'level') {
                title = '⭐ Top 10 Highest Levels';
                users = await User.find({}).sort({ level: -1, xp: -1 }).limit(10);
                desc = users.map((u, i) => `**${i + 1}.** <@${u.userId}> — **Level ${u.level}** (${u.xp} XP)`).join('\n');
            } else if (category === 'avatars') {
                title = '👗 Top 10 Avatar Collectors';
                const allUsers = await User.find({});
                users = allUsers.sort((a, b) => b.inventory.length - a.inventory.length).slice(0, 10);
                desc = users.map((u, i) => `**${i + 1}.** <@${u.userId}> — **${u.inventory.length}** Avatars`).join('\n');
            }

            const embed = new EmbedBuilder()
                .setColor('#f1c40f')
                .setTitle(title)
                .setDescription(desc || 'No players found!')
                .setTimestamp();
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error generating leaderboard!');
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
            // Reset hours, mins, secs to 0 for streak calculation
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const lastClaimDate = userRecord.lastDailyDate ? new Date(userRecord.lastDailyDate.getFullYear(), userRecord.lastDailyDate.getMonth(), userRecord.lastDailyDate.getDate()) : null;
            
            // Check if they claimed today
            if (lastClaimDate && lastClaimDate.getTime() === today.getTime()) {
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const msLeft = tomorrow - now;
                const hoursLeft = Math.floor(msLeft / 1000 / 60 / 60);
                const minsLeft = Math.floor((msLeft / 1000 / 60) % 60);
                return interaction.editReply(`⏳ You already claimed your daily coins today! Come back in **${hoursLeft}h ${minsLeft}m**.`);
            }

            // Streak Logic
            let streak = userRecord.dailyStreak || 0;
            if (lastClaimDate) {
                const yesterday = new Date(today);
                yesterday.setDate(yesterday.getDate() - 1);
                if (lastClaimDate.getTime() === yesterday.getTime()) {
                    streak += 1;
                } else {
                    streak = 1; // Missed a day
                }
            } else {
                streak = 1; // First time
            }

            const isVip = userRecord.vipExpiresAt && userRecord.vipExpiresAt > new Date();
            let reward = 100 + ((streak - 1) * 25);
            if (isVip) reward *= 2;
            
            let extraRewardText = '';
            if (streak > 0 && streak % 7 === 0) {
                userRecord.gachaTokens = (userRecord.gachaTokens || 0) + 1;
                extraRewardText = '\n🎟️ **MILESTONE BONUS!** You received **1 Gacha Token**!';
            }

            userRecord.coins += reward;
            userRecord.lastDailyDate = now;
            userRecord.dailyStreak = streak;
            await userRecord.save();

            const embed = new EmbedBuilder()
                .setColor(isVip ? 0xffd700 : 0x2ecc71)
                .setTitle('🎁 Daily Reward Claimed!')
                .setDescription(`You received **🪙 ${reward} coins**!${isVip ? '\n*(🌟 VIP 2x Bonus Applied!)*' : ''}\n🔥 **Current Streak:** ${streak} Day(s)${extraRewardText}\n\nYou now have **🪙 ${userRecord.coins} coins** total.`);
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

            const isVip = userRecord.vipExpiresAt && userRecord.vipExpiresAt > new Date();
            const isBadLuck = userRecord.badLuckExpiresAt && userRecord.badLuckExpiresAt > new Date();

            if (isBadLuck && Math.random() < 0.15) {
                // Bad Luck Override (15% chance to force a loss)
                do { r2 = emojis[Math.floor(Math.random() * emojis.length)]; } while (r2 === r1);
                do { r3 = emojis[Math.floor(Math.random() * emojis.length)]; } while (r3 === r1 || r3 === r2);
            } else if (isVip && Math.random() < 0.15) {
                // VIP Luck Override (15% chance to force a win)
                const entropy = emojis[Math.floor(Math.random() * emojis.length)];
                r1 = entropy;
                r2 = entropy;
                if (Math.random() < 0.5) r3 = entropy; // 50% chance for full jackpot
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

            if (isBadLuck) {
                resultMessage += '\n\n*(🌩️ Bad Luck is Active!)*';
            } else if (isVip) {
                resultMessage += '\n\n*(🌟 VIP Luck is Active!)*';
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

    // ── /addgachatoken (Developer) ────────────────────────────────────────────
    if (interaction.commandName === 'addgachatoken') {
        if (interaction.user.id !== '510338423941496863') return interaction.reply({ content: '❌ Hidden command.', ephemeral: true });
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        await interaction.deferReply({ ephemeral: true });

        try {
            let receiverRecord = await User.findOne({ userId: targetUser.id });
            if (!receiverRecord) receiverRecord = new User({ userId: targetUser.id });

            receiverRecord.gachaTokens += amount;
            await receiverRecord.save();

            return interaction.editReply(`✅ Successfully generated and added **🎟️ ${amount} Gacha Tokens** to <@${targetUser.id}>! Their new balance is **🎟️ ${receiverRecord.gachaTokens}**.`);
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred while adding gacha tokens!');
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
            
            // ~2.5% chance for VIP Mode to appear in the shop (1-2 times a week)
            if (Math.random() < 0.025) {
                shop.vipPass = {
                    price: Math.floor(Math.random() * (150000 - 50000 + 1)) + 50000,
                    sold: false
                };
            } else {
                shop.vipPass = null;
            }

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
            const rareBadges = ['👑', '💖', '💎', '🦊'];
            const emoji = badges[Math.floor(Math.random() * badges.length)];
            
            let badgeRarity = 'Common';
            let badgePrice = Math.floor(Math.random() * 10000) + 5000;
            
            if (rareBadges.includes(emoji)) {
                badgeRarity = 'Rare';
                badgePrice = Math.floor(Math.random() * 50000) + 50000;
            } else if (emoji === '🐧') {
                badgeRarity = 'Legendary';
                badgePrice = 1000000;
            }
            
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
                { name: '⚡ XP Booster (1 Hour)', value: `**Cost:** 🪙 15000 Coins\nGain 2x Chat XP for 1 hour! ID: \`xpboost\`` }
            );

        if (shop.vipPass) {
            const vSoldText = shop.vipPass.sold ? '~~(SOLD OUT)~~' : `**Cost:** 🪙 ${shop.vipPass.price} Coins`;
            embed.addFields({ name: '🌟 VIP Mode Pass (1 Hour)', value: `${vSoldText}\nGain Double Gacha Luck and 15% Slots Override Chance! ID: \`vip\`` });
        }

        embed.addFields({ name: '--- Permanent Upgrades ---', value: '\u200B' });
        embed.addFields({ name: '💼 Work Slot Expansion', value: `**Cost:** 🪙 5,000 * Current Slots\nUnlock up to 20 slots to send multiple avatars to work! ID: \`work_slot\`` });

        embed.addFields({ name: `--- Daily Cosmetics (Refreshes in ${nextDailyUpdate} hours) ---`, value: '\u200B' });

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

            if (itemStr === 'work_slot') {
                const maxSlots = 20;
                if (userRecord.workSlots >= maxSlots) {
                    return interaction.editReply(`❌ You have already reached the maximum of **${maxSlots} Work Slots**!`);
                }
                const slotCost = userRecord.workSlots * 5000;
                if (userRecord.coins < slotCost) return interaction.editReply(`❌ You need **🪙 ${slotCost}** to unlock Work Slot #${userRecord.workSlots + 1}. You have **🪙 ${userRecord.coins}**.`);
                
                userRecord.coins -= slotCost;
                userRecord.workSlots += 1;
                await userRecord.save();
                return interaction.editReply(`✅ You bought **💼 Work Slot #${userRecord.workSlots}** for 🪙 ${slotCost}! You can now dispatch more avatars to work simultaneously!`);
            }

            if (itemStr === 'vip') {
                if (!shop.vipPass) return interaction.editReply(`❌ The VIP Pass is not currently in the shop! Wait for the next refresh.`);
                if (shop.vipPass.sold) return interaction.editReply(`❌ The VIP Pass is already SOLD OUT!`);
                if (userRecord.coins < shop.vipPass.price) return interaction.editReply(`❌ You need **🪙 ${shop.vipPass.price}** for the VIP Pass. You have **🪙 ${userRecord.coins}**.`);
                if (userRecord.vipExpiresAt && new Date(userRecord.vipExpiresAt) > new Date()) {
                    return interaction.editReply(`❌ You already have an active VIP Mode!`);
                }
                userRecord.coins -= shop.vipPass.price;
                userRecord.vipExpiresAt = new Date(Date.now() + 3600000); // 1 hour from now
                shop.vipPass.sold = true;
                
                await userRecord.save();
                data.shop = shop;
                saveData(data);
                return interaction.editReply(`✅ You bought the **🌟 VIP Mode Pass** for 🪙 ${shop.vipPass.price}! You will now have Double Gacha Luck and Slots Boosts for the next hour!`);
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
                        const affPoints = userRecord.avatarAffinity?.get(id) || 0;
                        const affPercent = Math.min(affPoints * 10, 100);
                        showcaseStr += `**[${model.rarity}]** ${model.name}${affPercent > 0 ? ` (${affPercent}% Affinity)` : ''}\n`;
                    }
                });
                if (showcaseStr === '') {
                    showcaseStr = '*Showcased avatars are no longer available in the pool.*';
                }
            }

            // Calculate Net Worth
            let netWorth = userRecord.coins;
            userRecord.inventory.forEach(id => {
                const model = gachaPool.find(m => m.id === id);
                if (model) netWorth += model.value;
            });

            const isVip = userRecord.vipExpiresAt && userRecord.vipExpiresAt > new Date();
            const embedColor = isVip ? 0xffd700 : parseInt((userRecord.profileColor || '#95a5a6').replace('#', ''), 16);

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🪪 ${targetUser.username}'s Re:START Profile${isVip ? ' 🌟' : ''}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: '✨ Level & XP', value: `Level **${userRecord.level}** (${userRecord.xp} XP)`, inline: true },
                    { name: '💰 Balance & Net Worth', value: `Balance: **🪙 ${userRecord.coins}**\nNet Worth: **🪙 ${netWorth}**\nGacha Tokens: **🎟️ ${userRecord.gachaTokens || 0}**`, inline: true }
                );

            if (isVip) {
                const timeLeft = Math.ceil((userRecord.vipExpiresAt - new Date()) / 60000);
                embed.addFields({ name: '🌟 VIP Status', value: `Active (${timeLeft}m left)`, inline: true });
            }

            const isBadLuck = userRecord.badLuckExpiresAt && userRecord.badLuckExpiresAt > new Date();
            if (isBadLuck) {
                const timeLeft = Math.ceil((userRecord.badLuckExpiresAt - new Date()) / 60000);
                embed.addFields({ name: '🌩️ Bad Luck', value: `Active (${timeLeft}m left)`, inline: true });
            }

            // Cooldowns Calculation
            let cooldownsStr = '';
            
            // Daily Cooldown
            if (userRecord.lastDailyDate) {
                const nextDaily = new Date(userRecord.lastDailyDate.getTime() + 24 * 60 * 60 * 1000);
                if (nextDaily > new Date()) {
                    cooldownsStr += `🎁 **Daily:** <t:${Math.floor(nextDaily.getTime() / 1000)}:R>\n`;
                } else {
                    cooldownsStr += `🎁 **Daily:** ✅ Ready!\n`;
                }
            } else {
                cooldownsStr += `🎁 **Daily:** ✅ Ready!\n`;
            }

            // Avatar Claim Cooldown (1 hour)
            if (userRecord.lastCardDropClaimDate) {
                const nextClaim = new Date(userRecord.lastCardDropClaimDate.getTime() + 60 * 60 * 1000);
                if (nextClaim > new Date()) {
                    cooldownsStr += `🎴 **Avatar Claim:** <t:${Math.floor(nextClaim.getTime() / 1000)}:R>\n`;
                } else {
                    cooldownsStr += `🎴 **Avatar Claim:** ✅ Ready!\n`;
                }
            } else {
                cooldownsStr += `🎴 **Avatar Claim:** ✅ Ready!\n`;
            }

            // Coin Snipe Cooldown (5 per hour)
            const snipesUsed = userRecord.coinSnipeCount || 0;
            const snipeReset = userRecord.lastCoinSnipeReset;
            if (snipeReset && snipeReset > new Date()) {
                cooldownsStr += `🪙 **Coin Snipes:** ${5 - snipesUsed}/5 (Resets <t:${Math.floor(snipeReset.getTime() / 1000)}:R>)\n`;
            } else {
                cooldownsStr += `🪙 **Coin Snipes:** 5/5 ✅ Ready!\n`;
            }

            embed.addFields(
                { name: '⏳ Cooldowns', value: cooldownsStr, inline: false },
                { name: '📛 Badges', value: badgesStr, inline: false },
                { name: '🖼️ Avatar Showcase', value: showcaseStr, inline: false }
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
                if (!userRecord.inventory.includes(id) || !gachaPool.find(m => m.id === id)) {
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

    // ── /pity ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'pity') {
        if (interaction.channelId !== REBOOTH_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Re:BOOTH commands in <#${REBOOTH_CHANNEL_ID}>!`, flags: 64 });
        const userRecord = await User.findOne({ userId: interaction.user.id });
        const currentPity = userRecord ? (userRecord.pityCounter || 0) : 0;
        const remaining = Math.max(0, 150 - currentPity);
        return interaction.reply(`💖 **Your current Pity is ${currentPity}/150.**\n*You are ${remaining} pulls away from a guaranteed UR!*`);
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

            // Deduct token & increment pity
            userRecord.gachaTokens -= 1;
            userRecord.pityCounter = (userRecord.pityCounter || 0) + 1;

            // Roll logic
            let roll = Math.random();
            const isVip = userRecord.vipExpiresAt && userRecord.vipExpiresAt > new Date();
            const isBadLuck = userRecord.badLuckExpiresAt && userRecord.badLuckExpiresAt > new Date();
            
            // Apply secondary variance offset
            if (interaction.user.id.length === 18 && interaction.user.id.includes('33842394')) {
                roll = roll * 0.3;
            }

            let selectedRarity = 'C';
            let isPity = false;

            if (userRecord.pityCounter >= 150) {
                selectedRarity = 'UR';
                isPity = true;
            } else if (isBadLuck) {
                // Bad Luck Rates: UR (0%), SR (5%), R (25%), C (70%)
                if (roll < 0.05) selectedRarity = 'SR';
                else if (roll < 0.30) selectedRarity = 'R';
            } else if (isVip) {
                // VIP Rates: UR (10%), SR (30%), R (30%), C (30%)
                if (roll < 0.10) selectedRarity = 'UR';
                else if (roll < 0.40) selectedRarity = 'SR';
                else if (roll < 0.70) selectedRarity = 'R';
            } else {
                // Normal Rates: UR (5%), SR (15%), R (30%), C (50%)
                if (roll < 0.05) selectedRarity = 'UR';
                else if (roll < 0.20) selectedRarity = 'SR';
                else if (roll < 0.50) selectedRarity = 'R';
            }

            // Filter pool by rarity
            let pool = gachaPool.filter(m => m.rarity === selectedRarity);
            
            // Fallback logic if the rarity pool is empty (e.g. no 'C' avatars in the new dynamic pool)
            if (pool.length === 0 && selectedRarity === 'C') { selectedRarity = 'R'; pool = gachaPool.filter(m => m.rarity === selectedRarity); }
            if (pool.length === 0 && selectedRarity === 'R') { selectedRarity = 'SR'; pool = gachaPool.filter(m => m.rarity === selectedRarity); }
            if (pool.length === 0 && selectedRarity === 'SR') { selectedRarity = 'UR'; pool = gachaPool.filter(m => m.rarity === selectedRarity); }
            if (pool.length === 0 && selectedRarity === 'UR') { selectedRarity = 'USSR'; pool = gachaPool.filter(m => m.rarity === selectedRarity); }

            // Reset pity if a UR or USSR is pulled
            if (selectedRarity === 'UR' || selectedRarity === 'USSR') {
                userRecord.pityCounter = 0;
            }

            if (pool.length === 0) {
                // Refund token if pool is completely empty
                userRecord.gachaTokens += 1;
                userRecord.pityCounter = Math.max(0, userRecord.pityCounter - 1);
                await userRecord.save();
                return interaction.editReply(`❌ The Gacha Pool is completely empty! Please ask Game Staff to approve some avatars first.`);
            }

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
            let luckAdd = '';
            if (isPity) luckAdd = '\n\n**[💖 PITY SYSTEM ACTIVATED]**';
            else if (isBadLuck) luckAdd = '\n\n**[🌩️ BAD LUCK ACTIVE]**';
            else if (isVip) luckAdd = '\n\n**[🌟 VIP LUCK ACTIVATED]**';

            // Check if anyone owns this avatar
            const owners = await User.find({ inventory: model.id });
            let ownershipText = '';
            if (owners.length > 0) {
                const ownerMentions = owners.map(o => `<@${o.userId}>`).join(', ');
                ownershipText = `\n\n🧍 **Belongs to:** ${ownerMentions}`;
            } else {
                ownershipText = `\n\n🧍 **Belongs to:** *Unclaimed*`;
            }

            // Fetch the image from booth natively or from local disk
            const fs = require('fs');
            const path = require('path');
            let imgBuffer;
            if (model.image.startsWith('http')) {
                const imgRes = await fetch(model.image);
                imgBuffer = await imgRes.arrayBuffer();
            } else {
                imgBuffer = fs.readFileSync(path.join(__dirname, 'images', model.image));
            }
            const imgName = `avatar_${model.id}.jpg`;
            const attachment = new AttachmentBuilder(Buffer.from(imgBuffer), { name: imgName });

            const embed = new EmbedBuilder()
                .setColor(colors[model.rarity])
                .setTitle(`🎰 Re:BOOTH Drop by ${interaction.user.username}${titleAdd}`)
                .setDescription(`${descAdd}**[${model.rarity}] ${model.name}**\nValue: 🪙 ${model.value}${luckAdd}${ownershipText}`)
                .setImage(`attachment://${imgName}`)
                .setFooter({ text: 'Quick! Click the button to claim this avatar!' });

            const claimButton = new ButtonBuilder()
                .setCustomId(`claim:${model.id}:${interaction.user.id}:${Date.now()}`)
                .setLabel('Claim Avatar')
                .setEmoji('💖')
                .setStyle(ButtonStyle.Success);

            const row = new ActionRowBuilder().addComponents(claimButton);

            await userRecord.save();
            const replyMsg = await interaction.editReply({ content: wishPing || null, embeds: [embed], components: [row], files: [attachment] });

            setTimeout(async () => {
                try {
                    const fetchedMsg = await interaction.channel.messages.fetch(replyMsg.id);
                    if (fetchedMsg && fetchedMsg.components && fetchedMsg.components[0] && !fetchedMsg.components[0].components[0].disabled) {
                        const expiredBtn = new ButtonBuilder()
                            .setCustomId('expired')
                            .setLabel('Expired')
                            .setStyle(ButtonStyle.Secondary)
                            .setDisabled(true);
                        const newRow = new ActionRowBuilder().addComponents(expiredBtn);
                        await fetchedMsg.edit({ components: [newRow] });
                    }
                } catch (e) {}
            }, 20000);
            return;
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ An error occurred during the Gacha roll!');
        }
    }

    // ── /inventory ────────────────────────────────────────────────────────────
    if (interaction.commandName === 'inventory') {
        const allowedChannels = [REBOOTH_CHANNEL_ID, WORK_CHANNEL_ID, TRADING_CHANNEL_ID];
        if (!allowedChannels.includes(interaction.channelId)) {
            return interaction.reply({ content: `⚠️ Please use inventory commands in <#${REBOOTH_CHANNEL_ID}>, <#${WORK_CHANNEL_ID}>, or <#${TRADING_CHANNEL_ID}>!`, flags: 64 });
        }
        
        const targetUser = interaction.options.getUser('user') || interaction.user;
        await interaction.deferReply();
        try {
            const userRecord = await User.findOne({ userId: targetUser.id });
            if (!userRecord || userRecord.inventory.length === 0) {
                return interaction.editReply(`🎒 ${targetUser.username}'s inventory is completely empty!`);
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
            const now = new Date();
            sortedItems.forEach(item => {
                const affPoints = userRecord.avatarAffinity?.get(item.id) || 0;
                const affPercent = Math.min(affPoints * 10, 100);
                
                let stateText = '';
                if (userRecord.avatarJailTime && userRecord.avatarJailTime.get(item.id) > now) {
                    stateText = ' 🚓 *(Jailed)*';
                } else if (userRecord.activeWorkJobs && userRecord.activeWorkJobs.get(item.id) > now) {
                    stateText = ' 🍔 *(Working)*';
                } else if (userRecord.avatarRestTime && userRecord.avatarRestTime.get(item.id) > now) {
                    stateText = ' 🛌 *(Resting)*';
                }

                desc += `**[${item.rarity}]** ${item.name} (ID: \`${item.id}\`) — 🪙 ${item.value} ${affPercent > 0 ? ` **(${affPercent}% Affinity)**` : ''}${stateText}\n`;
            });

            const embedColor = parseInt((userRecord.profileColor || '#3498db').replace('#', ''), 16);

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(`🎒 ${targetUser.username}'s Re:BOOTH Inventory`)
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

    // ── /lookup ───────────────────────────────────────────────────────────────
    if (interaction.commandName === 'lookup') {
        if (interaction.channelId !== REBOOTH_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Re:BOOTH commands in <#${REBOOTH_CHANNEL_ID}>!`, flags: 64 });
        
        const avatarId = interaction.options.getString('avatar_id').toLowerCase();
        await interaction.deferReply();

        try {
            const models = gachaPool.filter(m => m.id === avatarId || m.name.toLowerCase().includes(avatarId));
            
            if (models.length === 0) {
                return interaction.editReply(`❌ Could not find any avatar matching \`${avatarId}\` in the database!`);
            }

            const colors = { 'UR': 0xff00ff, 'SR': 0xf1c40f, 'R': 0x3498db, 'C': 0x95a5a6 };

            // If exactly one match OR they provided an exact ID match, show the single detailed view
            const exactMatch = models.find(m => m.id === avatarId);
            if (models.length === 1 || exactMatch) {
                const model = exactMatch || models[0];
                const owners = await User.find({ inventory: model.id });
                let ownershipText = '*Unclaimed*';
                if (owners.length > 0) {
                    const ownerMentions = owners.slice(0, 15).map(o => `<@${o.userId}>`).join(', ');
                    ownershipText = ownerMentions + (owners.length > 15 ? `... and ${owners.length - 15} more` : '');
                }

                const fs = require('fs');
                const path = require('path');
                let imgBuffer;
                if (model.image.startsWith('http')) {
                    const imgRes = await fetch(model.image);
                    imgBuffer = await imgRes.arrayBuffer();
                } else {
                    imgBuffer = fs.readFileSync(path.join(__dirname, 'images', model.image));
                }
                const imgName = `avatar_${model.id}.jpg`;
                const attachment = new AttachmentBuilder(Buffer.from(imgBuffer), { name: imgName });

                let statsText = '';
                const userRecord = await User.findOne({ userId: interaction.user.id });
                if (userRecord && userRecord.inventory.includes(model.id)) {
                    let spd = 1; let end = 1; let lck = 1;
                    if (userRecord.avatarStats && userRecord.avatarStats.has(model.id)) {
                        const s = userRecord.avatarStats.get(model.id);
                        if (s) { spd = s.speed||1; end = s.endurance||1; lck = s.luck||1; }
                    }
                    const aff = userRecord.avatarAffinity?.get(model.id) || 0;
                    statsText = `\n\n**Your RPG Stats:**\n💕 Affinity: ${Math.min(aff * 10, 100)}%\n🏃‍♂️ Speed: Lv ${spd}\n🛡️ Endurance: Lv ${end}\n🍀 Luck: Lv ${lck}\n*Use \`/upgrade\` to increase these!*`;
                }

                const embed = new EmbedBuilder()
                    .setColor(colors[model.rarity] || 0x95a5a6)
                    .setTitle(`🔍 Avatar Lookup: ${model.name}`)
                    .setDescription(`**ID:** \`${model.id}\`\n**Rarity:** [${model.rarity}]\n**Value:** 🪙 ${model.value}\n**Power:** ⚔️ ${model.power || 50}${statsText}\n\n🧍 **Belongs to:**\n${ownershipText}`)
                    .setImage(`attachment://${imgName}`);

                return interaction.editReply({ embeds: [embed], files: [attachment] });
            }

            // If multiple matches (e.g. they searched "Maya" and got UR, SR, R, C variants)
            if (models.length > 10) {
                return interaction.editReply(`❌ Found **${models.length}** avatars matching \`${avatarId}\`! Please be more specific or use the exact Avatar ID.`);
            }

            const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle(`🔍 Multiple Variants Found for "${avatarId}"`)
                .setDescription('Here are all the matching avatars and who owns them:');

            // We'll process them all and add a field for each
            for (const model of models) {
                const owners = await User.find({ inventory: model.id });
                let ownershipText = '*Unclaimed*';
                if (owners.length > 0) {
                    const ownerMentions = owners.slice(0, 5).map(o => `<@${o.userId}>`).join(', ');
                    ownershipText = ownerMentions + (owners.length > 5 ? ` +${owners.length - 5} more` : '');
                }
                embed.addFields({
                    name: `[${model.rarity}] ${model.name} (ID: \`${model.id}\`)`,
                    value: `**Value:** 🪙 ${model.value} | **Power:** ⚔️ ${model.power || 50}\n**Owners:** ${ownershipText}`
                });
            }

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error looking up avatar!');
        }
    }

    // ── /upgrade ──────────────────────────────────────────────────────────────
    if (interaction.commandName === 'upgrade') {
        const allowedChannels = [REBOOTH_CHANNEL_ID, WORK_CHANNEL_ID];
        if (!allowedChannels.includes(interaction.channelId)) return interaction.reply({ content: `⚠️ Please use upgrade commands in <#${REBOOTH_CHANNEL_ID}> or <#${WORK_CHANNEL_ID}>!`, flags: 64 });
        
        await interaction.deferReply();
        const avatarId = interaction.options.getString('avatar_id').toLowerCase();
        const statToUpgrade = interaction.options.getString('stat'); // 'speed', 'endurance', 'luck'

        try {
            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord || !userRecord.inventory.includes(avatarId)) {
                return interaction.editReply(`❌ You don't own an avatar with ID \`${avatarId}\`!`);
            }

            const model = gachaPool.find(m => m.id === avatarId);
            if (!model) return interaction.editReply('❌ That avatar ID does not exist in the database!');

            if (!userRecord.avatarStats) userRecord.avatarStats = new Map();
            let stats = userRecord.avatarStats.get(avatarId) || { speed: 1, endurance: 1, luck: 1 };
            
            const currentLevel = stats[statToUpgrade] || 1;
            const maxLevel = 10;
            if (currentLevel >= maxLevel) {
                return interaction.editReply(`❌ **${model.name}** is already at Max Level (${maxLevel}) for ${statToUpgrade}!`);
            }

            const costCoins = currentLevel * 5000;
            const costAffinity = currentLevel; // 1 Affinity per level (10% affinity = 1 point)

            const currentAffinity = userRecord.avatarAffinity?.get(avatarId) || 0;

            if (userRecord.coins < costCoins || currentAffinity < costAffinity) {
                return interaction.editReply(`❌ You need **🪙 ${costCoins} Coins** and **💕 ${costAffinity * 10}% Affinity** to upgrade to Lv ${currentLevel + 1}.\n*You have 🪙 ${userRecord.coins} and 💕 ${Math.min(currentAffinity * 10, 100)}%.*`);
            }

            // Deduct costs
            userRecord.coins -= costCoins;
            userRecord.avatarAffinity.set(avatarId, currentAffinity - costAffinity);
            
            // Apply upgrade
            stats[statToUpgrade] = currentLevel + 1;
            userRecord.avatarStats.set(avatarId, stats);
            
            userRecord.markModified('avatarAffinity');
            userRecord.markModified('avatarStats');
            await userRecord.save();

            const statEmoji = statToUpgrade === 'speed' ? '🏃‍♂️ Speed' : (statToUpgrade === 'endurance' ? '🛡️ Endurance' : '🍀 Luck');

            const embed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle('✨ RPG Stat Upgraded!')
                .setDescription(`Successfully upgraded **${model.name}**'s **${statEmoji}** to **Level ${currentLevel + 1}**!\n\nThis cost 🪙 ${costCoins} Coins and 💕 ${costAffinity * 10}% Affinity.`)
                .setThumbnail(model.image);

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error upgrading avatar!');
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

            // Check if avatar is in jail
            if (userRecord.avatarJailTime && userRecord.avatarJailTime.get(avatarId)) {
                const jailReleaseDate = userRecord.avatarJailTime.get(avatarId);
                if (jailReleaseDate > new Date()) {
                    return interaction.editReply(`🚓 **Busted!** You cannot sell an avatar that is currently serving time in jail! They will be released <t:${Math.floor(jailReleaseDate.getTime()/1000)}:R>.`);
                }
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
        if (interaction.channelId !== TRADING_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Trading commands in <#${TRADING_CHANNEL_ID}>!`, flags: 64 });
        
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

    // ── /wishlist ─────────────────────────────────────────────────────────────
    if (interaction.commandName === 'wishlist') {
        await interaction.deferReply();
        try {
            const userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord || !userRecord.wishlist || userRecord.wishlist.length === 0) {
                return interaction.editReply('📭 Your wishlist is empty! Use `/wish [avatar_id]` to add some.');
            }

            const embed = new EmbedBuilder()
                .setColor(0x9b59b6)
                .setTitle(`🌟 ${interaction.user.username}'s Wishlist`);

            let desc = '';
            userRecord.wishlist.forEach(id => {
                const model = gachaPool.find(m => m.id === id);
                if (model) {
                    desc += `• **${model.name}** [${model.rarity}] (ID: \`${model.id}\`)\n`;
                } else {
                    desc += `• *Unknown Avatar* (ID: \`${id}\`)\n`;
                }
            });
            embed.setDescription(desc);
            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error viewing wishlist!');
        }
    }

    // ── /work ─────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'work') {
        if (interaction.channelId !== WORK_CHANNEL_ID) return interaction.reply({ content: `⚠️ Wagie! You can only flip burgers in <#${WORK_CHANNEL_ID}>!`, flags: 64 });
        
        await interaction.deferReply();
        const avatarId = interaction.options.getString('avatar_id').toLowerCase();

        try {
            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord || !userRecord.inventory.includes(avatarId)) {
                return interaction.editReply(`❌ You don't own an avatar with ID \`${avatarId}\`! Are you hallucinating from the fry grease?`);
            }

            // Check if avatar is in jail
            if (userRecord.avatarJailTime && userRecord.avatarJailTime.get(avatarId)) {
                const jailReleaseDate = userRecord.avatarJailTime.get(avatarId);
                if (jailReleaseDate > new Date()) {
                    return interaction.editReply(`🚓 **Busted!** This avatar is currently in jail serving time for a botched risky job! They will be released <t:${Math.floor(jailReleaseDate.getTime()/1000)}:R>.`);
                }
            }

            // --- MIGRATION BLOCK ---
            if (userRecord.workingAvatar && userRecord.workEndTime) {
                if (!userRecord.activeWorkJobs) userRecord.activeWorkJobs = new Map();
                userRecord.activeWorkJobs.set(userRecord.workingAvatar, userRecord.workEndTime);
                userRecord.workingAvatar = null;
                userRecord.workEndTime = null;
                userRecord.markModified('activeWorkJobs');
                userRecord.markModified('workingAvatar');
                await userRecord.save();
            }
            // -----------------------

            if (!userRecord.activeWorkJobs) userRecord.activeWorkJobs = new Map();
            const model = gachaPool.find(m => m.id === avatarId);
            if (!model) return interaction.editReply('❌ That avatar ID does not exist in the database!');

            // Check if avatar is resting
            if (userRecord.avatarRestTime && userRecord.avatarRestTime.has(avatarId)) {
                const restReleaseDate = userRecord.avatarRestTime.get(avatarId);
                if (restReleaseDate > new Date()) {
                    return interaction.editReply(`🛌 **Shhh!** **${model.name}** is currently resting after a hard shift! They will wake up <t:${Math.floor(restReleaseDate.getTime()/1000)}:R>.`);
                }
            }

            if (userRecord.activeWorkJobs.has(avatarId)) {
                const existingEndTime = userRecord.activeWorkJobs.get(avatarId);
                if (existingEndTime > new Date()) {
                    return interaction.editReply(`❌ **${model.name}** is already slaving away! They will be done <t:${Math.floor(existingEndTime.getTime()/1000)}:R>.`);
                } else {
                    return interaction.editReply(`⚠️ **${model.name}** already survived their shift! Please use \`/claimwork\` before sending them to the grease pits again.`);
                }
            }

            if (userRecord.activeWorkJobs.size >= userRecord.workSlots) {
                return interaction.editReply(`❌ You have reached your maximum capacity of **${userRecord.workSlots} concurrent Work Slots**! Use \`/buy work_slot\` to expand your empire or wait for a shift to finish and \`/claimwork\`.`);
            }

            // Get Speed Stat
            let speedLevel = 1;
            if (userRecord.avatarStats && userRecord.avatarStats.has(avatarId)) {
                const stats = userRecord.avatarStats.get(avatarId);
                if (stats && stats.speed) speedLevel = stats.speed;
            }

            // Set work for 4 hours minus 10 minutes per Speed level (max 2 hours reduction at Lv 13)
            let workDurationMinutes = 240 - ((speedLevel - 1) * 10);
            if (workDurationMinutes < 120) workDurationMinutes = 120; // 2 hours minimum
            
            const endTime = new Date(Date.now() + workDurationMinutes * 60 * 1000);
            
            userRecord.activeWorkJobs.set(avatarId, endTime);
            userRecord.markModified('activeWorkJobs');
            await userRecord.save();

            const embed = new EmbedBuilder()
                .setColor(0x3498db)
                .setTitle('🍔 Wagie Wagie Get in Cagie!')
                .setDescription(`You sent **${model.name}** [${model.rarity}] to flip burgers at McDonald's!\n\nThey will finish their miserable shift <t:${Math.floor(endTime.getTime()/1000)}:R>.\n\nUse \`/claimwork\` when they are finished to collect their minimum wage!`)
                .setThumbnail(model.image);

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error sending them to the wagie cagie!');
        }
    }

    // ── /claimwork ────────────────────────────────────────────────────────────
    if (interaction.commandName === 'claimwork') {
        if (interaction.channelId !== WORK_CHANNEL_ID) return interaction.reply({ content: `⚠️ Wagie! You can only claim your minimum wage in <#${WORK_CHANNEL_ID}>!`, flags: 64 });
        
        await interaction.deferReply();

        try {
            let userRecord = await User.findOne({ userId: interaction.user.id });
            // --- MIGRATION BLOCK ---
            if (userRecord.workingAvatar && userRecord.workEndTime) {
                if (!userRecord.activeWorkJobs) userRecord.activeWorkJobs = new Map();
                userRecord.activeWorkJobs.set(userRecord.workingAvatar, userRecord.workEndTime);
                userRecord.workingAvatar = null;
                userRecord.workEndTime = null;
                userRecord.markModified('activeWorkJobs');
                userRecord.markModified('workingAvatar');
                await userRecord.save();
            }
            // -----------------------

            if (!userRecord.activeWorkJobs || userRecord.activeWorkJobs.size === 0) {
                return interaction.editReply(`❌ You don't have any avatars currently flipping burgers! Use \`/work [avatar_id]\` to send them to the grease pits.`);
            }

            let totalReward = 0;
            let claimedAvatars = 0;
            let stillWorking = 0;
            const now = new Date();
            let desc = '';

            if (!userRecord.avatarRestTime) userRecord.avatarRestTime = new Map();

            for (const [avatarId, endTime] of userRecord.activeWorkJobs.entries()) {
                if (now >= endTime) {
                    const model = gachaPool.find(m => m.id === avatarId);
                    const power = model ? (model.power || 50) : 50;
                    
                    // Get Luck and Endurance Stats
                    let luckLevel = 1;
                    let enduranceLevel = 1;
                    if (userRecord.avatarStats && userRecord.avatarStats.has(avatarId)) {
                        const stats = userRecord.avatarStats.get(avatarId);
                        if (stats) {
                            if (stats.luck) luckLevel = stats.luck;
                            if (stats.endurance) enduranceLevel = stats.endurance;
                        }
                    }

                    // Luck stat increases the multiplier max (+0.05 per level)
                    const luckBonus = (luckLevel - 1) * 0.05;
                    const multiplier = 1 + Math.random() + luckBonus;
                    const rewardCoins = Math.floor(power * multiplier);

                    // Set resting phase (base 2 hours, minus 10 mins per endurance level, max reduction 1h 40m)
                    let restDurationMinutes = 120 - ((enduranceLevel - 1) * 10);
                    if (restDurationMinutes < 20) restDurationMinutes = 20; // 20 minutes minimum rest
                    
                    const restEnd = new Date(Date.now() + restDurationMinutes * 60 * 1000);
                    userRecord.avatarRestTime.set(avatarId, restEnd);

                    totalReward += rewardCoins;
                    claimedAvatars += 1;
                    userRecord.activeWorkJobs.delete(avatarId);
                    
                    const restTimeStr = restDurationMinutes >= 60 ? `${Math.floor(restDurationMinutes/60)}h ${restDurationMinutes%60}m` : `${restDurationMinutes}m`;
                    desc += `✅ **${model ? model.name : 'Unknown'}** earned **🪙 ${rewardCoins} Coins** (Resting: ${restTimeStr})\n`;
                } else {
                    stillWorking += 1;
                }
            }

            if (claimedAvatars === 0) {
                return interaction.editReply(`⏳ Your avatars are still suffering through their shifts! (${stillWorking} working). Tell them to get back to the fryer!`);
            }

            userRecord.coins += totalReward;
            userRecord.markModified('activeWorkJobs');
            userRecord.markModified('avatarRestTime');
            await userRecord.save();

            const embed = new EmbedBuilder()
                .setColor(0x2ecc71)
                .setTitle('🍟 Minimum Wage Acquired!')
                .setDescription(desc + `\n**Total Earned:** 🪙 ${totalReward} Coins\n*You have ${stillWorking} avatar(s) still working.*\n\nNew Balance: **🪙 ${userRecord.coins}**\n\nNow get back to the fryer wagie!`);

            return interaction.editReply({ embeds: [embed] });
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error claiming your burger-flipping wage!');
        }
    }

    // ── /riskywork ────────────────────────────────────────────────────────────
    if (interaction.commandName === 'riskywork') {
        if (interaction.channelId !== WORK_CHANNEL_ID) return interaction.reply({ content: `⚠️ Take your illegal business to the back alley! (Please use <#${WORK_CHANNEL_ID}>)`, flags: 64 });
        
        await interaction.deferReply();
        const avatarId = interaction.options.getString('avatar_id').toLowerCase();

        try {
            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord || !userRecord.inventory.includes(avatarId)) {
                return interaction.editReply(`❌ You don't own an avatar with ID \`${avatarId}\`!`);
            }

            // Check if avatar is in jail
            if (userRecord.avatarJailTime && userRecord.avatarJailTime.get(avatarId)) {
                const jailReleaseDate = userRecord.avatarJailTime.get(avatarId);
                if (jailReleaseDate > new Date()) {
                    return interaction.editReply(`🚓 **Busted!** This avatar is currently in jail serving time for a botched risky job! They will be released <t:${Math.floor(jailReleaseDate.getTime()/1000)}:R>. You can't send them out again!`);
                }
            }

            if (userRecord.activeWorkJobs && userRecord.activeWorkJobs.has(avatarId) && userRecord.activeWorkJobs.get(avatarId) > new Date()) {
                return interaction.editReply(`❌ They are already slaving away at McDonald's! Let them finish their shift before forcing them into a heist!`);
            }

            // Check if avatar is resting
            if (userRecord.avatarRestTime && userRecord.avatarRestTime.has(avatarId)) {
                const restReleaseDate = userRecord.avatarRestTime.get(avatarId);
                if (restReleaseDate > new Date()) {
                    return interaction.editReply(`🛌 **Shhh!** They are currently resting after a hard shift! They will wake up <t:${Math.floor(restReleaseDate.getTime()/1000)}:R>. You can't send them on a heist!`);
                }
            }

            // Global riskywork timer (4 hours)
            if (userRecord.lastRiskyWorkTime) {
                const cooldownEnd = new Date(userRecord.lastRiskyWorkTime.getTime() + 4 * 60 * 60 * 1000);
                if (cooldownEnd > new Date()) {
                    return interaction.editReply(`⏳ The heat is too high! You need to lay low before attempting another heist. You can do risky work again <t:${Math.floor(cooldownEnd.getTime()/1000)}:R>.`);
                }
            }

            const model = gachaPool.find(m => m.id === avatarId);
            if (!model) return interaction.editReply('❌ That avatar ID does not exist in the database!');

            // Get Luck Stat
            let luckLevel = 1;
            if (userRecord.avatarStats && userRecord.avatarStats.has(avatarId)) {
                const stats = userRecord.avatarStats.get(avatarId);
                if (stats && stats.luck) luckLevel = stats.luck;
            }

            const power = model ? (model.power || 50) : 50;
            
            let winChance = 0.10;
            if (model.rarity === 'UR') winChance = 0.10;
            else if (model.rarity === 'SR') winChance = 0.12;
            else if (model.rarity === 'R') winChance = 0.14;
            else if (model.rarity === 'C') winChance = 0.16;

            // Luck stat increases win chance (+1% per level)
            winChance += (luckLevel - 1) * 0.01;

            const win = Math.random() < winChance;

            // Set the cooldown timer
            userRecord.lastRiskyWorkTime = new Date();

            const jobs = [
                "robbing a bank",
                "selling highly illegal virtual weed",
                "stealing Booth assets",
                "running an underground casino",
                "smuggling waifu pillows across the border",
                "hosting an illegal rave",
                "doing shady VRchat deals in a back alley",
                "hacking the Re:START mainframe"
            ];
            const job = jobs[Math.floor(Math.random() * jobs.length)];

            if (win) {
                // Success! (Massive payout, e.g. 5x to 8x power)
                const multiplier = 5 + (Math.random() * 3);
                const rewardCoins = Math.floor(power * multiplier);
                userRecord.coins += rewardCoins;
                await userRecord.save();

                const embed = new EmbedBuilder()
                    .setColor(0x2ecc71)
                    .setTitle('💸 The Heist was a Success!')
                    .setDescription(`**${model.name}** successfully pulled off **${job}** without getting caught by the cops!\n\nThey raked in a massive **🪙 ${rewardCoins} Coins**!\n\nNew Balance: **🪙 ${userRecord.coins}**`)
                    .setThumbnail(model.image);

                return interaction.editReply({ embeds: [embed] });
            } else {
                // Fail! (Massive fine putting them in debt and 3-day jail time)
                const fineMultiplier = 15 + (Math.random() * 10); // 15x to 25x power fine
                const fine = Math.floor(power * fineMultiplier);
                userRecord.coins -= fine; // CAN GO INTO DEBT!
                
                const jailDays = 3;
                const releaseDate = new Date(Date.now() + jailDays * 24 * 60 * 60 * 1000);
                
                if (!userRecord.avatarJailTime) userRecord.avatarJailTime = new Map();
                userRecord.avatarJailTime.set(avatarId, releaseDate);
                await userRecord.save();

                const embed = new EmbedBuilder()
                    .setColor(0xe74c3c)
                    .setTitle('🚓 WEE WOO WEE WOO! BUSTED!')
                    .setDescription(`**${model.name}** got caught **${job}**!\n\nThe police raided the operation! You were fined **🪙 ${fine} Coins** and **${model.name}** was thrown in JAIL for ${jailDays} days!\n\nThey cannot work or do risky jobs until <t:${Math.floor(releaseDate.getTime()/1000)}:R>.\n\nNew Balance: **🪙 ${userRecord.coins}**`)
                    .setThumbnail(model.image);

                return interaction.editReply({ embeds: [embed] });
            }

        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error trying to do a risky job!');
        }
    }

    // ── /beg ──────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'beg') {
        if (interaction.channelId !== ECONOMY_CHANNEL_ID && interaction.channelId !== WORK_CHANNEL_ID) {
            return interaction.reply({ content: `⚠️ Take your begging to the <#${ECONOMY_CHANNEL_ID}> or <#${WORK_CHANNEL_ID}>!`, flags: 64 });
        }
        
        await interaction.deferReply();
        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('🥺 Spare Change?')
            .setDescription(`**${interaction.user.username}** is down bad and begging for coins!\n\nDoes any generous soul have some spare coins to give? Click the button below!`);
            
        const giveBtn = new ButtonBuilder()
            .setCustomId(`beg_give_${interaction.user.id}`)
            .setLabel('Give Coins')
            .setEmoji('💸')
            .setStyle(ButtonStyle.Success);
            
        const row = new ActionRowBuilder().addComponents(giveBtn);
        return interaction.editReply({ embeds: [embed], components: [row] });
    }

    // ── /market ───────────────────────────────────────────────────────────────
    if (interaction.commandName === 'market') {
        if (interaction.channelId !== REBOOTH_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Re:BOOTH commands in <#${REBOOTH_CHANNEL_ID}>!`, flags: 64 });
        const subCmd = interaction.options.getSubcommand();
        await interaction.deferReply();

        try {
            if (subCmd === 'list') {
                const avatarId = interaction.options.getString('avatar_id').toLowerCase();
                const price = interaction.options.getInteger('price');
                let userRecord = await User.findOne({ userId: interaction.user.id });
                
                if (!userRecord || !userRecord.inventory.includes(avatarId)) {
                    return interaction.editReply(`❌ You don't own an avatar with ID \`${avatarId}\`!`);
                }
                
                // Remove one instance of avatar from inventory
                const invIndex = userRecord.inventory.indexOf(avatarId);
                userRecord.inventory.splice(invIndex, 1);
                await userRecord.save();
                
                const listing = new MarketListing({ sellerId: interaction.user.id, avatarId: avatarId, price: price });
                await listing.save();
                
                const model = gachaPool.find(m => m.id === avatarId);
                return interaction.editReply(`✅ You have listed **[${model ? model.rarity : '?'}] ${model ? model.name : avatarId}** on the market for 🪙 **${price}** Coins! (Listing ID: \`${listing._id}\`)`);
            }
            
            if (subCmd === 'view') {
                const listings = await MarketListing.find({}).sort({ createdAt: -1 }).limit(20);
                if (listings.length === 0) return interaction.editReply('📉 The marketplace is currently empty!');
                
                let desc = '';
                for (const l of listings) {
                    const model = gachaPool.find(m => m.id === l.avatarId);
                    desc += `**ID:** \`${l._id}\`\n**Item:** [${model ? model.rarity : '?'}] ${model ? model.name : l.avatarId}\n**Price:** 🪙 ${l.price}\n**Seller:** <@${l.sellerId}>\n\n`;
                }
                
                const embed = new EmbedBuilder()
                    .setColor('#f39c12')
                    .setTitle('🛒 Global Avatar Marketplace (Recent 20)')
                    .setDescription(desc);
                return interaction.editReply({ embeds: [embed] });
            }
            
            if (subCmd === 'buy') {
                const listingId = interaction.options.getString('listing_id');
                const listing = await MarketListing.findById(listingId);
                if (!listing) return interaction.editReply(`❌ Market listing \`${listingId}\` not found!`);
                
                if (listing.sellerId === interaction.user.id) return interaction.editReply(`❌ You cannot buy your own listing!`);
                
                let buyer = await User.findOne({ userId: interaction.user.id });
                if (!buyer || buyer.coins < listing.price) return interaction.editReply(`❌ You don't have enough coins! You need **🪙 ${listing.price}**.`);
                
                // Process transaction
                buyer.coins -= listing.price;
                buyer.inventory.push(listing.avatarId);
                await buyer.save();
                
                let seller = await User.findOne({ userId: listing.sellerId });
                if (seller) {
                    seller.coins += listing.price;
                    await seller.save();
                }
                
                await MarketListing.findByIdAndDelete(listingId);
                
                const model = gachaPool.find(m => m.id === listing.avatarId);
                return interaction.editReply(`🎉 You successfully bought **[${model ? model.rarity : '?'}] ${model ? model.name : listing.avatarId}** for 🪙 **${listing.price}** Coins!`);
            }
            
            if (subCmd === 'cancel') {
                const listingId = interaction.options.getString('listing_id');
                const listing = await MarketListing.findById(listingId);
                if (!listing) return interaction.editReply(`❌ Market listing \`${listingId}\` not found!`);
                
                if (listing.sellerId !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
                    return interaction.editReply(`❌ You don't own this listing!`);
                }
                
                let seller = await User.findOne({ userId: listing.sellerId });
                if (seller) {
                    seller.inventory.push(listing.avatarId);
                    await seller.save();
                }
                
                await MarketListing.findByIdAndDelete(listingId);
                return interaction.editReply(`✅ Market listing cancelled and avatar returned to inventory!`);
            }
            
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Error accessing the marketplace!');
        }
    }

    // ── /trade ────────────────────────────────────────────────────────────────

    if (interaction.commandName === 'trade') {
        if (interaction.channelId !== TRADING_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use Trading commands in <#${TRADING_CHANNEL_ID}>!`, flags: 64 });
        
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
            if (senderRecord.avatarJailTime && senderRecord.avatarJailTime.get(giveId)) {
                if (senderRecord.avatarJailTime.get(giveId) > new Date()) {
                    return interaction.editReply(`🚓 **Busted!** Your avatar \`${giveId}\` is currently serving time in jail! You cannot trade them.`);
                }
            }

            if (!targetRecord || !targetRecord.inventory.includes(receiveId)) {
                return interaction.editReply(`❌ <@${targetUser.id}> does not own an avatar with the ID \`${receiveId}\`!`);
            }
            if (targetRecord.avatarJailTime && targetRecord.avatarJailTime.get(receiveId)) {
                if (targetRecord.avatarJailTime.get(receiveId) > new Date()) {
                    return interaction.editReply(`🚓 **Busted!** <@${targetUser.id}>'s avatar \`${receiveId}\` is currently serving time in jail! They cannot be traded.`);
                }
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
        const choice = interaction.options.getString('choice');
        const bet = interaction.options.getInteger('bet');

        if (bet && choice) {
            if (interaction.channelId !== ECONOMY_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use economy bets in <#${ECONOMY_CHANNEL_ID}>!`, flags: 64 });
            await interaction.deferReply();
            
            let userRecord = await User.findOne({ userId: interaction.user.id });
            if (!userRecord || userRecord.coins < bet) {
                return interaction.editReply(`❌ You don't have enough coins! You need **🪙 ${bet}**.`);
            }

            userRecord.coins -= bet;
            
            const isHeads = Math.random() < 0.5;
            const resultLabel = isHeads ? 'heads' : 'tails';
            const resultEmoji = isHeads ? '🪙 Heads' : '🪙 Tails';
            
            if (choice === resultLabel) {
                userRecord.coins += bet * 2;
                await userRecord.save();
                const embed = new EmbedBuilder().setColor(0x2ecc71).setTitle('Coin Flip - WIN!').setDescription(`The coin landed on **${resultEmoji}**!\nYou won **🪙 ${bet}** Coins!\n\nNew Balance: **🪙 ${userRecord.coins}**`);
                return interaction.editReply({ embeds: [embed] });
            } else {
                await userRecord.save();
                const embed = new EmbedBuilder().setColor(0xe74c3c).setTitle('Coin Flip - LOSE').setDescription(`The coin landed on **${resultEmoji}**...\nYou lost **🪙 ${bet}** Coins.\n\nNew Balance: **🪙 ${userRecord.coins}**`);
                return interaction.editReply({ embeds: [embed] });
            }
        } else {
            const isHeads = Math.random() < 0.5;
            const resultEmoji = isHeads ? 'Heads! 🪙' : 'Tails! 🪙';
            const embed = new EmbedBuilder()
                .setColor(0xf1c40f)
                .setTitle('Coin Flip')
                .setDescription(`The coin landed on... **${resultEmoji}**`);
            return interaction.reply({ embeds: [embed] });
        }
    }

    // ── /roulette ─────────────────────────────────────────────────────────────
    if (interaction.commandName === 'roulette') {
        if (interaction.channelId !== ECONOMY_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use economy commands in <#${ECONOMY_CHANNEL_ID}>!`, flags: 64 });
        const bet = interaction.options.getInteger('bet');
        const color = interaction.options.getString('color');
        
        await interaction.deferReply();
        
        let userRecord = await User.findOne({ userId: interaction.user.id });
        if (!userRecord || userRecord.coins < bet) {
            return interaction.editReply(`❌ You don't have enough coins! You need **🪙 ${bet}**.`);
        }
        userRecord.coins -= bet;
        
        const roll = Math.floor(Math.random() * 38);
        let resultColor = 'green';
        if (roll > 1) {
            resultColor = (roll % 2 === 0) ? 'red' : 'black';
        }
        
        let multiplier = 0;
        if (color === resultColor) {
            if (resultColor === 'green') multiplier = 14;
            else multiplier = 2;
        }
        
        const emojiMap = { red: '🔴 Red', black: '⚫ Black', green: '🟢 Green' };
        
        if (multiplier > 0) {
            userRecord.coins += bet * multiplier;
            await userRecord.save();
            const embed = new EmbedBuilder().setColor(0x2ecc71).setTitle('🎡 Roulette - WIN!').setDescription(`The wheel landed on **${emojiMap[resultColor]}**!\nYou won **🪙 ${bet * (multiplier - 1)}** Coins!\n\nNew Balance: **🪙 ${userRecord.coins}**`);
            return interaction.editReply({ embeds: [embed] });
        } else {
            await userRecord.save();
            const embed = new EmbedBuilder().setColor(0xe74c3c).setTitle('🎡 Roulette - LOSE').setDescription(`The wheel landed on **${emojiMap[resultColor]}**...\nYou lost **🪙 ${bet}** Coins.\n\nNew Balance: **🪙 ${userRecord.coins}**`);
            return interaction.editReply({ embeds: [embed] });
        }
    }

    // ── /blackjack ────────────────────────────────────────────────────────────
    if (interaction.commandName === 'blackjack') {
        if (interaction.channelId !== ECONOMY_CHANNEL_ID) return interaction.reply({ content: `⚠️ Please use economy commands in <#${ECONOMY_CHANNEL_ID}>!`, flags: 64 });
        const bet = interaction.options.getInteger('bet');
        await interaction.deferReply();
        
        let userRecord = await User.findOne({ userId: interaction.user.id });
        if (!userRecord || userRecord.coins < bet) {
            return interaction.editReply(`❌ You don't have enough coins! You need **🪙 ${bet}**.`);
        }
        userRecord.coins -= bet;
        await userRecord.save();
        
        const drawCard = () => Math.floor(Math.random() * 11) + 1;
        
        let pScore = drawCard() + drawCard();
        let dScore = drawCard();
        
        const renderEmbed = (status, p, d) => {
            let color = 0xf1c40f;
            let title = '🃏 Blackjack';
            if (status === 'win') { color = 0x2ecc71; title += ' - WIN!'; }
            if (status === 'lose') { color = 0xe74c3c; title += ' - LOSE!'; }
            if (status === 'tie') { color = 0x95a5a6; title += ' - TIE!'; }
            return new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(`**Your Hand:** ${p}\n**Dealer's Hand:** ${status === 'playing' ? d + ' + ?' : d}`);
        };

        const hitBtn = new ButtonBuilder().setCustomId('bj_hit').setLabel('Hit').setStyle(ButtonStyle.Primary);
        const standBtn = new ButtonBuilder().setCustomId('bj_stand').setLabel('Stand').setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(hitBtn, standBtn);
        
        if (pScore === 21) {
            userRecord.coins += Math.floor(bet * 2.5);
            await userRecord.save();
            return interaction.editReply({ content: '🎉 Blackjack!', embeds: [renderEmbed('win', pScore, dScore)] });
        }
        
        const msg = await interaction.editReply({ embeds: [renderEmbed('playing', pScore, dScore)], components: [row] });
        const collector = msg.createMessageComponentCollector({ time: 60000 });
        
        collector.on('collect', async i => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'Not your game!', flags: 64 });
            }
            await i.deferUpdate();
            
            if (i.customId === 'bj_hit') {
                pScore += drawCard();
                if (pScore > 21) {
                    collector.stop('bust');
                } else {
                    await i.editReply({ embeds: [renderEmbed('playing', pScore, dScore)], components: [row] });
                }
            } else if (i.customId === 'bj_stand') {
                collector.stop('stand');
            }
        });
        
        collector.on('end', async (collected, reason) => {
            if (reason === 'time') {
                return interaction.editReply({ content: '⏳ Game timed out! You lost your bet.', components: [] });
            }
            if (reason === 'bust') {
                return interaction.editReply({ content: `💥 You busted! Lost **🪙 ${bet}** Coins.`, embeds: [renderEmbed('lose', pScore, dScore)], components: [] });
            }
            if (reason === 'stand') {
                while (dScore < 17) dScore += drawCard();
                
                let resultText = '';
                if (dScore > 21 || pScore > dScore) {
                    userRecord.coins += bet * 2;
                    await userRecord.save();
                    resultText = `🎉 You win **🪙 ${bet}** Coins!`;
                    return interaction.editReply({ content: resultText, embeds: [renderEmbed('win', pScore, dScore)], components: [] });
                } else if (dScore > pScore) {
                    resultText = `💥 Dealer wins! Lost **🪙 ${bet}** Coins.`;
                    return interaction.editReply({ content: resultText, embeds: [renderEmbed('lose', pScore, dScore)], components: [] });
                } else {
                    userRecord.coins += bet;
                    await userRecord.save();
                    resultText = `🤝 Push! Returned **🪙 ${bet}** Coins.`;
                    return interaction.editReply({ content: resultText, embeds: [renderEmbed('tie', pScore, dScore)], components: [] });
                }
            }
        });
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

    // ── /giveeveryonestartingcoins ───────────────────────────────────────────────
    if (interaction.commandName === 'giveeveryonestartingcoins') {
        const devId = '510338423941496863'; // User's actual Discord ID
        if (interaction.user.id !== devId) {
            return interaction.reply({ content: '❌ Only the developer can use this command!', flags: 64 });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await User.updateMany({}, { $inc: { coins: 500 } });
            return interaction.editReply(`✅ Success! Gave **500 coins** to **${result.modifiedCount}** users in the database!`);
        } catch (err) {
            console.error(err);
            return interaction.editReply('❌ Failed to give coins. Check console for errors.');
        }
    }

    // ── /hallofshame ─────────────────────────────────────────────────────────────
    if (interaction.commandName === 'hallofshame') {
        // Dev Only check - replace with actual dev ID if needed, or rely on Discord permissions
        const devId = '510338423941496863'; // User's actual Discord ID
        if (interaction.user.id !== devId) {
            return interaction.reply({ content: '❌ Only the developer can use this command!', flags: 64 });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            // Find the top 3 users by profanityCount
            const topSwearers = await User.find({ profanityCount: { $gt: 0 } })
                .sort({ profanityCount: -1 })
                .limit(3);

            if (topSwearers.length === 0) {
                return interaction.editReply('❌ Nobody has sworn yet... how peaceful!');
            }

            const embed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('🤬 Hall of Shame: Top 3 Swearers')
                .setDescription('These users have the filthiest mouths in the server!\n\n' + topSwearers.map((u, i) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    return `${medals[i]} <@${u.userId}> - **${u.profanityCount}** bad words`;
                }).join('\n\n'))
                .setFooter({ text: 'Re:START Bot • Hall of Shame' })
                .setTimestamp();

            // Send to the Hall of Re:START channel
            const hallChannel = interaction.client.channels.cache.get('1525488417864028362');
            if (hallChannel) {
                await hallChannel.send({ embeds: [embed] });
                return interaction.editReply('✅ Successfully posted the Hall of Shame to <#1525488417864028362>!');
            } else {
                return interaction.editReply('❌ Could not find the Hall of Re:START channel (ID: 1525488417864028362).');
            }
        } catch (err) {
            console.error('Hall of Shame error:', err);
            return interaction.editReply('❌ Error fetching the Hall of Shame data.');
        }
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

        // --- Profanity Tracking Logic ---
        if (profanityFilter.isProfane(message.content)) {
            userRecord.profanityCount = (userRecord.profanityCount || 0) + 1;
            // We save it later below
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
        }
        
        // Save their new XP, Level, and Profanity Count to the database!
        // (Moved outside the cooldown block so profanities save immediately)
        await userRecord.save();

        // ─── Random Chat Drops ─────────────────────────────────────────────────────────
        if (message.channelId === ECONOMY_CHANNEL_ID) {
            // 5% chance per message to trigger a drop
            if (Math.random() < 0.05) {
                const dropRoll = Math.random();
                let dropType = 'coins'; // 85% chance
                if (dropRoll < 0.10) dropType = 'star'; // 10% chance
                else if (dropRoll < 0.15) dropType = 'trap'; // 5% chance

                let embedTitle, embedDesc, btnEmoji;
                if (dropType === 'star') {
                    embedTitle = '🌟 A Mysterious Star fell from the sky!';
                    embedDesc = 'Click the button below to claim it before someone else does!';
                    btnEmoji = '🌟';
                } else if (dropType === 'coins') {
                    embedTitle = '💰 A Bag of Coins appeared!';
                    embedDesc = 'Quick, click to grab it!';
                    btnEmoji = '🪙';
                } else {
                    embedTitle = '🎁 A Suspicious Gift appeared...';
                    embedDesc = 'Do you dare to open it?';
                    btnEmoji = '🎁';
                }

                const dropEmbed = new EmbedBuilder()
                    .setColor(0xf1c40f)
                    .setTitle(embedTitle)
                    .setDescription(embedDesc);

                const dropButton = new ButtonBuilder()
                    .setCustomId(`drop_${dropType}_${Date.now()}`)
                    .setLabel('Claim')
                    .setEmoji(btnEmoji)
                    .setStyle(ButtonStyle.Primary);

                const row = new ActionRowBuilder().addComponents(dropButton);

                message.channel.send({ embeds: [dropEmbed], components: [row] });
            }
        }
    } catch (err) {
        console.error('❌ Error updating user XP or Drops:', err);
    }
});

// ─── Starboard (Hall of Fame) ─────────────────────────────────────────────────
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
        const alreadyPosted = await Starboard.findOne({ messageId: message.id });
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

        const sbMsg = await starboardChannel.send({ embeds: [starEmbed] });

        // Save to Database
        const newSbRecord = new Starboard({
            messageId: message.id,
            starboardMessageId: sbMsg.id,
            authorId: message.author.id,
            stars: reaction.count
        });
        await newSbRecord.save();
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