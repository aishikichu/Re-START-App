<div align="center">

![Re:START Banner](../banner.png)

# 🌸 Re:START Bot Wiki 🌸

*Welcome to the official **Re:START Bot Wiki**! ✨*  
*This documentation covers the core game loops, underlying mechanics, and all the features integrated into the bot. Grab a snack and let's dive in! 🍰*

</div>

---

## 🎀 Table of Contents
1. [Core Game Loop & Progression 🔁](#1-core-game-loop--progression-)
2. [The Re:BOOTH Gacha System 🎰](#2-the-rebooth-gacha-system-)
3. [Work Empire & RPG Stats 🍔](#3-work-empire--rpg-stats-)
4. [The Economy & Shop 🪙](#4-the-economy--shop-)
5. [Interactive Profiles & Widget 🪪](#5-interactive-profiles--widget-)
6. [Passive Events & Drops ✨](#6-passive-events--drops-)
7. [Complete Command Directory 📚](#7-complete-command-directory-)

---

## 1. Core Game Loop & Progression 🔁
Re:START turns chatting in the server into a full-fledged RPG and Collection game! Here is how the basic game loop works:

1. **Chat & Earn:** Sending messages in the server earns you **Chat XP** and **Coins** passively. 
2. **Spin the Gacha:** Use those Coins to buy **Gacha Tokens** from the Dynamic Shop and spin the `/gacha` to collect rare VRChat Avatars.
3. **Build an Empire:** Put your collected avatars to `/work` flipping burgers to generate passive income.
4. **Upgrade & Expand:** Use your profits to `/upgrade` your avatars' RPG stats, buy more work slots, or test your luck in the casino.
5. **Trade & Show Off:** Trade avatars with other players, snipe deals on the `/market`, and display your rarest finds on your `/profile` showcase!

---

## 2. The Re:BOOTH Gacha System 🎰
The Re:BOOTH system is a custom Trading Card Game featuring over 2,000 real VRChat Booth Avatars, fetched directly from Booth.pm!

### 🎲 Pulling & Rarities
Use `/gacha` to spend 1 Token and roll an avatar. Avatars come in four rarities, each with a different base Coin Value and Power level:
* **[C] Common:** Very frequent. Base Power: ~50.
* **[R] Rare:** Uncommon. Base Power: ~75.
* **[SR] Super Rare:** Hard to find. Base Power: ~100.
* **[UR] Ultra Rare:** The ultimate prize! Highest power and value.

**The Pity System:** The bot tracks your unlucky rolls. If you go 150 rolls without hitting a [UR], your 151st roll is **guaranteed** to be a [UR]! Use `/pity` to check your progress.

### 💕 Duplicates & Affinity
If you roll an avatar you *already own*, you don't get a duplicate card. Instead, you gain **+1 Affinity Point** (which equals 10% Affinity) with that avatar! Affinity is a crucial resource used for upgrading your avatar's RPG Stats.

### 🔫 Sniping Mechanics
When you roll the gacha, the card appears in chat. If someone else clicks the `Claim` button before you do, they **Snipe** it!
* **If they snipe it:** The avatar itself is destroyed, but the sniper steals the avatar's Coin Value!
* **Limits:** You can only snipe for coins **5 times per hour**, and you can only fully steal a dropped avatar **1 time per hour** to prevent abuse.

---

## 3. Work Empire & RPG Stats 🍔
Your avatars aren't just for show—they need to earn their keep! 

### 💼 The Work Cycle
* **`/work`:** Send an avatar to work a 4-hour shift at McDonald's. The amount of coins they earn is based on their base Power and their Luck stat.
* **`/claimwork`:** Once the 4 hours are up, claim their wages! **Synergy Bonus:** If you have multiple avatars of the same rarity working at the same time, you gain a +15% coin multiplier per matching rarity when you claim!
* **🛌 Resting Phase:** Flipping burgers is exhausting. After claiming wages, that avatar enters a **Resting Phase** for 2 Hours. They cannot be sent to work again until they wake up.
* **Work Slots:** You start with only 1 Work Slot. You can buy more slots in the `/shop` to have multiple avatars working simultaneously. Each new slot costs progressively more!

### 💥 Risky Business & Jail
Feeling lucky? Use `/riskywork` to send an avatar on a highly illegal heist (4-hour global cooldown).
* **Success:** Massive payout multiplier!
* **Failure (Jail):** The avatar is busted! They are sent to **Jail** for a specific duration. While in jail, they cannot work, be sold, or be traded!

### ✨ Upgrading RPG Stats & Ascension
You can use `/upgrade <avatar_id> <stat>` to level up specific stats for your avatars (Max Level 10). Upgrading costs both **Coins** and **Affinity Points**.
1. **🏃‍♂️ Speed:** Reduces the 4-hour `/work` duration (Saves 10 minutes per level).
2. **🛡️ Endurance:** Reduces the 2-hour Resting Phase (Saves 10 minutes per level).
3. **🍀 Luck:** Increases your payout multiplier for normal work, and increases your success chance for `/riskywork`!

**Ascension:** If you have 3 or more duplicates of an avatar, you can use `/ascend <avatar_id>` to consume 3 duplicates and ascend the avatar. Each Ascension level permanently increases the avatar's Combat Power (CP) by 20%, which is crucial for PvP!

---

## 4. The Economy & Shop 🪙
The economy is driven by the community and a simulated market.

### 🛒 Dynamic Pricing
The `/shop` doesn't have fixed prices for everything! The price of Gacha Tokens and Work Slots fluctuates based on the simulated market. 
* Prices update automatically every 3 hours. Buy low, hold, or spend wisely!
* **🌟 VIP Pass:** Keep an eye out! There is a rare (~2.5%) chance for the VIP Pass to appear in the shop. Buying it grants you **Double Gacha Luck**, **2x Daily Coins**, and a **15% Casino Override Chance** for 1 hour!

### 🎲 The Casino
The bot features several casino minigames (`/slots`, `/blackjack`, `/roulette`, `/coinflip`). To prevent inflation and hyper-wealth loops, there are **Max Jackpot Limits** hardcoded into the games (usually capping out around 7,000 Coins max win).

### 🏪 The Global Market & Shop Items
Players set the economy! Use `/market list <avatar_id> <price>` to sell your avatars to other players. Use `/market view` to browse active listings and snipe good deals.
You can also buy consumables like **Money Bags** and **Energy Drinks** from the shop, and consume them using `/use <item>`.

---

## 5. Interactive Profiles & Widget 🪪
Re:START integrates heavily with the web! 

* **`/widget`:** Generates a secure OAuth2 link to your personalized Web Profile.
* **`/setstat`:** Customize the 6 text slots on your web widget to say whatever you want!
* **`/profile`:** Displays your in-server profile card featuring your Level, Net Worth, and Avatar Showcase.
* **`/setshowcase`:** Pick up to 10 of your favorite avatars from your inventory to display on your profile!

---

---

## 6. Passive Events & Drops ✨
The bot runs background events to keep chat engaging:

* **Chat XP:** Gain 15-25 XP per message (60-second cooldown).
* **Random Drops:** Randomly, an interactive drop will appear in chat!
  * **Coin Drops / Traps:** Grab free coins, or avoid the trap that steals them!
  * **Avatar Drops:** A free avatar card falls from the sky! First to claim gets it.
  * **Star Drops:** Crack open a star for a chance at a rare Gacha Token or a pile of coins!
* **⭐ Starboard:** React to any funny or amazing message with a ⭐! If it gets 3 stars, it is permanently saved in the `#starboard` channel.
* **🤬 Profanity Filter:** The bot secretly tallies every swear word. Swear too much, and the developer can expose you on the Hall of Shame!

---

## 7. Quests & PvP Duels ⚔️
Re:START features daily quests and active player-vs-player combat!

* **Daily Quests:** Check `/quests` to see your 3 active daily quests. Complete them for Coins and Token rewards!
* **PvP Duels:** Use `/duel <opponent> <bet> <avatar_id>` in the PvP channel. If accepted, the bot calculates the Combat Power (CP) of both avatars (Base + Ascension + Luck) and does a weighted roll. The winner takes the pot, and the loser's avatar is sent to the Hospital for 2 hours!

---

## 8. Complete Command Directory 📚

### 🪙 Economy & Casino
* **`/balance`** (or `/rank`) — View your Coins, Level, and XP.
* **`/daily`** — Claim your daily coins. Keep a streak for Gacha Tokens!
* **`/shop`** — View the dynamic shop.
* **`/buy <item> [amount]`** — Purchase items from the shop.
* **`/give <user> <amount>`** — Transfer coins to another user.
* **`/beg`** — Beg the server for spare change.
* **`/use <item>`** — Use a consumable item from your inventory.
* **`/quests`** — View and claim daily quests.
* **`/leaderboard <category>`** — View the top players (Coins, Level, Avatars).
* **`/slots <bet>`** — Spin the slot machine!
* **`/blackjack <bet>`** — Play blackjack against the dealer.
* **`/roulette <bet> <color>`** — Bet on Red, Black, or Green.
* **`/coinflip <bet> <guess>`** — Flip a coin to double your bet.

### 🎰 Gacha & Avatars
* **`/gacha`** — Roll for a random Booth Avatar.
* **`/inventory [user]`** — View your collected avatars and their statuses (Working/Resting/Jailed).
* **`/lookup <avatar_id>`** — View an avatar's details, owners, and your personal RPG stats for it.
* **`/pity`** — Check your progress towards a guaranteed UR avatar.
* **`/wish <avatar_id>`** — Add an avatar to your wishlist.
* **`/wishlist`** — View the global or personal wishlist.
* **`/ascend <avatar_id>`** — Consume 3 duplicates to ascend an avatar and boost their CP.
* **`/sell <avatar_id>`** — Sell an avatar back to the system for its base coin value.
* **`/trade <user> <give> <receive>`** — Propose a 1-for-1 trade with another user.
* **`/market view`** — Browse player-listed avatars for sale.
* **`/market list <id> <price>`** — List your avatar on the global market.
* **`/market buy <listing_id>`** — Buy an avatar from the market.
* **`/market cancel <listing_id>`** — Remove your market listing.

### 🍔 Work Empire
* **`/work <avatar_id>`** — Send an avatar to flip burgers for 4 hours.
* **`/claimwork`** — Claim wages from finished shifts (triggers Resting phase).
* **`/riskywork <avatar_id>`** — Attempt an illegal heist for huge payouts.
* **`/upgrade <avatar_id> <stat>`** — Level up an avatar's Speed, Endurance, or Luck.

### 🪪 Profile & Fun
* **`/profile [user]`** — View a user's server profile and showcase.
* **`/setshowcase <avatars>`** — Set the avatars displayed on your profile.
* **`/widget`** — Get the link to your interactive web widget.
* **`/setstat <slot> <title> <value>`** — Customize your web widget text slots.
* **`/8ball <question>`** — Ask the magic 8-ball.
* **`/roll [sides]`** — Roll a dice.
* **`/vibe`** — Get a random vibe check.
* **`/rps <choice>`** — Play Rock, Paper, Scissors against the bot.
* **`/duel <user> <bet> <avatar_id>`** — Challenge another user to a PvP Avatar Duel.
* **`/help`** — View the in-game command guide.

### 🛠️ Admin / Developer
* **`/setupverify`** — Post the verification button.
* **`/setuproles`** — Post the self-assignable roles panel.
* **`/addrole <name> <color> <emoji>`** — Add a new assignable role dynamically.
* **`/updateinfo`** — Pulls this wiki/info data to update the Discord #info channel.
* **`/fetchavatars`** — Scrape newest avatars from Booth.pm for staff review.
* **`/hallofshame`** — Expose the top swearers.
* **`/addcoins`, `/addgachatoken`, `/purge`** — Developer overrides.
