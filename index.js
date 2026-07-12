const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_auth');
    const botNumber = process.env.BOT_NUMBER; // Namba yako ya Railway (mfano: 255XXXXXXXXX)

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    // KUPATA PAIRING CODE KWENYE RAILWAY LOGS
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            let code = await sock.requestPairingCode(botNumber);
            console.log(`\n====================================`);
            code = code?.match(/.{1,4}/g)?.join('-');
            console.log(`🔥 PAIRING CODE YAKO: ${code}`);
            console.log(`====================================\n`);
        }, 5000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('Ulinzi Kamili (Anti-Link + Anti-Mention) umewaka!');
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return; // Zuia bot isijifute yenyewe au kufuta kodi zake
            
            const from = mek.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const type = Object.keys(mek.message)[0];
            
            let body = (type === 'conversation') ? mek.message.conversation : 
                       (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';
            
            if (isGroup) {
                // Washa 'typing...' status masaa 24 kila ujumbe unapoingia
                await sock.sendPresenceUpdate('composing', from);

                // 1. UKAGUZI WA MENTIONS
                const mentions = mek.message[type]?.contextInfo?.mentionedJid || [];
                const groupMentions = mek.message[type]?.contextInfo?.groupMentions || []; 
                
                // Mtego wa Mentions na Tag zote
                const hasMention = mentions.length > 0 || groupMentions.length > 0 || (body && body.includes('@'));

                // 2. UKAGUZI WA LINKS (Anti-Link)
                // Hapa tunatega kama kuna herufi kama http://, https://, chat.whatsapp.com, au .com/.net/.org hovyo hovyo
                const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi;
                const hasLink = body && linkRegex.test(body);

                // KAMA KUNA MENTION AU LINK - CHUMA INAPIGA CHINI HARAKA SANA
                if (hasMention || hasLink) {
                    console.log(`Mtego umenaswa! Kufuta ujumbe wenye Link/Mention kutoka: ${mek.key.participant || mek.key.remoteJid}`);
                    
                    await sock.sendMessage(from, { 
                        delete: { 
                            remoteJid: from, 
                            fromMe: false, 
                            id: mek.key.id, 
                            participant: mek.key.participant 
                        } 
                    });
                }
            }

        } catch (err) {
            console.log('Error kwenye mfumo wa ulinzi: ', err);
        }
    });
}

startBot();



