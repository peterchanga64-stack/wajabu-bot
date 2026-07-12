const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

async function initializeGuardBot() {
    const sessionPath = './session_auth';
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    
    // Retrieve environment variables from Railway
    const botNumber = process.env.BOT_NUMBER; 

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('creds.update', saveCreds);

    // GENERATE PAIRING CODE WITH DELAY TO PREVENT 428 ERROR
    if (!sock.authState.creds.registered) {
        setTimeout(async () => {
            try {
                if (!botNumber) {
                    console.error('❌ ERROR: BOT_NUMBER variable is missing in Railway Settings!');
                    return;
                }
                let code = await sock.requestPairingCode(botNumber.trim());
                console.log(`\n====================================`);
                code = code?.match(/.{1,4}/g)?.join('-');
                console.log(`🔥 SYSTEM READY! YOUR PAIRING CODE IS: ${code}`);
                console.log(`====================================\n`);
            } catch (err) {
                console.error('❌ Failed to generate pairing code. Retrying deployment...', err.message);
                // Clear corrupt session folder if pairing fails
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            }
        }, 8000); // 8 seconds delay gives Baileys enough time to handshake with WhatsApp servers
    }

    // CONNECTION HANDLER
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            console.log(`📡 Connection closed. Status Code: ${statusCode}. Reconnecting: ${shouldReconnect}`);
            
            if (shouldReconnect) {
                await delay(5000); // Wait 5 seconds before reconnecting
                initializeGuardBot();
            } else {
                console.log('❌ Session logged out. Cleaning session files...');
                if (fs.existsSync(sessionPath)) {
                    fs.rmSync(sessionPath, { recursive: true, force: true });
                }
            }
        } else if (connection === 'open') {
            console.log('✅ SUCCESS: Security Shield Active and Connected to WhatsApp!');
        }
    });

    // ULTIMATE GUARD SYSTEM (ANTI-LINK & ANTI-MENTION)
    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message || mek.key.fromMe) return; // Ignore empty messages and self-messages
            
            const from = mek.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const type = Object.keys(mek.message)[0];
            
            let body = (type === 'conversation') ? mek.message.conversation : 
                       (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';
            
            if (isGroup) {
                // Force 24/7 Typing Status for maximum stealth
                await sock.sendPresenceUpdate('composing', from);

                // 1. MENTION DETECTION ENGINE
                const mentions = mek.message[type]?.contextInfo?.mentionedJid || [];
                const groupMentions = mek.message[type]?.contextInfo?.groupMentions || []; 
                const hasMention = mentions.length > 0 || groupMentions.length > 0 || (body && body.includes('@'));

                // 2. ANTI-LINK DETECTION ENGINE
                const linkRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi;
                const hasLink = body && linkRegex.test(body);

                // ACTION TRIGGER: INSTANTLY DELETE IF TRAFFIC VIOLATES RULES
                if (hasMention || hasLink) {
                    console.log(`🛡️ Threat Detected! Purging message from: ${mek.key.participant || mek.key.remoteJid}`);
                    
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
            console.error('⚠️ Error inside Guard Module: ', err.message);
        }
    });
}

initializeGuardBot();




