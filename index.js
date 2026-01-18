/**
 * index.js - Fight.id Full Automation Bot (Robust & Humanized)
 */
require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');
const fs = require('fs');
const UserAgent = require('user-agents');
const { HttpsProxyAgent } = require('https-proxy-agent');
const chalkPromise = import('chalk');

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    API_BASE: 'https://api.fight.id',
    PRIVATE_KEYS: process.env.PRIVATE_KEYS ? process.env.PRIVATE_KEYS.split(',') : [],
    PROXY: process.env.PROXY || null, // Format: http://user:pass@host:port
    MINT_THRESHOLD: 2000,
    SCHEDULED_HOUR: 7,
    SCHEDULED_MINUTE: 30,
    RETRY_LIMIT: 3,
    CONTRACT_ADDRESS: '0xD0B591751E6aa314192810471461bDE963796306', // BSC
    MINT_SELECTOR: '0x6548b7ae'
};

const GAMES = [
    { id: 'punching-bag-daily', name: 'Punching Bag' },
    { id: 'punching-ear-bag-daily', name: 'Ear Bag' }
];

if (CONFIG.PRIVATE_KEYS.length === 0) {
    console.error('❌ Error: PRIVATE_KEYS not found in .env');
    process.exit(1);
}

const TOKEN_FILE = 'tokens.json';

// ============================================
// HUMANIZER UTILS
// ============================================
class Humanizer {
    static delay(minSec, maxSec) {
        const time = Math.floor(Math.random() * (maxSec - minSec + 1) + minSec) * 1000;
        return new Promise(resolve => setTimeout(resolve, time));
    }

    static getRandomUserAgent(isMobile = Math.random() < 0.5) {
        return new UserAgent({ deviceCategory: isMobile ? 'mobile' : 'desktop' }).toString();
    }

    static getHeaders(token = null, ua) {
        const isMobile = ua.includes('Android') || ua.includes('iPhone');
        const platform = isMobile ? (ua.includes('Android') ? '"Android"' : '"iOS"') : '"Windows"';

        const headers = {
            'User-Agent': ua,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            'Sec-Ch-Ua-Mobile': isMobile ? '?1' : '?0',
            'Sec-Ch-Ua-Platform': platform,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'Referer': 'https://app.fight.id/',
            'Origin': 'https://app.fight.id'
        };

        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    }

    static async noiseTraffic(axiosInstance) {
        const pages = ['/home', '/leaderboard?period=season', '/user/profile', '/quests'];
        const numVisits = Math.floor(Math.random() * 2) + 1; // 1-2 random pages

        for (let i = 0; i < numVisits; i++) {
            const page = pages[Math.floor(Math.random() * pages.length)];
            // console.log(`   randomly checking ${page}...`); // Too noisy, keep silent
            try {
                await axiosInstance.get(CONFIG.API_BASE + page).catch(() => { });
                await this.delay(2, 5);
            } catch (e) { }
        }
    }

