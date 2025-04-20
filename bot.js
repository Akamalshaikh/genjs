const TelegramBot = require('node-telegram-bot-api');
const fetch = require('node-fetch');
const fs = require('fs');

// === CONFIG ===
const BOT_TOKEN = '7604701474:AAF3H2URJWucUSLQhHCx55IaISDxafKs-FM';
const CHANNEL_ID = -1002373935837; // Your channel ID (as a number)
const CHANNEL_LINK = 'https://t.me/+kQyAexYL4J84MTll';
const ADMIN_IDS = [6994528708]; // <-- Put your Telegram user ID(s) here

const COUNTRY_FLAGS = {
    "FRANCE": "🇫🇷", "UNITED STATES": "🇺🇸", "BRAZIL": "🇧🇷", "NAMIBIA": "🇳🇦",
    "INDIA": "🇮🇳", "GERMANY": "🇩🇪", "THAILAND": "🇹🇭", "MEXICO": "🇲🇽", "RUSSIA": "🇷🇺",
};

const USERS_FILE = './users.json';
let users = [];
if (fs.existsSync(USERS_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(USERS_FILE));
    } catch (e) {
        users = [];
    }
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// === Helper: Save user if new ===
function saveUser(id) {
    if (!users.includes(id)) {
        users.push(id);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users));
    }
}

// === Helper: Extract BIN ===
function extractBin(input) {
    const match = input.match(/(\d{6,16})/);
    if (!match) return null;
    let bin = match[1];
    return bin.length === 6 ? bin.padEnd(16, 'x') : bin;
}

// === Helper: Force Join Check ===
async function isUserInChannel(userId) {
    try {
        const res = await bot.getChatMember(CHANNEL_ID, userId);
        return ['member', 'creator', 'administrator'].includes(res.status);
    } catch (e) {
        return false;
    }
}

// === Helper: Generate CCs ===
async function generateCC(bin) {
    const url = `https://drlabapis.onrender.com/api/ccgenerator?bin=${bin}&count=10`;
    try {
        const res = await fetch(url, { timeout: 10000 });
        if (!res.ok) return { error: `API error: ${res.status}` };
        const text = await res.text();
        return text.trim().split('\n');
    } catch (e) {
        return { error: e.message };
    }
}

// === Helper: Lookup BIN ===
async function lookupBin(bin) {
    const url = `https://drlabapis.onrender.com/api/bin?bin=${bin.slice(0,6)}`;
    try {
        const res = await fetch(url, { timeout: 10000 });
        if (!res.ok) return { error: `API error: ${res.status}` };
        const data = await res.json();
        const country = (data.country || 'NOT FOUND').toUpperCase();
        return {
            bank: (data.issuer || 'NOT FOUND').toUpperCase(),
            card_type: (data.type || 'NOT FOUND').toUpperCase(),
            network: (data.scheme || 'NOT FOUND').toUpperCase(),
            tier: (data.tier || 'NOT FOUND').toUpperCase(),
            country,
            flag: COUNTRY_FLAGS[country] || '🏳️'
        };
    } catch (e) {
        return { error: e.message };
    }
}

// === Helper: Format CC Response ===
function formatCCResponse(data, bin, binInfo) {
    if (data.error) return `❌ ERROR: ${data.error}`;
    if (!data.length) return '❌ NO CARDS GENERATED.';
    let text = `𝗕𝗜𝗡 ⇾ <code>${bin.slice(0,6)}</code>\n`;
    text += `𝗔𝗺𝗼𝘂𝗻𝘁 ⇾ <code>${data.length}</code>\n\n`;
    data.forEach(card => text += `<code>${card.toUpperCase()}</code>\n`);
    text += `\n𝗜𝗻𝗳𝗼: ${binInfo.card_type || 'NOT FOUND'} - ${binInfo.network || 'NOT FOUND'} (${binInfo.tier || 'NOT FOUND'})\n`;
    text += `𝐈𝐬𝐬𝐮𝐞𝐫: ${binInfo.bank || 'NOT FOUND'}\n`;
    text += `𝗖𝗼𝘂𝗻𝘁𝗿𝘆: ${binInfo.country || 'NOT FOUND'} ${binInfo.flag || '🏳️'}`;
    return text;
}

// === Force Join Middleware ===
bot.on('message', async (msg) => {
    saveUser(msg.from.id);
    if (msg.text && !msg.text.startsWith('/broadcast')) {
        const inChannel = await isUserInChannel(msg.from.id);
        if (!inChannel) {
            bot.sendMessage(msg.chat.id,
                `🔒 <b>Join our channel to use this bot!</b>\n\n👉 <a href="${CHANNEL_LINK}">Join Channel</a>`,
                { parse_mode: 'HTML', disable_web_page_preview: true }
            );
            return;
        }
    }
});

// === /gen Command ===
bot.onText(/^([/.]gen) (.+)/i, async (msg, match) => {
    const binInput = match[2];
    const bin = extractBin(binInput);
    if (!bin) {
        return bot.sendMessage(msg.chat.id, "❌ INVALID BIN FORMAT.", { parse_mode: "Markdown" });
    }
    const ccData = await generateCC(bin);
    const binInfo = await lookupBin(bin);
    const result = formatCCResponse(ccData, bin, binInfo);
    bot.sendMessage(msg.chat.id, result, { parse_mode: "HTML" });
});

// === /broadcast Command (Admins Only) ===
bot.onText(/^\/broadcast (.+)/i, async (msg, match) => {
    if (!ADMIN_IDS.includes(msg.from.id)) {
        return bot.sendMessage(msg.chat.id, "❌ You are not authorized to use this command.");
    }
    const text = match[1];
    let sent = 0, failed = 0;
    for (const userId of users) {
        try {
            await bot.sendMessage(userId, `📢 Broadcast:\n\n${text}`);
            sent++;
        } catch (e) {
            failed++;
        }
    }
    bot.sendMessage(msg.chat.id, `✅ Broadcast sent to ${sent} users. Failed: ${failed}`);
});

// === /start Command ===
bot.onText(/^\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "👋 Welcome! Use /gen <bin> to generate cards.");
});

// === Error Handling ===
bot.on('polling_error', (err) => console.error(err));
