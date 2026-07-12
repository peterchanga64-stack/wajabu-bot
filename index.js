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
            console.log('\n❌ ERROR: Tafadhali weka namba yako ya simu kwenye Render (Environment Variables)!');
            process.exit(1);
        }

        const cleanedNumber = phoneNumber.replace(/[^0-9]/g, '');
        console.log(`\n======================================\nInaomba Pairing Code kwa ajili ya: ${cleanedNumber}...`);
        
        setTimeout(async () => {
            try {
                let code = await sock.requestPairingCode(cleanedNumber);
                code = code?.match(/.{1,4}/g)?.join('-') || code;
                console.log(`\n🔑 PAIRING CODE YAKO NI: ${code}`);
                console.log('Ingia WhatsApp -> Linked Devices -> Link with Phone Number kisha weka kodi hiyo!\n======================================');
            } catch (error) {
                console.error('Imeshindwa kuomba Pairing Code, jaribu tena.', error);
            }
        }, 5000);
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

            // 1. AMRI YA JIBU SALAMU
            if (body.toLowerCase() === 'hello' || body.toLowerCase() === 'hi') {
                await sock.sendMessage(from, { text: 'Hello! How can I help you today?' }, { quoted: mek });
            }

            // 2. AMRI YA TAG ALL
            if (isGroup && (body.toLowerCase() === '.tagall' || body.toLowerCase() === '@tagall')) {
                const groupMetadata = await sock.groupMetadata(from);
                const participants = groupMetadata.participants;
                
                let teks = `📢 *WAKOMESHE WOTE! (TAG ALL)*\n\n💬 *Ujumbe:* Amka kume kucha! ✨\n\n`;
                let mentions = [];

                for (let mem of participants) {
                    teks += `🔹 @${mem.id.split('@')[0]}\n`;
                    mentions.push(mem.id);
                }

                await sock.sendMessage(from, { text: teks, mentions: mentions }, { quoted: mek });
            }

            // 3. ULINZI WA MA-GROUP (Kufuta Links, Mentions, na Matangazo ya Status)
            if (isGroup) {
                const textCheck = body.toLowerCase();
                
                // Anatafuta links za kawaida
                const hasLink = body.includes('http://') || body.includes('https://') || body.includes('www.');
                
                // Anatafuta herufi ya kutag mtu au link za magrupu ya WhatsApp
                const hasMentionOrGroupLink = body.includes('@') || textCheck.includes('chat.whatsapp.com');
                
                // Anatafuta maneno yanayotumika sana kusave namba na kutag status (Mfano: "save namba", "view status", "status view")
                const hasStatusSpam = textCheck.includes('status') || textCheck.includes('save namba') || textCheck.includes('kuona status');

                if (hasLink || hasMentionOrGroupLink || hasStatusSpam) {
                    const groupMetadata = await sock.groupMetadata(from);
                    const participants = groupMetadata.participants;
                    const isAdmin = participants.find(p => p.id === sender)?.admin !== null;

                    // Kama mtumaji sio admin, meseji inafutwa haraka sana
                    if (!isAdmin) {
                        await sock.sendMessage(from, { delete: mek.key });
                        await sock.sendMessage(from, { 
                            text: `⚠️ *Ulinzi wa Grupu:* Samahani @${sender.split('@')[0]}, hapa haoruhusiwi kutuma link, kutag watu, au kupromote mambo ya Status!`, 
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
