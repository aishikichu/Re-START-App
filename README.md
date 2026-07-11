<div align="center">

# ✨ Re:START — Custom Stat Widget Bot

**A Discord bot that lets your server members customize their own profile widget stats — in real time.**

[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![License](https://img.shields.io/badge/license-ISC-blue?style=for-the-badge)](LICENSE)

</div>

---

## 🤔 What is this?

**Re:START** is a lightweight Discord bot that hooks into Discord's **Profile Widget API** to push custom stat labels and values directly onto a user's in-app profile widget — no dashboard needed.

Users just type a single command in any channel, and their widget updates instantly. 6 customizable slots, fully personal, fully persistent.

---

## 🎮 Commands

### 🪪 Profile Widget

Each Discord user gets **6 stat slots** on their profile widget. They can set any title and value they want.

| Command | Description |
|---|---|
| `/setstat <slot> <title> <value>` | Set a widget stat via slash command |
| `!setstat <slot> <Title> \| <Value>` | Set a widget stat via prefix command |

**Examples:**
```
/setstat 1 Vibe Chill
!setstat 2 Currently Playing | Valorant
!setstat 3 Hours Slept | 3 (send help)
!setstat 4 Mood | 💀
```

Each command:
1. 💾 Saves your stat locally to `data.json`
2. 📡 Immediately pushes the update to Discord's Widget API
3. ✅ Replies with a confirmation so you know it worked

---

### 🎉 Fun Commands

| Command | Description |
|---|---|
| `!8ball <question>` | Ask the magic 8-ball a yes/no question |
| `!coinflip` | Flip a coin — heads or tails |
| `!roll [sides]` | Roll a dice (default d6, up to d100) |
| `!vibe` | Get your random vibe check for the day |
| `!rps <rock/paper/scissors>` | Play Rock Paper Scissors vs the bot |

**Examples:**
```
!8ball Will I win today?
!coinflip
!roll 20
!vibe
!rps scissors
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) v18 or higher
- A Discord Bot Token from the [Discord Developer Portal](https://discord.com/developers/applications)
- Your bot must have the **Message Content** intent enabled

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/aishikichu/Re-START-App.git
cd Re-START-App

# 2. Install dependencies
npm install

# 3. Set your bot token as an environment variable
#    Windows (PowerShell)
$env:DISCORD_TOKEN = "your-bot-token-here"

#    macOS / Linux
export DISCORD_TOKEN="your-bot-token-here"

# 4. Start the bot
node index.js
```

> 💡 **Tip:** For persistent environment variables, use a `.env` file with the [`dotenv`](https://www.npmjs.com/package/dotenv) package, or set them in your hosting platform's dashboard.

---

## 🔧 Configuration

| Variable         | Description                          | Required |
|------------------|--------------------------------------|----------|
| `DISCORD_TOKEN`  | Your Discord bot's secret token      | ✅ Yes   |

Stat data is stored locally in `data.json` — no database needed.

---

## 📁 Project Structure

```
Re-START-App/
├── index.js        # Main bot logic & command handler
├── data.json       # Persistent stat storage (auto-managed)
├── package.json    # Project metadata & dependencies
└── .gitignore      # Ignores node_modules & sensitive files
```

---

## 🛡️ Required Bot Permissions & Intents

Make sure these are enabled in the [Discord Developer Portal](https://discord.com/developers/applications):

- **Intents:** `Guilds`, `Guild Messages`, `Message Content`
- **Permissions:** `Send Messages`, `Read Message History`

> ⚠️ Users must also **authorize your app** via OAuth2 for the widget push to work on their profile.

---

---

<div align="center">
  Made with 💜 by <a href="https://github.com/aishikichu">aishikichu</a>
</div>