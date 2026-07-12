const { default: makeWASocket, useMultiFileAuthState, disconnectInversion, fetchLatestBaileysVersion, jidDecode } = require('@whiskeysockets/baileys');
const pino = require('pino');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

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
        console.log('\n======================================');
        const phoneNumber = await question('Andika Namba ya Simu ya Bot (Mfano: 2557XXXXXXXX): ');
        const cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
        
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(cleanedNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`\n🔑 PAIRING CODE YAKO NI: ${code}`);
                console.log('Ingia WhatsApp -> Linked Devices -> Link with Phone Number kisha weka kodi hiyo!\n======================================');
            } catch (error) {
                console.error('Imeshindwa kuomba Pairing Code, jaribu tena.', error);
            }
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== 401;
            console.log('Muunganisho umekatika. Inajaribu kuunganisha tena...', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('🚀 BOT IMESHANGAA NA IPO ONLINE SASA HIVI!');
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

            // 1. Kujibu salamu za kawaida (Hello/Hi)
            if (body.toLowerCase() === 'hello' || body.toLowerCase() === 'hi') {
                await sock.sendMessage(from, { text: 'Hello! How can I help you today?' }, { quoted: mek });
            }

            // 2. Kuzuia Link kwenye Magrupu
            if (isGroup && (body.includes('http://') || body.includes('https://') || body.includes('www.'))) {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                
                // Angalia kama aliyetuma link ni Admin
                const isAdmin = participants.find(p => p.id === sender)?.admin !== null;

                if (!isAdmin) {
                    // Futa ujumbe (Delete link)
                    await sock.sendMessage(from, { delete: mek.key });
                    // Toa onyo
                    await sock.sendMessage(from, { text: `⚠️ Samahani, ni ma-admin tu wanaoruhusiwa kutuma link hapa!` });
                }
            }
        } catch (err) {
            console.log(err);
        }
    });
}

startBot();