    static shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

// ============================================
// CORE FUNCTIONS
// ============================================
function getTokens() {
    if (!fs.existsSync(TOKEN_FILE)) return {};
    try {
        const data = JSON.parse(fs.readFileSync(TOKEN_FILE));
        if (data.token) return {}; // Legacy format check
        return data;
    } catch { return {}; }
}

function saveToken(address, tokenData) {
    const tokens = getTokens();
    tokens[address] = tokenData;
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

// ============================================
// ACCOUNT PROCESSOR
// ============================================
async function createAxiosInstance(proxy) {
    const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
    const ua = Humanizer.getRandomUserAgent();
    let ip = 'Unknown';

    try {
        const ipCheck = await axios.get('https://api.ipify.org?format=json', {
            httpsAgent: agent,
            timeout: 10000
        });
        ip = ipCheck.data.ip;
        console.log(`   🌍 IP: ${ip}`);
    } catch (e) { console.log(`   ⚠️ IP Check Failed: ${e.message}`); }

    return {
        client: axios.create({
            httpsAgent: agent,
            proxy: false,
            timeout: 30000
        }),
        ua,
        ip
    };
}

async function processAccount(privateKey, index) {
    let chalk;
    try { chalk = (await chalkPromise).default; } catch { chalk = { green: s => s, red: s => s, yellow: s => s, cyan: s => s, bold: s => s }; }

    let wallet;
    const provider = new ethers.providers.JsonRpcProvider('https://bsc-dataseed.binance.org/');
    try {
        const pk = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
        wallet = new ethers.Wallet(pk.trim(), provider);
    } catch (e) {
        console.log(chalk.red(`❌ Invalid key at line ${index + 1}: ${e.message}`));
        return { status: 'INVALID KEY' };
    }

    console.log(`\n════════════ ACCOUNT ${index + 1} ════════════`);
    console.log(`Wallet: ${wallet.address}`);

    const { client, ua, ip } = await createAxiosInstance(CONFIG.PROXY);
    let token = null;
    let headers = Humanizer.getHeaders(null, ua);

    const statusLog = { IP: ip };

    // --- LOGIN ---
    console.log('🔐 Logging in...');
    await Humanizer.delay(1, 3);

    const savedTokens = getTokens();
    const saved = savedTokens[wallet.address];
    let loggedIn = false;

    if (saved) {
        const age = Date.now() - new Date(saved.date).getTime();
        if (age < 4 * 24 * 60 * 60 * 1000) { // 4 days
            token = saved.token;
            headers = Humanizer.getHeaders(token, ua);
            console.log('   ✅ Using saved token');
            try {
                await client.get(`${CONFIG.API_BASE}/seasons/user/progress`, { headers });
                loggedIn = true;
            } catch (e) { console.log('   ⚠️ Token expired'); }
        }
    }

    if (!loggedIn) {
        try {
            const siwaRes = await client.get(`${CONFIG.API_BASE}/auth/siwa`, { headers });
            const { nonce, nonceId, statement, resources } = siwaRes.data.data;
            const signature = await wallet.signMessage(statement);

            const callbackRes = await client.post(`${CONFIG.API_BASE}/auth/siwa/callback`, {
                input: { nonce, nonceId, resources, statement },
                output: {
                    address: wallet.address, signature, nonce, message: statement, fullMessage: statement,
                    domain: 'app.fight.id', statement, email: '', timestamp: Date.now()
                }
            }, { headers });

            const data = callbackRes.data.data;
            token = data.accessToken;
            headers = Humanizer.getHeaders(token, ua);
            saveToken(wallet.address, { token, userId: data.userId, username: data.username, date: new Date().toISOString() });
            console.log(`   ✅ Logged in as ${data.username}`);
            loggedIn = true;
        } catch (e) {
            console.log(`   ❌ Login failed: ${e.message}`);
            statusLog.login = '❌ FAIL';
            return { account: `Account ${index + 1}`, status: statusLog };
        }
    }
    statusLog.login = '✅ OK';

    // --- RANDOM NOISE ---
    await Humanizer.noiseTraffic(client);

    // --- PREPARE TASKS ---
    const tasks = [];

    // 1. GAMES
    tasks.push(async () => {
        for (const game of Humanizer.shuffle([...GAMES])) {
            console.log(`\n🥊 Playing ${game.name}...`);
            try {
                await Humanizer.delay(2, 4);
                const startRes = await client.get(`${CONFIG.API_BASE}/games/${game.id}/start`, { headers });
                const sessionId = startRes.data.data.sessionId;
                if (sessionId) {
                    // Humanized Tapping
                    const gameDuration = 5000;
                    const tapTimestamps = [];
                    let currentTime = Date.now();
                    const numTaps = 30 + Math.floor(Math.random() * 25);
                    const avgInterval = gameDuration / numTaps;
                    console.log(`   Simulating ${numTaps} taps...`);

                    for (let i = 0; i < numTaps; i++) {
                        const jitter = (Math.random() * 0.8 - 0.4) * avgInterval;
                        const interval = Math.floor(avgInterval + jitter);
                        if (Math.random() < 0.05) currentTime += Math.floor(Math.random() * 50);
                        currentTime += interval;
                        tapTimestamps.push(currentTime);
                    }

                    const durationToWait = Math.max(0, tapTimestamps[tapTimestamps.length - 1] - Date.now()) + 500;
                    await new Promise(r => setTimeout(r, durationToWait));

                    const submitRes = await client.post(`${CONFIG.API_BASE}/games/${game.id}/submit`, {
                        clientScore: 0, gameDurationMs: gameDuration,
                        proofOfWork: { tapTimestamps }, gameSessionId: sessionId
                    }, { headers });
                    statusLog[game.name] = `✅ +${submitRes.data.data.points} FP`;
                } else {
                    statusLog[game.name] = '✅ DONE';
                }
            } catch (e) {
                const msg = e.response?.data?.message || e.message;
                statusLog[game.name] = msg.includes('cooldown') || msg.includes('already') ? '✅ DONE' : '❌ ERROR';
            }
            await Humanizer.delay(3, 7);
        }
    });

    // 2. AIRDROP
    tasks.push(async () => {
        console.log('\n🪂 Checking Airdrop...');
        try {
            const check = await client.get(`${CONFIG.API_BASE}/quests/be-airdrop-ready/completed`, { headers });
            if (check.data.data) statusLog.airdrop = '✅ DONE';
            else {
                await client.post(`${CONFIG.API_BASE}/user/airdrop/claim-verification-reward`, {}, { headers });
                statusLog.airdrop = '✅ CLAIMED';
            }
        } catch { statusLog.airdrop = '❌ FAIL'; }
    });

    // 3. USDT DRAW
    tasks.push(async () => {
        console.log('\n💵 Checking USDT Draw...');
        try {
            const drawRes = await client.post(`${CONFIG.API_BASE}/lottery/free-entry/${wallet.address}`, {}, { headers });
            if (drawRes.data.success && drawRes.data.data.signature) {
                console.log('   ✅ Signature obtained. Submitting...');
                const signature = drawRes.data.data.signature;
                const USDT_CONTRACT = '0x7D12f0c72a32fb517C79Ea33Cf91327Aa92A41E4';
                const USDT_SELECTOR = '0x9f2fe488';
                try {
                    const tx = {
                        to: USDT_CONTRACT,
                        data: USDT_SELECTOR + signature.slice(2),
                        gasLimit: 150000
                    };
                    const signer = wallet.connect(provider);
                    const txResponse = await signer.sendTransaction(tx);
                    statusLog.usdt = `✅ ENTERED (Tx: ${txResponse.hash.slice(0, 10)}...)`;
                    console.log(`   🚀 Tx Sent: ${txResponse.hash}`);
                } catch (txErr) {
                    statusLog.usdt = '❌ TX FAIL';
                }
            } else {
                statusLog.usdt = '❌ NO SIGNATURE';
            }
        } catch (e) {
            const msg = e.response?.data?.message || e.message;
            if (msg.includes('already') || msg.includes('entry limit')) {
                statusLog.usdt = '✅ ALREADY ENTERED';
                console.log('   ✅ User already entered');
            } else {
                statusLog.usdt = `❌ ${msg}`;
            }
        }
    });

    // SHUFFLE AND EXECUTE TASKS
    Humanizer.shuffle(tasks);
    for (const task of tasks) {
        await task();
        await Humanizer.delay(3, 8);
    }

    // --- CHECK BALANCE & MINT ---
    try {
        const [userRes, seasonRes] = await Promise.all([
            client.get(`${CONFIG.API_BASE}/user`, { headers }),
            client.get(`${CONFIG.API_BASE}/seasons/all`, { headers })
        ]);
        const total = userRes.data.data.userSeasonPoints?.[0]?.totalPoints || 0;
        const activeSeason = seasonRes.data.data.find(s => s.isActive);
        const migratable = activeSeason ? activeSeason.migratablePoints : 0;
        const minted = Math.max(0, total - migratable);

        statusLog.balance = `Unclaimed: ${migratable} | Minted: ${minted}`;

        if (activeSeason && migratable >= CONFIG.MINT_THRESHOLD) {
            console.log(`   🚀 Minting ${migratable} FP...`);
            try {
                const mintRes = await client.post(`${CONFIG.API_BASE}/seasons/token/mint`, {
                    blockchainAddress: wallet.address
                }, { headers });
                const d = mintRes.data.data;
                const abiCoder = new ethers.utils.AbiCoder();
                const params = abiCoder.encode(['uint256', 'uint256', 'uint256', 'uint256', 'bytes'],
                    [activeSeason.tokenId, d.amount, d.nonce, d.deadline, d.signature]);
                const txData = CONFIG.MINT_SELECTOR + params.substring(2);

                const signer = wallet.connect(provider);
                const tx = await signer.sendTransaction({ to: CONFIG.CONTRACT_ADDRESS, data: txData });
                console.log(`   ⏳ Mint Tx: ${tx.hash}`);
                await tx.wait();
                await client.post(`${CONFIG.API_BASE}/seasons/mintings/${d.mintingId}/confirm`, { transactionHash: tx.hash }, { headers });
                statusLog.mint = `✅ MINTED ${d.amount}`;
            } catch (e) {
                statusLog.mint = '❌ MINT FAIL';
                console.log(`   ❌ Mint Error: ${e.message}`);
            }
        } else {
            statusLog.mint = `⏳ ${migratable}/${CONFIG.MINT_THRESHOLD}`;
        }
    } catch { statusLog.balance = '❌ ERR'; }

    return { account: `Account ${index + 1} (${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)})`, status: statusLog };
}

// ============================================
// ROBUST SCHEDULER
// ============================================
function getNextScheduledTime(hour, minute) {
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, minute, 0, 0);
    if (now >= next) next.setDate(next.getDate() + 1);
    return next;
}

function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
}

