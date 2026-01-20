/**
 * index.js - Fight.id Full Automation Bot (Sipal Flat Structure)
 */
const axios = require('axios');
const { ethers } = require('ethers');
const fs = require('fs');
const UserAgent = require('user-agents');
const { HttpsProxyAgent } = require('https-proxy-agent');
const chalkPromise = import('chalk');

// ============================================
// LOAD CONFIGURATION
// ============================================
const CONFIG = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const ACCOUNTS = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
const TOKEN_FILE = 'tokens.json';

if (!ACCOUNTS || ACCOUNTS.length === 0) {
    console.error('❌ Error: No accounts found in accounts.json');
    process.exit(1);
}

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

async function retry(fn, context, retries = CONFIG.RETRY_LIMIT) {
    for (let i = 1; i <= retries; i++) {
        try {
            return await fn();
        } catch (e) {
            const msg = e.response?.data?.message || e.message || 'Unknown Error';
            console.log(`      ⚠️ [${context}] Attempt ${i}/${retries} failed: ${msg}`);
            if (i === retries) throw e;
            await Humanizer.delay(2, 5);
        }
    }
}

function saveToken(address, tokenData) {
    const tokens = getTokens();
    tokens[address] = tokenData;
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

// Get a working BSC provider (tries multiple RPCs)
async function getWorkingProvider() {
    for (const rpc of CONFIG.BSC_RPCS) {
        try {
            const provider = new ethers.providers.JsonRpcProvider(rpc);
            await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 5000))
            ]);
            return provider;
        } catch { continue; }
    }
    // Fallback to first RPC if all fail
    return new ethers.providers.JsonRpcProvider(CONFIG.BSC_RPCS[0]);
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

