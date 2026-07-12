const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { GoogleGenAI } = require('@google/genai');

// Kuseti Gemini AI
const apiKey = process.env.GEMINI_API_KEY;
let ai = null;
if (apiKey) {
    ai = new GoogleGenAI({ apiKey: apiKey });
}

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    if (!sock.authState.creds.registered) {
        const phoneNumber = process.env.BOT_NUMBER; 
        if (!phoneNumber) {
            console.log('\n❌ ERROR: Please set your BOT_NUMBER in Render (Environment Variables)!');
            process.exit(1);
        }
        const cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
        console.log(`\n======================================\nRequesting Pairing Code for: ${cleanedNumber}...`);
        
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(cleanedNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`\n🔑 YOUR PAIRING CODE IS: ${code}`);
                console.log('Go to WhatsApp -> Linked Devices -> Link with Phone Number and enter this code!\n======================================');
            } catch (error) {
                console.error('Failed to request pairing code:', error);
            }
        }, 5000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log('Connection closed. Reconnecting...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('🚀 BOT IS SUCCESSFULLY ONLINE AND ACTIVE WITH GEMINI AI!');
        }
    });

    // 1. KUANGALIA NA KU-VIEW STATUS (STORIES) AUTOMATIC
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            
            const from = mek.key.remoteJid;
            
            if (from === 'status@broadcast') {
                await sock.readMessages([mek.key]);
                console.log(`👁️ Status viewed automatically from: ${mek.key.participant.split('@')[0]}`);
                return;
            }

            if (mek.key.fromMe) return;

            const isGroup = from.endsWith('@g.us');
            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || '';
            const sender = mek.key.participant || from;

            // 2. KUWEKA TYPING MUDA WOTE ANAPOPOKEA UJUMBE
            await sock.sendPresenceUpdate('composing', from);

            // 3. AMRI YA TAG ALL KWENYE MAGRUPU
            if (isGroup && (body.toLowerCase() === '.tagall' || body.toLowerCase() === '@tagall')) {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                
                let teks = `📢 *ATTENTION EVERYONE! (TAG ALL)*\n\n💬 *Message:* Check the group updates. ✨\n\n`;
                let mentions = [];
                for (let mem of participants) {
                    teks += `🔹 @${mem.id.split('@')[0]}\n`;
                    mentions.push(mem.id);
                }
                await sock.sendMessage(from, { text: teks, mentions: mentions }, { quoted: mek });
                return;
            }

            // 4. ULINZI WA MAGRUPU (Kufuta Link na Matangazo ya Status)
            if (isGroup) {
                const textCheck = body.toLowerCase();
                const hasLink = body.includes('http://') || body.includes('https://') || body.includes('www.');
                const hasStatusSpam = textCheck.includes('status') || textCheck.includes('save namba') || textCheck.includes('chat.whatsapp.com');

                if (hasLink || hasStatusSpam) {
                    const groupMetadata = await sock.groupMetadata(from);
                    const participants = groupMetadata.participants;
                    const isAdmin = participants.find(p => p.id === sender)?.admin !== null;

                    if (!isAdmin) {
                        await sock.sendMessage(from, { delete: mek.key });
                        await sock.sendMessage(from, { 
                            text: `⚠️ *Group Security:* Sorry @${sender.split('@')[0]}, sharing links or status promotions is strictly prohibited!`, 
                            mentions: [sender] 
                        });
                        return;
                    }
                }
            }

            // 5. INBOUND CHAT INAYOUNGANISHWA NA GEMINI AI (Kwenye DM za Kawaida)
            if (!isGroup && ai) {
                try {
                    const response = await ai.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: body,
                    });
                    
                    const aiReply = response.text;
                    // Kusubiri sekunde 2 kuiga uhalisia wa binadamu anaye-type
                    setTimeout(async () => {
                        await sock.sendMessage(from, { text: aiReply }, { quoted: mek });
                        await sock.sendPresenceUpdate('paused', from);
                    }, 2000);
                } catch (aiErr) {
                    console.error('Gemini Error:', aiErr);
                }
            }
        } catch (err) {
            console.log(err);
        }
    });

    // 6. KUWEKA WATU WALIOTOKA (ANTI-LEFT / AUTO ADD BACK)
    sock.ev.on('group-participants.update', async (anu) => {
        try {
            // Kama tukio ni mtu "kuondolewa" au "kuleft" mwenyewe (remove)
            if (anu.action === 'remove') {
                const from = anu.id;
                
                // Mfumo unajaribu kumrudisha kila aliyetoka kiotomatiki
                for (let num of anu.participants) {
                    console.log(`🔄 Attempting to add back: ${num}`);
                    try {
                        await sock.groupParticipantsUpdate(from, [num], "add");
                        await sock.sendMessage(from, { text: `🔄 *Security Update:* Automatically added back @${num.split('@')[0]} after leaving/being removed.`, mentions: [num] });
                    } catch (addErr) {
                        console.error(`Failed to add back ${num}:`, addErr);
                    }
                }
            }
        } catch (err) {
            console.log(err);
        }
    });
}

startBot();
