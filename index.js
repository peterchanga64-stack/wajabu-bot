const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    delay
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

async function launchUltimateShield() {
    const sessionDir = './session_auth';
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const targetNumber = process.env.BOT_NUMBER; 

    // Advanced configuration to bypass 428 Precondition and routing issues
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Mac OS', 'Chrome', '124.0.0.0'], // Emulating stable Desktop Chrome
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 30000
    });

    sock.ev.on('creds.update', saveCreds);

    // SECURE PAIRING CODE GENERATION INTERFACE
    if (!sock.authState.creds.registered) {
        // Generous timeout to allow full synchronization with WhatsApp Multi-Device backend
        setTimeout(async () => {
            try {
                if (!targetNumber) {
                    console.error('❌ CONFIGURATION ERROR: BOT_NUMBER environment variable is undefined.');
                    return;
                }
                
                // Clean phone number input formatting
                const cleanNumber = targetNumber.replace(/[^0-9]/g, '');
                console.log(`📡 Requesting secure authentication handshake for terminal: ${cleanNumber}`);
                
                let pairingCode = await sock.requestPairingCode(cleanNumber);
                
                console.log(`\n=================================================`);
                pairingCode = pairingCode?.match(/.{1,4}/g)?.join('-');
                console.log(`🔥 SYSTEM STABLE! PAIRING CODE GENERATED: ${pairingCode}`);
                console.log(`=================================================\n`);
            } catch (pairingError) {
                console.error('⚠️ Critical: Synchronization handshake failed. Purging active environment cache...');
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
                console.log('🔄 Session cleared. System restarting deployment sequence...');
                await delay(3000);
                process.exit(1); // Forces Railway to restart fresh instantly
            }
        }, 12000); // 12 seconds delay provides maximum window for backend allocation
    }

    // SYSTEM MATRIX GATEWAY (CONNECTION STABILIZER)
    sock.ev.on('connection.update', async (connectionUpdate) => {
        const { connection, lastDisconnect } = connectionUpdate;
        
        if (connection === 'close') {
            const reasonCode = lastDisconnect?.error?.output?.statusCode;
            const systemRecovery = reasonCode !== DisconnectReason.loggedOut;
            
            console.log(`📉 Network Gateway Dropped. Status: ${reasonCode}. Recovery Pipeline: ${systemRecovery}`);
            
            if (systemRecovery) {
                await delay(5000);
                launchUltimateShield();
            } else {
                console.log('❌ Session permanently revoked by host. Cleaning active storage...');
                if (fs.existsSync(sessionDir)) {
                    fs.rmSync(sessionDir, { recursive: true, force: true });
                }
                process.exit(1);
            }
        } else if (connection === 'open') {
            console.log('✅ BACKEND STATUS: SUCCESSFUL. Guard Shield Active 24/7.');
        }
    });

    // PACKET INTERCEPTOR CORE (ANTI-LINK, ANTI-MENTION & STEALTH TYPING)
    sock.ev.on('messages.upsert', async (incomingPayload) => {
        try {
            const rawMessage = incomingPayload.messages[0];
            if (!rawMessage.message || rawMessage.key.fromMe) return; 
            
            const chatJid = rawMessage.key.remoteJid;
            const isGroupTraffic = chatJid.endsWith('@g.us');
            const messageType = Object.keys(rawMessage.message)[0];
            
            let messageContent = (messageType === 'conversation') ? rawMessage.message.conversation : 
                                 (messageType === 'extendedTextMessage') ? rawMessage.message.extendedTextMessage.text : '';
            
            if (isGroupTraffic) {
                // Continuous presence masquerade
                await sock.sendPresenceUpdate('composing', chatJid);

                // Extraction of explicit metadata parameters
                const structuredMentions = rawMessage.message[messageType]?.contextInfo?.mentionedJid || [];
                const clusterMentions = rawMessage.message[messageType]?.contextInfo?.groupMentions || []; 
                
                const containsMention = structuredMentions.length > 0 || clusterMentions.length > 0 || (messageContent && messageContent.includes('@'));

                // Comprehensive Regex engine filtering unauthorized digital signatures
                const linkSignatures = /(https?:\/\/[^\s]+|www\.[^\s]+|chat\.whatsapp\.com|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\/[^\s]*)/gi;
                const containsLink = messageContent && linkSignatures.test(messageContent);

                // EXECUTING PURGE PROTOCOL
                if (containsMention || containsLink) {
                    console.log(`🛡️ Threat Blocked: Violation detected from client identification scope: ${rawMessage.key.participant || rawMessage.key.remoteJid}`);
                    
                    await sock.sendMessage(chatJid, { 
                        delete: { 
                            remoteJid: chatJid, 
                            fromMe: false, 
                            id: rawMessage.key.id, 
                            participant: rawMessage.key.participant 
                        } 
                    });
                }
            }

        } catch (runtimeError) {
            console.error('⚠️ Warning: Packet Dropped inside Guard Module: ', runtimeError.message);
        }
    });
}

// System Initiation
launchUltimateShield();
