# Re:START Bot Wiki

Welcome to the **Re:START Bot Wiki**! This documentation covers all the features, commands, and systems integrated into the bot, ranging from the profile widget to the economy and gacha system.

---

## 📑 Table of Contents
1. [General & Profile Widget](#1-general--profile-widget)
2. [Fun & Games](#2-fun--games)
3. [Economy & Leveling](#3-economy--leveling)
4. [Re:BOOTH Gacha System](#4-rebooth-gacha-system)
5. [Passive Features](#5-passive-features)
6. [Admin Commands](#6-admin-commands)

---

## 1. General & Profile Widget
Re:START features a unique **Profile Widget** that syncs custom stats directly to your Discord profile via OAuth2. 

* **`/help`** — Shows the in-game command guide.
* **`/setstat <slot 1-6> <title> <value>`** — Updates a specific slot on your profile widget. (e.g., `/setstat 1 Vibe Chill`). 
  * *Note:* The first time you use this, the bot will send you a secure Authorization link to connect your Discord profile to the widget app.

*(For an in-depth setup guide with pictures, check out the `User-Guide.md` file in the docs folder!)*

---

## 2. Fun & Games
Take a break and interact with the bot using these fun, randomized commands:

* **`/8ball <question>`** — Ask the magic 8-ball a yes/no question.
* **`/coinflip`** — Flips a coin (Heads or Tails).
* **`/roll [sides]`** — Rolls a dice. Defaults to a 6-sided die, but you can specify up to 100 sides!
* **`/vibe`** — Get your random vibe check for the day (e.g., "Main character energy", "Running on caffeine").
* **`/rps <choice>`** — Play Rock, Paper, Scissors against the bot.

---

## 3. Economy & Leveling
Chat to earn XP, level up, and collect coins to spend in the Re:BOOTH shop!

* **`/rank`** — Check your current Level, XP, and Coin balance.
* **`/daily`** — Claim your free daily coins (available once every 24 hours).
* **`/slots <bet>`** — Bet your coins on the slot machine! Win 2x your bet for matching two emojis, or 5x for a Jackpot!
* **`/give <user> <amount>`** — Transfer your coins to another user.

---

## 4. Re:BOOTH Gacha System
The bot features a fully integrated Gacha system where you can collect 3D Booth Avatars!

* **`/shop`** — View the server shop. Currently, you can buy **Gacha Tokens** for 500 Coins each.
* **`/buy <item>`** — Purchase an item from the shop (e.g., `/buy token`).
* **`/gacha`** — Spend 1 Gacha Token to roll for a random Re:BOOTH Avatar. Rarities range from Common (C) up to Ultra Rare (UR).
* **`/inventory`** — View your collection of Booth Avatars, your total Gacha Tokens, and the combined net worth of your inventory.
* **`/sell <avatar_id>`** — Sell an avatar you own back to the shop for its coin value.
* **`/wish <avatar_id>`** — Add an avatar to your wishlist (Max 5). You'll be automatically pinged if someone else rolls an avatar you want!
* **`/trade <user> <give_id> <receive_id>`** — Propose a trade with another user. They will receive an interactive embed with buttons to Accept or Decline the trade.

---

## 5. Passive Features
These features run automatically in the background:

* **Chat XP Leveling:** You gain between 15-25 XP every time you chat! There is a 60-second cooldown between messages to prevent spamming. Earning enough XP automatically increases your Level!
* **Starboard (Hall of Fame):** If any message in the server receives **3 or more ⭐ reactions**, the bot will automatically immortalize it in the dedicated Starboard channel, along with a link to jump to the original message.

---

## 6. Admin Commands
These commands are reserved for server administrators and require the **Manage Roles** permission.

* **`/setupverify`** — Posts the server verification panel. Users click the "Verify Me!" button to receive the `Verified Homies` role.
* **`/setuproles`** — Posts the self-assignable Role Panel (Artist, VRChat, Eclipticers). Users can click buttons to toggle these roles.
* **`/addrole <name> <color> <emoji>`** — Adds a new custom role to the Role Panel dynamically.
* **`/issueidentity <user>`** — Manually issues a widget identity for a user (useful for troubleshooting backend OAuth2 sync issues).
