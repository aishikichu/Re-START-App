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
* **Re:BOOTH Gacha:** Over 2,000+ VRChat Booth Avatars to pull, collect, sell, and trade with multi-tier rarities (UR, SR, R, C).
* **Fun & Moderation:** Magic 8-ball, Starboard, auto-role panels, verification systems, and more.

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

### 🎰 The Re:BOOTH Gacha System
Spend your tokens to roll for 3D Booth Avatars! The pool contains **over 2,000 unique avatars**.
* Collect popular avatars like Maya, Imeris, Kikyo, and more.
* Experience the thrill of pulling a **[UR] Ultra Rare**, **[SR] Super Rare**, or **[R] Rare** variant.
* Set up a **Wishlist** and get notified when someone rolls your dream avatar!
* **Trade** avatars with other players, or **sell** duplicates back to the shop.

### 🪪 Profile Widget Stats
Hook directly into Discord's **Profile Widget API**. Users can type `/setstat` to instantly push custom labels and values directly to their in-app profile widget. No messy dashboards needed!

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

<div align="center">
  Made with 💜 by <a href="https://github.com/aishikichu">aishikichu</a>
</div>