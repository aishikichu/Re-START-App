# Re:START Bot Wiki

Welcome to the **Re:START Bot Wiki**! This documentation covers all the features, commands, and systems integrated into the bot, ranging from the profile widget to the economy and massive gacha system.

---

## 📑 Table of Contents
1. [General & Profile Widget](#1-general--profile-widget)
2. [Fun & Games](#2-fun--games)
3. [Economy & Leveling](#3-economy--leveling)
4. [Re:BOOTH Gacha System](#4-rebooth-gacha-system)
5. [Passive Features](#5-passive-features)
6. [Admin & Developer Commands](#6-admin--developer-commands)

---

## 1. General & Profile Widget
Re:START features a unique **Profile Widget** that syncs custom stats directly to your Discord profile via OAuth2, as well as a customizable in-server profile card!

* **`/help`** — Shows the in-game command guide.
* **`/setstat <slot 1-6> <title> <value>`** — Updates a specific slot on your profile widget. (e.g., `/setstat 1 Vibe Chill`). *(Note: The first time you use this, you must authorize the app).*
* **`/profile [user]`** — View your (or another user's) in-server Re:START Profile card! It displays your Level, XP, Net Worth, purchased Badges, and your Avatar Showcase.
* **`/setshowcase <avatars>`** — Pick up to 10 avatars from your inventory to display on your `/profile` showcase! (e.g., `/setshowcase maya_ur, kikyo_sr`).

---

## 2. Fun & Games
Take a break and interact with the bot using these fun, randomized commands:

* **`/8ball <question>`** — Ask the magic 8-ball a yes/no question.
* **`/coinflip`** — Flips a coin (Heads or Tails).
* **`/roll [sides]`** — Rolls a dice. Defaults to a 6-sided die, but you can specify up to 100 sides!
* **`/vibe`** — Get your random vibe check for the day.
* **`/rps <choice>`** — Play Rock, Paper, Scissors against the bot.

---

## 3. Economy & Leveling
Chat to earn XP, level up, and collect coins to spend in the Re:BOOTH shop!

* **`/rank`** — Check your current Level, XP, and Coin balance.
* **`/daily`** — Claim your free daily coins (available once every 24 hours).
* **`/slots <bet>`** — Bet your coins on the slot machine! Win 2x your bet for matching two emojis, or 5x for a Jackpot!
* **`/give <user> <amount>`** — Transfer your coins to another user.

### The Dynamic Shop
* **`/shop`** — View the server shop! The shop has **Dynamic Pricing**, meaning the cost of items like Gacha Tokens will fluctuate every 3 hours based on a simulated market economy. It also sells Daily Cosmetics (Colors & Badges) that reset every 24 hours.
  * **🌟 VIP Pass:** Keep an eye out! There is a rare (~2.5%) chance for the VIP Pass to appear in the shop. Buying it grants you **Double Gacha Luck**, **2x Daily Coins**, and a **15% Slots Override Chance** for 1 hour!
* **`/buy <item> [amount]`** — Purchase an item from the shop (e.g., `/buy token 10`, `/buy vip`, or `/buy badge`).

---

## 4. Re:BOOTH Gacha System
The bot features a massive, fully integrated Gacha system where you can collect over 2,000 VRChat Booth Avatars!

* **`/gacha`** — Spend 1 Gacha Token to roll for a random Re:BOOTH Avatar. 
  * The pool is dynamically built and curated by the community! Avatars are fetched daily from Booth.pm and approved by Game Staff.
  * Popular avatars come in multiple rarity variants: **[UR]**, **[SR]**, and **[R]**.
  * **Duplicate Rolls:** If you claim an avatar you already own, you get **+1 Affinity Point** instead!
  * **Sniping:** If someone else clicks "Claim" on your roll before you do, they steal the drop! But they only get the Coin Value of the avatar, and the avatar itself is lost!
* **`/inventory [user]`** — View your (or another user's) collection of Booth Avatars, total Gacha Tokens, and combined net worth.
* **`/lookup <avatar_id>`** — Look up an avatar to see its image, rarity, value, and a list of all users in the server who own it! (e.g., `/lookup maya` will show all Maya variants).
* **`/sell <avatar_id>`** — Sell an avatar you own back to the shop for its coin value.
* **`/wish <avatar_id>`** — Add an avatar to your wishlist (Max 5). You'll be pinged if someone rolls it!
* **`/trade <user> <give_id> <receive_id>`** — Propose a trade with another user. They will receive an interactive embed with buttons to Accept or Decline the trade.

---

## 5. Passive Features
These features run automatically in the background:

* **Chat XP Leveling:** You gain between 15-25 XP every time you chat! There is a 60-second cooldown between messages. Earning enough XP automatically increases your Level!
* **Random Economy Drops:** When members chat, there is a chance for a random "Coin Drop" or rare "Star Drop" (Gacha Token) to fall from the sky. The first person to click to claim it gets the prize!
* **Starboard (Hall of Fame):** If any message in the server receives **3 or more ⭐ reactions**, the bot will automatically immortalize it in the dedicated Starboard channel.

---

## 6. Admin & Developer Commands
These commands are reserved for server administrators or the Bot Developer.

* **`/setupverify`** — Posts the server verification panel. Users click the "Verify Me!" button to receive the `Verified Homies` role.
* **`/setuproles`** — Posts the self-assignable Role Panel.
* **`/addrole <name> <color> <emoji>`** — Adds a new custom role to the Role Panel dynamically.

### Game Staff Commands
* **`/fetchavatars`** — Scrapes the top 50 newest popular VRChat avatars from Booth.pm and sends them to the `#avatar-reviews` channel. Staff can click `[Approve]` to customize the name/rarity and inject it into the live Gacha pool!

### Developer Only Commands
*(Only accessible by the Developer ID)*
* **`/addcoins <user> <amount>`** — Instantly adds coins to a user's balance.
* **`/purge`** — Completely wipes the MongoDB database (Resetting all XP, Coins, and Inventories for everyone). Use with extreme caution!
