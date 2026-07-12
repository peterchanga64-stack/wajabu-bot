const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const { GoogleGenAI } = require('@google/generative-ai');
const pino = require('pino');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_auth');
    const apiKey = process.env.GEMINI_API_KEY;
    const botNumber = process.env.BOT_NUMBER; // Mfano: 2557XXXXXXXX

    const ai = new GoogleGenAI({ apiKey });
    const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
            console.log(`🔥 CHUMA IPO TAYARI! PAIRING CODE YAKO NI: ${code}`);
            console.log(`====================================\n`);
        }, 5000);
    }

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('Chuma imekubali na ipo Connected WhatsApp!');
        }
    });

    sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
            const mek = chatUpdate.messages[0];
            if (!mek.message) return;
            
            const from = mek.key.remoteJid;
            const isGroup = from.endsWith('@g.us');
            const type = Object.keys(mek.message)[0];
            
            // Pata maandishi ya ujumbe
            let body = (type === 'conversation') ? mek.message.conversation : 
                       (type === 'extendedTextMessage') ? mek.message.extendedTextMessage.text : '';
            
            if (!body) return;

            // 1. ULINZI WA GROUP: KUFUTA WANAO-MENTION GROUP ZIMA (@everyone / @tagall)
            if (isGroup) {
                const mentions = mek.message[type]?.contextInfo?.mentionedJid || [];
                
                // Ukaguzi kama ujumbe una tag za watu wengi au neno maalum la mtego
                if (mentions.length > 5 || body.includes('@everyone') || body.includes('@tagall')) {
                    console.log(`Mtego umenaswa! Kufuta tag kutoka: ${mek.key.participant}`);
                    
                    // Futa ujumbe huo hapo hapo
                    await sock.sendMessage(from, { 
                        delete: { 
                            remoteJid: from, 
                            fromMe: false, 
                            id: mek.key.id, 
                            participant: mek.key.participant 
                        } 
                    });
                    return; // Zuia Gemini asijibu huu ujumbe uliyofutwa
                }
            }

            // 2. CHAT BOT (AI RESPONSE)
            // Zuia bot isijijibu yenyewe
            if (mek.key.fromMe) return;

            // Kama ni DM au Bot imetajwa kwenye Group, Gemini anajibu
            const botId = sock.user.id.split(':')[0];
            if (!isGroup || body.includes(`@${botId}`)) {
                // Safisha kodi ya tag kabla ya kutuma kwa Gemini
                const cleanText = body.replace(`@${botId}`, '').trim();
                
                const result = await model.generateContent(cleanText);
                const response = await result.response;
                
                await sock.sendMessage(from, { text: response.text() }, { quoted: mek });
            }

        } catch (err) {
            console.log('Error kwenye ujumbe: ', err);
        }
    });
}

startBot();

