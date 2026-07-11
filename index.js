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
    PermissionFlagsBits
} = require('discord.js');
const fs = require('fs');
const express = require('express');
const app = express();

// ─── Client Setup ─────────────────────────────────────────────────────────────
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
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
// Uses the /identities/0/profile PATCH endpoint via user's personal Bearer token
async function updatePlayerWidget(userId) {
    const data = getData();
    const u = (data.users || {})[userId] || {};

    if (!u.tokens || !u.tokens.access_token) {
        console.log(`⚠️ No access token for ${userId}. Cannot update widget.`);
        return { success: false, reason: 'unauthorized' };
    }

    // Refresh token if expired
    if (Date.now() >= (u.tokens.expires_at - 60000)) {
        try {
            console.log(`🔄 Refreshing token for ${userId}...`);
            const refreshRes = await fetch('https://discord.com/api/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({
                    client_id: client.user.id,
                    client_secret: process.env.DISCORD_CLIENT_SECRET,
                    grant_type: 'refresh_token',
                    refresh_token: u.tokens.refresh_token
                }),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const refreshData = await refreshRes.json();
            if (refreshData.error) throw new Error(refreshData.error);
            
            u.tokens.access_token = refreshData.access_token;
            u.tokens.refresh_token = refreshData.refresh_token;
            u.tokens.expires_at = Date.now() + (refreshData.expires_in * 1000);
            saveData(data);
        } catch (err) {
            console.error(`❌ Failed to refresh token for ${userId}:`, err.message);
            return { success: false, reason: 'expired' };
        }
    }

    // Build dynamic fields
    const dynamicFields = [];
    for (let i = 1; i <= 6; i++) {
        const title = u[`stat${i}_title`];
        const val   = u[`stat${i}_val`];
        if (title && val) {
            dynamicFields.push({ type: 1, name: title, value: val });
        }
    }

    if (dynamicFields.length === 0) return { success: true, ignored: true };

    try {
        const patchRes = await fetch(`https://discord.com/api/v10/applications/${client.user.id}/users/${userId}/identities/0/profile`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${u.tokens.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ data: { dynamic: dynamicFields } })
        });
        
        if (!patchRes.ok) {
            const errData = await patchRes.json();
            throw new Error(`Status ${patchRes.status}: ${JSON.stringify(errData)}`);
        }
        
        console.log(`✅ Widget updated for ${userId} with fields:`, dynamicFields.map(f => f.name));
        return { success: true };
    } catch (err) {
        console.error(`❌ Widget update FAILED for ${userId}:`, err.message);
        return { success: false, reason: 'api_error' };
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
        console.error('Failed to register slash commands:', err);
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
                        '**Example:** `/setstat 1 Vibe Chill`',
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
        const slot  = interaction.options.getInteger('slot');
        const title = interaction.options.getString('title').trim();
        const value = interaction.options.getString('value').trim();
        const userId = interaction.user.id;

        const data = getData();
        if (!data.users) data.users = {};
        if (!data.users[userId]) data.users[userId] = {};
        data.users[userId][`stat${slot}_title`] = title;
        data.users[userId][`stat${slot}_val`]   = value;
        saveData(data);

        // Check if user is authorized and update widget
        const authStatus = await updatePlayerWidget(userId);

        if (authStatus && !authStatus.success && (authStatus.reason === 'unauthorized' || authStatus.reason === 'expired')) {
            const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&redirect_uri=https%3A%2F%2Fre-start-app.onrender.com%2Fcallback&response_type=code&scope=identify+openid+sdk.social_layer&state=${userId}`;
            
            const embed = new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle('⚠️ Link Your Discord Account')
                .setDescription(`Your stat was saved, but I need permission to update your profile widget!\n\n[**Click here to Authorize**](${oauthUrl})\n\n*(You only have to do this once!)*`);
            
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`✅ Slot #${slot} Updated!`)
            .addFields(
                { name: 'Title', value: title, inline: true },
                { name: 'Value', value: value, inline: true }
            )
            .setFooter({ text: authStatus && !authStatus.success ? '⚠️ Stat saved, but widget API error occurred' : 'Pushed to your widget!' });

        return interaction.reply({ embeds: [embed], ephemeral: true });
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

// ─── Login ────────────────────────────────────────────────────────────────────
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