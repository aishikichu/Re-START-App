<div align="center">

![Re:START Banner](banner.png)

# Re:START App

**A full-featured Discord bot featuring an interactive Economy, a massive Booth Avatar Gacha system, and Profile Widget stats syncing!**

[![Discord.js](https://img.shields.io/badge/discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.js.org)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/license-ISC-blue?style=for-the-badge)](LICENSE)

</div>

---

## 🤔 What is this?

**Re:START** is a fully comprehensive Discord bot for your community. It features:
* **Profile Widget Sync:** Let users customize their own Discord Profile Widget stats natively.
* **Massive Economy:** Chat XP, Leveling, Coin drops, and a Dynamic Shop where prices fluctuate!
* **Re:BOOTH Gacha:** A dynamically curated pool of VRChat Booth Avatars to pull, collect, sell, and trade. Staff can fetch the latest popular Booth avatars directly into Discord and approve them into the pool with custom rarities (UR, SR, R). The pool is securely stored in MongoDB to prevent ephemeral disk wipes.
* **Fun & Moderation:** Magic 8-ball, Starboard, auto-role panels, verification systems, and an automated **Profanity Filter** equipped with a Developer-only **Hall of Shame** leaderboard!

> 💡 **A Quick Note:** *I originally built this bot specifically for my personal friend group's Discord server, rather than as a massive public community bot. However, it's completely open-source! Feel free to use, modify, and host this code for your own community.*

---

## 📚 Documentation & Setup

**Want to see everything the bot can do?**
Check out the full **[Re:START Wiki](docs/WIKI.md)** for a complete breakdown of all commands, features, and systems!

**Need help setting up the Profile Widget?**
Check out our step-by-step **[User Guide Documentation](https://docs.google.com/document/d/1ZFgmAhg50SeUP5QhYaNafr691wUi6MXR229VzbaZmyg/edit?usp=sharing)**.

---

## 🌟 Core Features Overview

### 💸 Dynamic Economy & Leveling
The server feels alive! Users gain XP and Coins just by chatting. 
Random **Coin Drops** appear in the chat for the fastest clicker to claim. Use your coins to gamble on the **Slot Machine**, or spend them in the **Dynamic Shop** where prices fluctuate every 3 hours based on a simulated market economy! 
* Keep an eye out for the elusive **🌟 VIP Pass** in the shop, which grants Double Gacha Luck, 2x Daily Coins, and golden profile flair for 1 hour!

### 🎰 The Re:BOOTH Gacha System
Spend your tokens to roll for 3D Booth Avatars! The pool is completely dynamic and community-curated.
* **Staff Curation:** Game Staff can use `/fetchavatars` to scrape the top 50 newest popular VRChat avatars directly from Booth.pm and approve them into the pool via a custom UI modal!
* Experience the thrill of pulling a **[UR] Ultra Rare**, **[SR] Super Rare**, or **[R] Rare** variant of the most popular community-approved avatars.
* Set up a **Wishlist** and get notified when someone rolls your dream avatar!
* **Lookup** the database to find all variants of an avatar and see who owns them.
* **Trade** avatars with other players, or **sell** duplicates back to the shop.

### 🪪 Profile Widget Stats & In-Server Profiles
* Hook directly into Discord's **Profile Widget API**. Users can type `/setstat` to instantly push custom labels and values directly to their in-app profile widget. No messy dashboards needed!
* Or view your **In-Server Profile** with `/profile` to see your Level, Net Worth, unlocked Badges, and showcase your favorite avatars!

---

## 🚀 Getting Started (For Developers)

### Prerequisites
- [Node.js](https://nodejs.org) v18 or higher
- A [MongoDB Atlas](https://www.mongodb.com/atlas/database) Cluster URI
- A Discord Bot Token from the [Discord Developer Portal](https://discord.com/developers/applications)

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/aishikichu/Re-START-App.git
cd Re-START-App

# 2. Install dependencies
npm install

# 3. Start the bot
node index.js
```

### Environment Variables (.env)
Create a `.env` file in the root directory (or set these in your hosting platform like Render):
```env
DISCORD_TOKEN=your_bot_token_here
MONGO_URI=mongodb+srv://username:password@cluster0.mongodb.net/?retryWrites=true&w=majority
```

---

## 🛡️ Required Bot Permissions & Intents

Make sure these are enabled in the [Discord Developer Portal](https://discord.com/developers/applications):

- **Intents:** `Guilds`, `Guild Messages`, `Message Content`, `Guild Members`
- **Permissions:** `Send Messages`, `Read Message History`, `Manage Roles`, `Embed Links`

---

## 🛡️ Disclaimer / Copyright Notice

This bot was created purely as a **non-commercial fan project** for a private group of friends. 
- **No 3D Models Distributed:** This bot only displays the promotional cover art and names of the avatars. No actual `.unitypackage` files, textures, or 3D assets are distributed.
- **Support the Creators:** This gacha game is meant to act as free exposure for these amazing VRChat creators. If you roll an avatar you like in the bot, please visit [Booth.pm](https://booth.pm/) to purchase the official model from the original creator!
- **Not Affiliated:** We are not affiliated with, endorsed by, or sponsored by Booth, Pixiv, or any of the individual 3D model creators featured in the Re:BOOTH system. 

*(If you are a creator and would like your avatar's promotional image removed from this fan project's repository, please open an issue and it will be removed immediately.)*

---

<div align="center">
  Made with 💜 by <a href="https://github.com/aishikichu">aishikichu</a>
</div>