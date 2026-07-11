require('dotenv').config(); // Load .env variables first

const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    EmbedBuilder
} = require('discord.js');
const fs = require('fs');

// ─── Client Setup ────────────────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ─── Data Helpers ─────────────────────────────────────────────────────────────
function getUserData() {
    try {
        return JSON.parse(fs.readFileSync('./data.json', 'utf8'));
    } catch {
        return {};
    }
}

function saveUserData(data) {
    fs.writeFileSync('./data.json', JSON.stringify(data, null, 2));
}

// ─── Widget Updater ───────────────────────────────────────────────────────────
async function updatePlayerWidget(userId) {
    const savedData = getUserData();
    const u = savedData[userId] || {};
    try {
        await client.rest.put(
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
    } catch {
        console.log(`Could not update widget for ${userId} — they may not have authorized the app.`);
    }
}

// ─── Slash Command Definitions ────────────────────────────────────────────────
const slashCommands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('📖 Shows all Re:START bot commands and how to use them'),

    new SlashCommandBuilder()
        .setName('setstat')
        .setDescription('✏️ Set a custom stat on your profile widget')
        .addIntegerOption(opt =>
            opt.setName('slot')
                .setDescription('Slot number (1–6)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(6))
        .addStringOption(opt =>
            opt.setName('title')
                .setDescription('The stat label (e.g. Vibe)')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('value')
                .setDescription('The stat value (e.g. Chill)')
                .setRequired(true)),
].map(cmd => cmd.toJSON());

// ─── Ready Event — Register Slash Commands ────────────────────────────────────
client.once('ready', async () => {
    console.log(`✨ Re:START bot is online as ${client.user.tag}!`);

    try {
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
        console.log('✅ Slash commands registered globally.');
    } catch (err) {
        console.error('Failed to register slash commands:', err);
    }
});

// ─── Slash Command Handler ────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // ── /help ──────────────────────────────────────────────────────────────────
    if (interaction.commandName === 'help') {
        const embed = new EmbedBuilder()
            .setColor(0x9b59b6)
            .setTitle('✨ Re:START Bot — Command Guide')
            .setDescription('Here\'s everything this bot can do for you!\n\u200b')
            .addFields(
                {
                    name: '🪪 Profile Widget',
                    value: [
                        '`/setstat <slot> <title> <value>` — Set a custom stat on your widget (slots 1–6)',
                        '`!setstat <slot> <Title> | <Value>` — Same thing, prefix style',
                        '',
                        '**Example:** `/setstat 1 Vibe Chill`',
                        '**Example:** `!setstat 2 Currently | Vibing`',
                    ].join('\n')
                },
                { name: '\u200b', value: '\u200b' },
                {
                    name: '🎱 Fun Commands',
                    value: [
                        '`!8ball <question>` — Ask the magic 8-ball a yes/no question',
                        '`!coinflip` — Flip a coin (heads or tails)',
                        '`!roll [sides]` — Roll a dice (default: 6 sides, max: 100)',
                        '`!vibe` — Get your random vibe check for the day',
                        '`!rps <rock/paper/scissors>` — Play Rock Paper Scissors vs the bot',
                    ].join('\n')
                },
                { name: '\u200b', value: '\u200b' },
                {
                    name: '💡 Tips',
                    value: 'Users must **authorize the app** via OAuth2 for widget updates to work on their profile.',
                }
            )
            .setFooter({ text: 'Re:START Bot  •  Made with 💜' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // ── /setstat ───────────────────────────────────────────────────────────────
    if (interaction.commandName === 'setstat') {
        const slot  = interaction.options.getInteger('slot');
        const title = interaction.options.getString('title').trim();
        const value = interaction.options.getString('value').trim();
        const userId = interaction.user.id;

        const savedData = getUserData();
        if (!savedData[userId]) savedData[userId] = {};
        savedData[userId][`stat${slot}_title`] = title;
        savedData[userId][`stat${slot}_val`]   = value;
        saveUserData(savedData);

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
    }
});

// ─── Prefix Command Handler ───────────────────────────────────────────────────
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim();

    // ── !setstat ───────────────────────────────────────────────────────────────
    if (content.startsWith('!setstat ')) {
        const args = content.slice(9).trim();
        const slotNumber = args.charAt(0);

        if (!['1','2','3','4','5','6'].includes(slotNumber))
            return message.reply('❌ Choose a slot between 1–6. Example: `!setstat 1 Vibe | Chill`');

        const rest = args.slice(1).trim();
        if (!rest.includes('|'))
            return message.reply('❌ Use a `|` to separate Title and Value. Example: `!setstat 1 Vibe | Chill`');

        const [titleText, valueText] = rest.split('|').map(s => s.trim());
        const userId = message.author.id;
        const savedData = getUserData();

        if (!savedData[userId]) savedData[userId] = {};
        savedData[userId][`stat${slotNumber}_title`] = titleText;
        savedData[userId][`stat${slotNumber}_val`]   = valueText;
        saveUserData(savedData);

        await message.reply(`✅ Slot #${slotNumber} updated!\n**Title:** ${titleText}\n**Value:** ${valueText}\n*Pushing to your widget...*`);
        await updatePlayerWidget(userId);
        return;
    }

    // ── !8ball ─────────────────────────────────────────────────────────────────
    if (content.startsWith('!8ball ')) {
        const question = content.slice(7).trim();
        if (!question) return message.reply('❓ Ask me a question! Example: `!8ball Will I win today?`');

        const answers = [
            '🟢 It is certain.',
            '🟢 Without a doubt.',
            '🟢 Yes, definitely!',
            '🟢 You may rely on it.',
            '🟢 As I see it, yes.',
            '🟡 Reply hazy, try again.',
            '🟡 Ask again later.',
            '🟡 Cannot predict now.',
            '🟡 Concentrate and ask again.',
            '🔴 Don\'t count on it.',
            '🔴 My reply is no.',
            '🔴 My sources say no.',
            '🔴 Outlook not so good.',
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

        return message.reply({ embeds: [embed] });
    }

    // ── !coinflip ──────────────────────────────────────────────────────────────
    if (content === '!coinflip') {
        const result = Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!';
        const embed = new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('Coin Flip')
            .setDescription(`The coin landed on... **${result}**`);
        return message.reply({ embeds: [embed] });
    }

    // ── !roll ──────────────────────────────────────────────────────────────────
    if (content.startsWith('!roll')) {
        const sidesArg = parseInt(content.split(' ')[1]);
        const sides = (!isNaN(sidesArg) && sidesArg >= 2 && sidesArg <= 100) ? sidesArg : 6;
        const result = Math.floor(Math.random() * sides) + 1;

        const embed = new EmbedBuilder()
            .setColor(0xe74c3c)
            .setTitle('🎲 Dice Roll')
            .setDescription(`Rolling a **d${sides}**...\nYou got: **${result}**`);
        return message.reply({ embeds: [embed] });
    }

    // ── !vibe ──────────────────────────────────────────────────────────────────
    if (content === '!vibe') {
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
            .setDescription(`${message.author}, your vibe today is:\n\n# ${v.label}`);
        return message.reply({ embeds: [embed] });
    }

    // ── !rps ───────────────────────────────────────────────────────────────────
    if (content.startsWith('!rps ')) {
        const choices = ['rock', 'paper', 'scissors'];
        const emojis  = { rock: '🪨', paper: '📄', scissors: '✂️' };
        const playerRaw = content.split(' ')[1]?.toLowerCase();

        if (!choices.includes(playerRaw))
            return message.reply('❌ Choose `rock`, `paper`, or `scissors`. Example: `!rps rock`');

        const botChoice = choices[Math.floor(Math.random() * 3)];

        let result, color;
        if (playerRaw === botChoice) {
            result = "🤝 It's a tie!";
            color  = 0xf1c40f;
        } else if (
            (playerRaw === 'rock'     && botChoice === 'scissors') ||
            (playerRaw === 'paper'    && botChoice === 'rock')     ||
            (playerRaw === 'scissors' && botChoice === 'paper')
        ) {
            result = '🎉 You win!';
            color  = 0x2ecc71;
        } else {
            result = '😈 Bot wins!';
            color  = 0xe74c3c;
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle('Rock Paper Scissors')
            .addFields(
                { name: 'You',  value: `${emojis[playerRaw]} ${playerRaw}`,  inline: true },
                { name: 'Bot',  value: `${emojis[botChoice]} ${botChoice}`,  inline: true },
                { name: 'Result', value: `**${result}**` }
            );
        return message.reply({ embeds: [embed] });
    }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);

// ─── Keep-Alive HTTP Server ───────────────────────────────────────────────────
// Keeps the bot alive on hosting platforms (Render, Railway, Glitch, etc.)
const http = require('http');
http.createServer((req, res) => {
    res.write("I'm alive!");
    res.end();
}).listen(process.env.PORT || 3000, () => {
    console.log(`🌐 Keep-alive server running on port ${process.env.PORT || 3000}`);
});