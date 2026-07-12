const { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('session_auth');
    const botNumber = process.env.BOT_NUMBER; // Namba yako uliyoweka Railway (e.g., 2557XXXXXXXX)

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
            console.log('Ulinzi umewaka rasmi na Chuma ipo Connected!');
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

            // ULINZI WA GROUP: KUFUTA WANAO-MENTION GROUP ZIMA au WENYE TAG NYINGI
            if (isGroup) {
                const mentions = mek.message[type]?.contextInfo?.mentionedJid || [];
                
                // Mtego: Kama mtu ametag watu zaidi ya 5, au ametumia @everyone au @tagall
                if (mentions.length > 5 || body.includes('@everyone') || body.includes('@tagall')) {
                    console.log(`Mtego umenaswa! Kufuta tag zilizotumwa na: ${mek.key.participant}`);
                    
                    // Futa ujumbe huo papo hapo
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
            console.log('Error kwenye ulinzi: ', err);
        }
    });
}

startBot();


