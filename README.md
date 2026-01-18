# 🥊 Fight.id Automation Bot (Robust & Humanized - V2)

Advanced multi-account automation tool for the Fight.id Airdrop campaign. Designed with **stealth**, **stability**, and **efficiency** in mind.

## ✨ Key Features

### 🤖 Advanced Humanization (Anti-Sybil)
- **User-Agent Rotation**: Randomizes between real Desktop and Mobile User-Agents for every session.
- **Full Browser Headers**: Simulates legitimate browser headers (`Sec-Ch-Ua`, `Sec-Fetch-Mode`, etc.).
- **Smart Delays**: Randomized "human" pauses (2-8s) between actions.
- **Noise Traffic**: Randomly visits Home, Leaderboard, or Profile pages to mimic real user behavior.
- **Non-Linear Workflow**: Task order is shuffled every run (e.g., Airdrop -> Games -> Draw).

### ⏰ Robust Scheduler
- **Daily Auto-Loop**: Automatically runs every day at **07:30 WIB** (Generic Timezone support).
- **Resilience**: Handles API errors gracefully with exponential backoff; never crashes.
- **Real-Time Countdown**: Displays a live countdown to the next scheduled run.
- **Session Reports**: Provides a neat table summary of all accounts after each cycle.

### 💰 Automated Tasks
- **Games**: plays `Punching Bag` & `Ear Bag` with randomized "humanized" tap intervals.
- **USDT Draw**: Automatically joins the daily lottery with **On-Chain Transactions** (BSC).
- **Auto-Mint Season FP**: Automatically triggers minting when Migratable Points >= 2000 (Gas Saver).
- **Airdrop Ready**: Claims the daily verification reward.

### 🛡️ Security
- **Secure Credentials**: Private keys managed via `.env` (never hardcoded).
- **Proxy Support**: Native residential proxy support (`http/https`).
- **IP Logging**: Logs the public IP used for every session to verify proxy usage.

---

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/fightbot-sipal.git
   cd fightbot-sipal
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file in the root directory:
   ```env
   # Comma-separated EVM Private Keys
   PRIVATE_KEYS=your_private_key_1,your_private_key_2,your_private_key_3

   # Optional: Proxy (User:Pass@Host:Port)
   PROXY=http://user:pass@host:port
   ```

---

## 🛠️ Usage

Simply run the start command. The bot will handle everything automatically.

```bash
npm start
```

### What happens next?
1. The bot detects your accounts from `.env`.
2. It logs in (using existing token or new SIWA handshake).
3. It performs "Noise Traffic" (browsing random pages).
4. It completes all tasks (Games, Draw, Mint) in a random order.
5. It displays a **Session Report**.
6. It enters a countdown loop until the next scheduled run (default: 07:30 AM).

---

## 📂 Project Structure

```
├── index.js            # Main Logic (Scheduler + Bot + Humanizer)
├── .env                # Private Keys & Config (Ignored by Git)
├── .gitignore          # Security rules
├── package.json        # Dependencies
├── tokens.json         # Session Cache (Auto-managed)
└── bak/                # Archived/Unused scripts
```

## ⚠️ Disclaimer

This tool is for **educational purposes only**. Use it at your own risk. The authors are not responsible for any bans or penalties imposed by Fight.id.
