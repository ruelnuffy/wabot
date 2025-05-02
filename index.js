const qrcode = require('qrcode-terminal');
const { Client, LocalAuth, Buttons } = require('whatsapp-web.js'); // Added Buttons

// Initialize the WhatsApp client with local auth
const client = new Client({
    authStrategy: new LocalAuth()
});

// Generate QR code in terminal for login
client.on('qr', (qr) => {
    console.log('📲 Scan this QR code with WhatsApp:');
    qrcode.generate(qr, { small: true });
});

// Log when the client is ready
client.on('ready', () => {
    console.log('✅ WhatsApp bot is ready!');
});

// Handle incoming messages
client.on('message', async (message) => {
    const text = message.body.toLowerCase();

    if (text === '!ping') {
        await message.reply('🏓 Pong!');
    }

    else if (text === '!buttons') {
        const buttonMessage = new Buttons(
            '👇 Choose an option:',
            [
                { body: 'Option 1' },
                { body: 'Option 2' },
                { body: 'Option 3' }
            ],
            '🧠 My Bot Menu',
            'Select one'
        );
        await client.sendMessage(message.from, buttonMessage);
    }

    else if (text === 'option 1') {
        await message.reply('👍 You chose Option 1!');
    }

    else if (text === 'option 2') {
        await message.reply('🔥 You picked Option 2!');
    }

    else if (text === 'option 3') {
        await message.reply('💡 Option 3 it is!');
    }
});

// Start the bot
client.initialize();