async function displayCountdown(ms, targetTime) {
    let chalk;
    try { chalk = (await chalkPromise).default; } catch { chalk = { cyan: s => s, yellow: s => s, green: s => s, bold: s => s }; }

    console.log(chalk.bold.cyan(`\n⏰ Next cycle: ${targetTime.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`));

    return new Promise(resolve => {
        if (ms <= 0) { resolve(); return; }

        let timeoutId, intervalId;
        const finish = () => {
            clearTimeout(timeoutId);
            clearInterval(intervalId);
            process.stdout.clearLine?.();
            process.stdout.cursorTo?.(0);
            console.log(chalk.green('🚀 Starting new cycle...\n'));
            resolve();
        };

        timeoutId = setTimeout(finish, ms);
        intervalId = setInterval(() => {
            const remaining = targetTime.getTime() - Date.now();
            if (remaining <= 0) finish();
            else {
                try {
                    process.stdout.clearLine?.();
                    process.stdout.cursorTo?.(0);
                    process.stdout.write(chalk.yellow(`⏳ Countdown: ${formatTime(remaining)}...`));
                } catch { }
            }
        }, 1000);
    });
}

// ============================================
// MAIN LOOP
// ============================================
(async () => {
    let chalk;
    try { chalk = (await chalkPromise).default; } catch { chalk = { green: s => s, red: s => s, yellow: s => s, cyan: s => s, bold: s => s }; }
    console.log(chalk.bold.cyan('\n🤖 FIGHT BOT ROBUST V2'));

    while (true) {
        try {
            const results = [];
            for (let i = 0; i < CONFIG.PRIVATE_KEYS.length; i++) {
                const res = await processAccount(CONFIG.PRIVATE_KEYS[i].trim(), i);
                results.push(res);
                await Humanizer.delay(5, 10);
            }

            console.log('\n════════════════════════════════════════════════════════════');
            console.log(chalk.bold.yellow('📋 SESSION REPORT'));
            console.table(results.map(r => ({ Account: r.account, ...r.status })));
            console.log('════════════════════════════════════════════════════════════\n');

            const nextRun = getNextScheduledTime(CONFIG.SCHEDULED_HOUR, CONFIG.SCHEDULED_MINUTE);
            await displayCountdown(nextRun.getTime() - Date.now(), nextRun);

        } catch (e) {
            console.error(chalk.red(`\n❌ Cycle Error: ${e.message}`));
            await Humanizer.delay(10, 20); // Retry delay
        }
    }
})();
