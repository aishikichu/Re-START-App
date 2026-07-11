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
async function updatePlayerWidget(userId) {
    const data = getData();
    const u = (data.users || {})[userId] || {};
    try {
        const result = await client.rest.put(
            `/applications/${client.user.id}/users/${userId}/profile`,
            {
                body: {
                    stat1_title: u.stat1_title || 'Stat 1',   stat1_val: u.stat1_val || 'Not Set',
                    stat2_title: u.stat2_title || 'Stat 2',   stat2_val: u.stat2_val || 'Not Set',
                    stat3_title: u.stat3_title || 'Stat 3',   stat3_val: u.stat3_val || 'Not Set',
                    stat4_title: u.stat4_title || 'Stat 4',   stat4_val: u.stat4_val || 'Not Set',
                    stat5_title: u.stat5_title || 'Stat 5',   stat5_val: u.stat5_val || 'Not Set',
                    stat6_title: u.stat6_title || 'Stat 6',   stat6_val: u.stat6_val || 'Not Set',
                }
            }
        );
        console.log(`✅ Widget updated for ${userId}:`, JSON.stringify(result));
    } catch (err) {
        console.error(`❌ Widget update FAILED for ${userId}`);
        console.error(`   Status : ${err.status}`);
        console.error(`   Message: ${err.message}`);
        console.error(`   Body   :`, JSON.stringify(err.rawError ?? err));
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

].map(cmd => cmd.toJSON());

// ─── Ready Event ──────────────────────────────────────────────────────────────
client.once('ready', async () => {
    console.log(`✨ Re:START bot is online as ${client.user.tag}!`);
    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        const guildId = process.env.GUILD_ID;
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands });
        console.log(`✅ Slash commands registered to guild ${guildId}.`);
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

        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle(`✅ Slot #${slot} Updated!`)
            .addFields(
                { name: 'Title', value: title, inline: true },
                { name: 'Value', value: value, inline: true }
            )
            .setFooter({ text: 'Pushing to your widget...' });

        await interaction.reply({ embeds: [embed], ephemeral: true });
        await updatePlayerWidget(userId);
        return;
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
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

// ─── Keep-Alive HTTP Server ───────────────────────────────────────────────────
const http = require('http');
http.createServer((req, res) => {
    res.write("I'm alive!");
    res.end();
}).listen(process.env.PORT || 3000, () => {
    console.log(`🌐 Keep-alive server running on port ${process.env.PORT || 3000}`);
});