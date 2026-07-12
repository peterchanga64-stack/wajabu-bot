const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');

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
            console.log('\n❌ ERROR: Please set your phone number in Render (Environment Variables)!');
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
                console.error('Failed to request pairing code, please try again.', error);
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
            console.log('🚀 BOT IS SUCCESSFULLY ONLINE AND ACTIVE!');
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            if (mek.key.fromMe) return;

            const from = mek.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const body = mek.message.conversation || mek.message.extendedTextMessage?.text || '';
            const sender = mek.key.participant || from;

            // 1. HELLO / HI COMMAND
            if (body.toLowerCase() === 'hello' || body.toLowerCase() === 'hi') {
                await sock.sendMessage(from, { text: 'Hello! How can I help you today?' }, { quoted: mek });
            }

            // 2. TAG ALL COMMAND
            if (isGroup && (body.toLowerCase() === '.tagall' || body.toLowerCase() === '@tagall')) {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                
                let teks = `📢 *ATTENTION EVERYONE! (TAG ALL)*\n\n💬 *Message:* Wake up! Check the group updates. ✨\n\n`;
                let mentions = [];

                for (let mem of participants) {
                    teks += `🔹 @${mem.id.split('@')[0]}\n`;
                    mentions.push(mem.id);
                }

                await sock.sendMessage(from, { text: teks, mentions: mentions }, { quoted: mek });
            }

            // 3. GROUP SECURITY (Anti-Links, Anti-Mentions, and Anti-Status Spam)
            if (isGroup) {
                const textCheck = body.toLowerCase();
                
                const hasLink = body.includes('http://') || body.includes('https://') || body.includes('www.');
                const hasMentionOrGroupLink = body.includes('@') || textCheck.includes('chat.whatsapp.com');
                const hasStatusSpam = textCheck.includes('status') || textCheck.includes('save namba') || textCheck.includes('kuona status');

                if (hasLink || hasMentionOrGroupLink || hasStatusSpam) {
                    const groupMetadata = await sock.groupMetadata(from);
                    const participants = groupMetadata.participants;
                    const isAdmin = participants.find(p => p.id === sender)?.admin !== null;

                    // If the sender is not an admin, delete the message immediately
                    if (!isAdmin) {
                        await sock.sendMessage(from, { delete: mek.key });
                        await sock.sendMessage(from, { 
                            text: `⚠️ *Group Security:* Sorry @${sender.split('@')[0]}, only group admins are allowed to share links, tag members, or promote statuses here!`, 
                            mentions: [sender] 
                        });
                    }
                }
            }
        } catch (err) {
            console.log(err);
        }
    });
}

startBot();