async function processAccount(account, index) {
    let chalk;
    try { chalk = (await chalkPromise).default; } catch { chalk = { green: s => s, red: s => s, yellow: s => s, cyan: s => s, bold: s => s }; }

    let wallet;
    let provider;
    try {
        provider = await getWorkingProvider();
        const pk = account.privateKey.startsWith('0x') ? account.privateKey : `0x${account.privateKey}`;
        wallet = new ethers.Wallet(pk.trim(), provider);
    } catch (e) {
        console.log(chalk.red(`❌ Invalid key at account ${index + 1}: ${e.message}`));
        return { status: 'INVALID KEY' };
    }

    console.log(`\n════════════ ACCOUNT ${index + 1} ════════════`);
    console.log(`Wallet: ${wallet.address}`);
    if (account.proxy) console.log(`Proxy: ${account.proxy}`);

    const { client, ua, ip } = await createAxiosInstance(account.proxy);
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
                await retry(() => client.get(`${CONFIG.API_BASE}/seasons/user/progress`, { headers }), 'Login Check');
                loggedIn = true;
            } catch (e) { console.log('   ⚠️ Token expired or check failed'); }
        }
    }

    if (!loggedIn) {
        try {
            await retry(async () => {
                console.log('   ⏳ Processing: authenticating with SIWA...');
                const siwaRes = await client.get(`${CONFIG.API_BASE}/auth/siwa`, { headers });
                const { nonce, nonceId, statement, resources } = siwaRes.data.data;
                const signature = await wallet.signMessage(statement);
                console.log('   ✅ SIWA auth complete');

                console.log('   ⏳ Processing: verifying login...');
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
                console.log(`   ✅ Login verified: ${data.username}`);
            }, 'Login Process');
            loggedIn = true;
        } catch (e) {
            console.log(`   ❌ Login failed after ${CONFIG.RETRY_LIMIT} attempts: ${e.message}`);
            statusLog.login = '❌ FAIL';
            return { account: `Account ${index + 1}`, status: statusLog };
        }
    }
    statusLog.login = '✅ OK';

    // --- RANDOM NOISE ---
    await Humanizer.noiseTraffic(client);

    // --- CHECK BALANCE & MINT ---
    try {
        console.log('\n💰 Checking Balance & Mint...');
        console.log('   ⏳ Processing: fetching balance...');
        const [userRes, seasonRes] = await Promise.all([
            client.get(`${CONFIG.API_BASE}/user`, { headers }),
            client.get(`${CONFIG.API_BASE}/seasons/all`, { headers })
        ]);
        const total = userRes.data.data.userSeasonPoints?.[0]?.totalPoints || 0;
        const activeSeason = seasonRes.data.data.find(s => s.isActive);
        const migratable = activeSeason ? activeSeason.migratablePoints : 0;
        const minted = Math.max(0, total - migratable);
        console.log(`   ✅ Balance fetched: Unclaimed ${migratable}, Minted ${minted}`);

        statusLog.balance = `Unclaimed: ${migratable} | Minted: ${minted}`;

        if (activeSeason && migratable >= CONFIG.MINT_THRESHOLD) {
            console.log(`   🚀 Minting ${migratable} FP...`);
            try {
                console.log('   ⏳ Processing: requesting mint signature...');
                const mintRes = await client.post(`${CONFIG.API_BASE}/seasons/token/mint`, {
                    blockchainAddress: wallet.address
                }, { headers });
                const d = mintRes.data.data;
                console.log(`   ✅ Mint signature obtained`);

                const abiCoder = new ethers.utils.AbiCoder();
                const params = abiCoder.encode(['uint256', 'uint256', 'uint256', 'uint256', 'bytes'],
                    [activeSeason.tokenId, d.amount, d.nonce, d.deadline, d.signature]);
                const txData = CONFIG.MINT_SELECTOR + params.substring(2);

                const freshProvider = await getWorkingProvider();
                const signer = wallet.connect(freshProvider);
                console.log('   ⏳ Processing: sending mint transaction...');
                const tx = await signer.sendTransaction({ to: CONFIG.CONTRACT_ADDRESS, data: txData });
                console.log(`   ✅ Mint tx sent: ${tx.hash}`);

                console.log('   ⏳ Processing: waiting for confirmation...');
                await tx.wait();
                console.log('   ✅ Tx confirmed on-chain');

                await client.post(`${CONFIG.API_BASE}/seasons/mintings/${d.mintingId}/confirm`, { transactionHash: tx.hash }, { headers });
                console.log(`   ✅ Mint complete: ${d.amount} FP`);
                statusLog.mint = `✅ MINTED ${d.amount}`;

            } catch (e) {
                statusLog.mint = '❌ MINT FAIL';
                console.log(`   ❌ Mint Error: ${e.message}`);
            }
        } else {
            statusLog.mint = `⏳ ${migratable}/${CONFIG.MINT_THRESHOLD}`;
            console.log(`   ℹ️ Points below threshold (${migratable}/${CONFIG.MINT_THRESHOLD}), skipping mint`);
        }
    } catch (e) {
        statusLog.balance = '❌ ERR';
        console.log(`   ❌ Balance check error: ${e.message}`);
    }

    // --- PREPARE TASKS ---
    const tasks = [];

    // 1. GAMES
    tasks.push(async () => {
        for (const game of Humanizer.shuffle([...CONFIG.GAMES])) {
            console.log(`\n🥊 Playing ${game.name}...`);
            try {
                await retry(async () => {
                    await Humanizer.delay(2, 4);
                    console.log(`   ⏳ Processing: starting game session...`);
                    const startRes = await client.get(`${CONFIG.API_BASE}/games/${game.id}/start`, { headers });
                    const sessionId = startRes.data.data.sessionId;
                    if (sessionId) {
                        console.log(`   ✅ Session started: ${sessionId}`);
                        // Humanized Tapping
                        const gameDuration = 5000;
                        const tapTimestamps = [];
                        let currentTime = Date.now();
                        const numTaps = 30 + Math.floor(Math.random() * 25);
                        const avgInterval = gameDuration / numTaps;
                        console.log(`   ⏳ Processing: simulating ${numTaps} taps...`);

                        for (let i = 0; i < numTaps; i++) {
                            const jitter = (Math.random() * 0.8 - 0.4) * avgInterval;
                            const interval = Math.floor(avgInterval + jitter);
                            if (Math.random() < 0.05) currentTime += Math.floor(Math.random() * 50);
                            currentTime += interval;
                            tapTimestamps.push(currentTime);
                        }

                        const durationToWait = Math.max(0, tapTimestamps[tapTimestamps.length - 1] - Date.now()) + 500;
                        await new Promise(r => setTimeout(r, durationToWait));

                        console.log(`   ⏳ Processing: submitting score...`);
                        const submitRes = await client.post(`${CONFIG.API_BASE}/games/${game.id}/submit`, {
                            clientScore: 0, gameDurationMs: gameDuration,
                            proofOfWork: { tapTimestamps }, gameSessionId: sessionId
                        }, { headers });
                        const points = submitRes.data.data.points;
                        console.log(`   ✅ Score submitted: +${points} FP`);
                        statusLog[game.name] = `✅ +${points} FP`;
                    } else {
                        statusLog[game.name] = '✅ DONE';
                    }
                }, `Playing ${game.name}`);
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
            await retry(async () => {
                console.log('   ⏳ Processing: verifying airdrop eligibility...');
                const check = await client.get(`${CONFIG.API_BASE}/quests/be-airdrop-ready/completed`, { headers });
                if (check.data.data) {
                    console.log('   ✅ Airdrop already verified');
                    statusLog.airdrop = '✅ DONE';
                } else {
                    console.log('   ⏳ Processing: claiming airdrop reward...');
                    await client.post(`${CONFIG.API_BASE}/user/airdrop/claim-verification-reward`, {}, { headers });
                    console.log('   ✅ Airdrop claimed');
                    statusLog.airdrop = '✅ CLAIMED';
                }
            }, 'Airdrop Check');
        } catch {
            console.log('   ❌ Airdrop failed');
            statusLog.airdrop = '❌ FAIL';
        }
    });

    // SHUFFLE AND EXECUTE TASKS
    Humanizer.shuffle(tasks);
    for (const task of tasks) {
        await task();
        await Humanizer.delay(3, 8);
    }

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
    try { chalk = (await chalkPromise).default; } catch { chalk = { green: s => s, red: s => s, yellow: s => s, cyan: s => s, blue: s => s, bold: s => s }; }

    // SIPAL AIRDROP STANDARD BANNER
    console.log(chalk.blue(`
               / \\
              /   \\
             |  |  |
             |  |  |
              \\  \\
             |  |  |
             |  |  |
              \\   /
               \\ /
    `));
    console.log(chalk.bold.cyan('    ======SIPAL AIRDROP======'));
    console.log(chalk.bold.cyan('  =====SIPAL FightBot-Sipal V1.0====='));
    console.log(chalk.green(`   ✅ Loaded ${ACCOUNTS.length} accounts from accounts.json`));
    console.log(chalk.green(`   ✅ Config loaded from config.json`));

    while (true) {
        try {
            const results = [];
            for (let i = 0; i < ACCOUNTS.length; i++) {
                try {
                    const res = await processAccount(ACCOUNTS[i], i);
                    results.push(res);
                } catch (accountErr) {
                    console.log(chalk.red(`\n❌ Account ${i + 1} crashed: ${accountErr.message}`));
                    results.push({ account: `Account ${i + 1}`, status: { error: '❌ CRASHED' } });
                }
                await Humanizer.delay(5, 10);
            }

            console.log('\n════════════════════════════════════════════════════════════');
            console.log('\n════════════════════════════════════════════════════════════');
            console.log(chalk.bold.cyan(`                          🤖 SIPAL FightBot-Sipal V1.0 🤖`));
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
