// index.js
require("dotenv").config();
// catch literally _everything_
process.on("unhandledRejection", (reason, promise) => {
  console.error("🔴 UNHANDLED REJECTION:", reason, {
    message: reason?.message,
    stack: reason?.stack,
    error: reason?.error,        // in case it's an ErrorEvent
    filename: reason?.filename,  // DOM ErrorEvent props
    lineno: reason?.lineno,
    colno: reason?.colno,
  });
});
process.on("uncaughtException", (err) => {
  console.error("🔴 UNCAUGHT EXCEPTION:", err, err.stack);
});

const { Client } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const qrImage = require("qrcode"); // Add this for web-friendly QR codes
const express = require("express"); // Add this for web server
const { createClient } = require("@supabase/supabase-js");
const SupaAuth = require("./supa-auth");
const path = require("path");
const fs = require("fs");
const cron = require("node-cron");

// ───────── express app setup ─────────
const app = express();
const PORT = process.env.PORT || 3000;
let lastQR = null;
let isConnected = false;
// Create a global client instance so it's accessible throughout the app
let client = null;

// Get the base URL for Railway or local development
const getBaseUrl = () => {
  // Railway provides RAILWAY_STATIC_URL or we can construct it
  if (process.env.RAILWAY_STATIC_URL) {
    return process.env.RAILWAY_STATIC_URL;
  }
  if (process.env.RAILWAY_PROJECT_NAME) {
    return `https://${process.env.RAILWAY_PROJECT_NAME}.railway.app`;
  }
  // For local development
  return `http://localhost:${PORT}`;
};

// Add middleware for logging requests - helpful for debugging
app.use((req, res, next) => {
  console.log(`📝 ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Simple QR code endpoint
app.get('/qr', async (req, res) => {
  console.log("QR endpoint accessed, lastQR:", lastQR ? "Available" : "Not available");
  
  if (!lastQR) {
    return res.status(404).send('No QR code available. WhatsApp might already be connected or still initializing.');
  }
  
  try {
    // Set proper content type
    res.setHeader('content-type', 'image/png');
    
    // Generate QR code as image and send directly to response
    await qrImage.toFileStream(res, lastQR, {
      width: 300,
      margin: 4,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });
    console.log("QR code image generated and sent successfully");
  } catch (error) {
    console.error("Failed to generate QR image:", error);
    res.status(500).send('Failed to generate QR code');
  }
});

// HTML page to display QR code with auto-refresh
app.get('/', (req, res) => {
  console.log("Home page accessed, connection status:", isConnected ? "Connected" : "Not connected");
  const baseUrl = getBaseUrl();

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>WhatsApp Bot QR Code</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="refresh" content="30">
    <style>
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
        text-align: center; 
        margin: 0; 
        padding: 20px; 
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        min-height: 100vh;
        color: white;
      }
      .container { 
        max-width: 500px; 
        margin: 0 auto; 
        background: rgba(255,255,255,0.1);
        backdrop-filter: blur(10px);
        border-radius: 20px;
        padding: 30px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      }
      .logo {
        font-size: 2rem;
        font-weight: bold;
        margin-bottom: 10px;
      }
      .subtitle {
        opacity: 0.8;
        margin-bottom: 30px;
      }
      img { 
        max-width: 100%; 
        height: auto; 
        border-radius: 15px;
        background: white;
        padding: 20px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      }
      .status { 
        margin: 20px 0; 
        padding: 15px; 
        border-radius: 12px; 
        font-weight: 500;
      }
      .connected { 
        background-color: rgba(76, 175, 80, 0.2); 
        border: 2px solid #4CAF50;
        color: #4CAF50; 
      }
      .waiting { 
        background-color: rgba(255, 193, 7, 0.2); 
        border: 2px solid #FFC107;
        color: #FFC107; 
      }
      .qr-container { 
        padding: 20px; 
        border: 2px solid rgba(255,255,255,0.3); 
        border-radius: 15px; 
        margin-top: 20px; 
        background: rgba(255,255,255,0.05);
      }
      .instructions {
        margin: 20px 0;
        padding: 15px;
        background: rgba(255,255,255,0.1);
        border-radius: 10px;
        font-size: 0.9rem;
      }
      .url-info {
        margin-top: 20px;
        padding: 15px;
        background: rgba(0,0,0,0.2);
        border-radius: 10px;
        font-family: monospace;
        font-size: 0.8rem;
        word-break: break-all;
      }
      .refresh-info {
        position: fixed;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.5);
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 0.8rem;
        backdrop-filter: blur(5px);
      }
      @media (max-width: 600px) {
        .container { margin: 10px; padding: 20px; }
        body { padding: 10px; }
      }
    </style>
    <script>
      let countdown = 30;
      
      function updateCountdown() {
        const element = document.getElementById('countdown');
        if (element) {
          element.textContent = countdown;
          countdown--;
          if (countdown < 0) {
            countdown = 30;
          }
        }
      }
      
      function checkStatus() {
        fetch('/status')
          .then(response => response.json())
          .then(data => {
            const statusText = document.getElementById('status-text');
            const statusDiv = document.getElementById('status');
            const qrContainer = document.getElementById('qr-container');
            
            if (data.connected) {
              statusText.textContent = '✅ Connected to WhatsApp! Bot is running.';
              statusDiv.className = 'status connected';
              if (qrContainer) qrContainer.style.display = 'none';
            } else {
              statusText.textContent = '⏳ Waiting for WhatsApp connection...';
              statusDiv.className = 'status waiting';
              if (qrContainer) qrContainer.style.display = 'block';
              
              // Update QR image with cache busting
              const img = document.getElementById('qr-code');
              if (img) {
                img.src = '/qr?' + new Date().getTime();
              }
            }
          })
          .catch(error => {
            console.error('Status check failed:', error);
          });
      }
      
      setInterval(updateCountdown, 1000);
      setInterval(checkStatus, 5000);
      window.onload = function() {
        checkStatus();
        updateCountdown();
      };
    </script>
  </head>
  <body>
    <div class="refresh-info">
      Auto-refresh in: <span id="countdown">30</span>s
    </div>
    
    <div class="container">
      <div class="logo">🤖 Venille WhatsApp Bot</div>
      <div class="subtitle">Menstrual & Sexual Health AI Companion</div>
      
      <div id="status" class="status waiting">
        <p id="status-text">Checking connection status...</p>
      </div>
      
      <div id="qr-container" class="qr-container">
        <h3>📱 Connect Your WhatsApp</h3>
        <div class="instructions">
          <strong>How to connect:</strong><br>
          1. Open WhatsApp on your phone<br>
          2. Go to Settings → Linked Devices<br>
          3. Tap "Link a Device"<br>
          4. Scan the QR code below
        </div>
        <img src="/qr" alt="WhatsApp QR Code" id="qr-code" onerror="this.style.display='none'">
        <p><small>Page refreshes automatically every 30 seconds</small></p>
      </div>
      
      <div class="url-info">
        <strong>🔗 App URL:</strong><br>
        ${baseUrl}
      </div>
    </div>
  </body>
  </html>
  `;
  
  res.send(html);
});

// Status endpoint for the frontend to check
app.get('/status', (req, res) => {
  const status = {
    connected: isConnected,
    hasQR: !!lastQR,
    timestamp: new Date().toISOString(),
    baseUrl: getBaseUrl()
  };
  
  console.log("Status endpoint accessed:", status);
  res.json(status);
});

// Add health check endpoint that Railway might use
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    connected: isConnected,
    timestamp: new Date().toISOString()
  });
});

// ───────── supabase client (for session storage) ─────────
if (!process.env.SUPA_URL || !process.env.SUPA_KEY) {
  throw new Error("Missing SUPA_URL or SUPA_KEY in environment");
}
const supabase = createClient(process.env.SUPA_URL, process.env.SUPA_KEY);

// ───────── helper to find Chrome/Chromium ─────────
const CHROME_PATHS = [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
  "/snap/bin/chromium",
];
function findChromePath() {
  for (const p of CHROME_PATHS) {
    if (fs.existsSync(p)) {
      console.log(`✔️  Found browser at ${p}`);
      return p;
    }
  }
  console.warn("⚠️  No standard Chrome found; letting Puppeteer pick.");
  return null;
}

// ───────── helpers (dates, strings, etc) ───────────
const CYCLE = 28;
const fmt = (d) => d.toLocaleDateString("en-GB");
const addD = (d, n) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};
const norm = (s) =>
  (s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const mem = {}; // chat‑state (id → { step, data })

function st(id) {
  return (mem[id] ??= { step: null, data: {} });
}
function format(str, ...a) {
  return str.replace(/{(\d+)}/g, (_, i) => a[i] ?? _);
}

// Helper function to get strings in user's language
function str(jid, key, ...args) {
  const lang = getUserLangCache(jid);
  const strings = STRINGS[lang] || STRINGS.English;
  const template = strings[key] || STRINGS.English[key] || key;
  return format(template, ...args);
}
// ---------- i18n strings (unchanged, shortened for brevity) ----------
const STRINGS = {
  English: {
    menu: `Hi, I'm *Venille AI*, your private menstrual & sexual-health companion.

Reply with the *number* **or** the *words*:

1️⃣  Track my period
2️⃣  Log symptoms
3️⃣  Learn about sexual health
4️⃣  Order Venille Pads
5️⃣  View my cycle
6️⃣  View my symptoms
7️⃣  Change language
8️⃣  Give feedback / report a problem`,

    fallback:
      "Sorry, I didn't get that.\nType *menu* to see what I can do.",
    trackPrompt: "🩸 When did your last period start? (e.g. 12/05/2025)",
    langPrompt: "Type your preferred language (e.g. English, Hausa…)",
    savedSymptom: "Saved ✔︎ — send another, or type *done*.",
    askReminder:
      "✅ Saved! Your next period is likely around *{0}*.\nWould you like a reminder? (yes / no)",
    reminderYes: "🔔 Reminder noted! I'll message you a few days before.",
    reminderNo: "👍 No problem – ask me any time.",
    invalidDate: "🙈 Please type the date like *12/05/2025*",
    notValidDate: "🤔 That doesn't look like a valid date.",
    symptomsDone: "✅ {0} symptom{1} saved. Feel better soon ❤️",
    symptomsCancel: "🚫 Cancelled.",
    symptomsNothingSaved: "Okay, nothing saved.",
    symptomPrompt:
      "How are you feeling? Send one symptom at a time.\nWhen done, type *done* (or *cancel*).",
    eduTopics: `What topic?

1️⃣  STIs  
2️⃣  Contraceptives  
3️⃣  Consent  
4️⃣  Hygiene during menstruation  
5️⃣  Myths and Facts`,
    languageSet: "🔤 Language set to *{0}*.",
    noPeriod: "No period date recorded yet.",
    cycleInfo: `📅 *Your cycle info:*  
• Last period: *{0}*  
• Predicted next: *{1}*`,
    noSymptoms: "No symptoms logged yet.",
    symptomsHistory: "*Your symptom history (last 5):*\n{0}",
    feedbackQ1:
      "Did you have access to sanitary pads this month?\n1. Yes   2. No",
    feedbackQ2: 'Thanks. What challenges did you face? (or type "skip")',
    feedbackThanks: "❤️  Feedback noted — thank you!",
    orderQuantityPrompt:
      "How many packs of *Venille Pads* would you like to order?",
    orderQuantityInvalid:
      "Please enter a *number* between 1 and 99, e.g. 3",
    orderConfirmation: `✅ Your order for *{0} pack{1}* has been forwarded.

Tap the link below to chat directly with our sales team and confirm delivery:
{2}

Thank you for choosing Venille!`,
    orderVendorMessage: `🆕 *Venille Pads order*

From : {0}
JID  : {1}
Qty  : {2} pack{3}

(Please contact the customer to arrange delivery.)`,
  },

  Hausa: {
    menu: `Sannu, ni ce *Venille AI*, abokiyar lafiyar jinin haila da dangantakar jima'i.

Zaɓi daga cikin waɗannan:

1️⃣  Bi jinin haila
2️⃣  Rubuta alamomin rashin lafiya
3️⃣  Koyi game da lafiyar jima'i
4️⃣  Yi odar Venille Pads
5️⃣  Duba zagayen haila
6️⃣  Duba alamun rashin lafiya
7️⃣  Sauya harshe
8️⃣  Bayar da ra'ayi / rahoto matsala`,

    fallback:
      "Yi hakuri, ban gane ba.\nRubuta *menu* don ganin abin da zan iya yi.",
    trackPrompt:
      "🩸 Yaushe ne lokacin farkon jinin haila na ƙarshe? (e.g. 12/05/2025)",
    langPrompt: "Rubuta harshen da kake so (misali: English, Hausa…)",
    savedSymptom: "An ajiye ✔︎ — aika wani ko rubuta *done*.",
    askReminder:
      "✅ An ajiye! Ana sa ran haila na gaba ne kusa da *{0}*.\nKana son aiko maka da tunatarwa? (ee / a'a)",
    reminderYes:
      "🔔 Tunatarwa ta samu! Zan aiko maka saƙo 'yan kwanakin kafin.",
    reminderNo: "👍 Babu damuwa - tambayi ni a kowane lokaci.",
    invalidDate: "🙈 Da fatan za a rubuta kwanan wata kamar *12/05/2025*",
    notValidDate: "🤔 Wannan bai yi kama da kwanan wata mai kyau ba.",
    symptomsDone: "✅ An ajiye alama {0}{1}. Da fatan kawo maki sauki ❤️",
    symptomsCancel: "🚫 An soke.",
    symptomsNothingSaved: "To, ba a adana komai ba.",
    symptomPrompt:
      "Yaya jikin ki? Aika alama guda ɗaya a kowane lokaci.\nIn an gama, rubuta *done* (ko *cancel*).",
    eduTopics: `Wane batun?

1️⃣  Cutar STIs  
2️⃣  Hanyoyin Dakile Haihuwa  
3️⃣  Yarda  
4️⃣  Tsabta yayin jinin haila  
5️⃣  Karin Magana da Gaskiya`,
    languageSet: "🔤 An saita harshe zuwa *{0}*.",
    noPeriod: "Ba a yi rijistar kwanan haila ba har yanzu.",
    cycleInfo: `📅 *Bayanin zagayen haila:*  
• Haila na ƙarshe: *{0}*  
• Ana hasashen na gaba: *{1}*`,
    noSymptoms: "Ba a rubuta alamun rashin lafiya ba har yanzu.",
    symptomsHistory:
      "*Tarihin alamun rashin lafiyarki (na ƙarshe 5):*\n{0}",
    feedbackQ1:
      "Shin kun samu damar samun sanitary pads a wannan watan?\n1. Ee   2. A'a",
    feedbackQ2:
      'Na gode. Wane irin kalubale kuka fuskanta? (ko rubuta "skip")',
    feedbackThanks: "❤️  An lura da ra'ayin ku - na gode!",
    orderQuantityPrompt: "Kwunnan *Venille Pads* nawa kuke son siyan?",
    orderQuantityInvalid:
      "Da fatan a shigar da *lambar* tsakanin 1 da 99, misali 3",
    orderConfirmation: `✅ An aika odar ku ta *kwunan {0}{1}*.

Danna wannan hanyar don tattaunawa kai tsaye da ma\'aikatan sayarwarmu don tabbatar da isar:
{2}

Mun gode da zaɓen Venille!`,
    orderVendorMessage: `🆕 *Odar Venille Pads*

Daga : {0}
JID  : {1}
Adadi: {2} kwunan{3}

(Da fatan a tuntuɓi masoyi don shirya isar da shi.)`,
  },
  // Add more languages here as needed
};

// ---------- Supabase data helpers (all async) ----------
async function getUser(jid) {
  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("jid", jid)
    .single();
  return data;
}
async function upsertUser(jid, wa_name) {
  const now = new Date().toISOString();
  const row = await getUser(jid);
  if (row) {
    await supabase
      .from("users")
      .update({ wa_name, last_seen: now })
      .eq("jid", jid);
  } else {
    await supabase
      .from("users")
      .insert([{ jid, wa_name, first_seen: now, last_seen: now }]);
  }
}
const UserUpdate = {
  lang: (jid, language) =>
    supabase.from("users").update({ language }).eq("jid", jid),
  period: (jid, last, next) =>
    supabase
      .from("users")
      .update({ last_period: last, next_period: next })
      .eq("jid", jid),
  reminder: (jid, wants) =>
    supabase.from("users").update({ wants_reminder: wants }).eq("jid", jid),
};
const Symptom = {
  add: (jid, sym) =>
    supabase.from("symptoms").insert([{ jid, symptom: sym }]),
  list: (jid) =>
    supabase
      .from("symptoms")
      .select("symptom,logged_at")
      .eq("jid", jid)
      .order("logged_at", { ascending: false }),
};
const Feedback = {
  add: (jid, r1, r2) =>
    supabase
      .from("feedback")
      .insert([{ jid, response1: r1, response2: r2 }]),
};

// ---------- language helpers ----------
function getUserLangCache(jid) {
  return mem[jid]?.langCache || "English";
}
async function refreshLangCache(jid) {
  const u = await getUser(jid);
  mem[jid] = mem[jid] || {};
  mem[jid].langCache = u?.language || "English";
}

async function safeSend(id, text) {
  try {
    await client.sendMessage(id, text);
  } catch (e) {
    console.warn("[send fail]", e.message);
  }
}

// ───────── main function ─────────
(async function main() {
  try {
    // Start the express server first
    app.listen(PORT, () => {
      console.log(`🌐 Web server running on port ${PORT}`);
      console.log(`🔗 Access the QR code at: http://localhost:${PORT}`);
    });

    // Generate a unique session identifier for logging purposes
    const sessionId = `session-${Date.now()}`;
    console.log("📂 Session ID:", sessionId);

    const chromePath = findChromePath();

    const client = new Client({
      authStrategy: new SupaAuth({
        tableName: "whatsapp_sessions",
      }),
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-extensions",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-features=TranslateUI",
          "--disable-ipc-flooding-protection",
          // Use /tmp for Chrome user data to avoid permission issues
          `--user-data-dir=/tmp/chrome-${sessionId}`,
          // Disable singleton check to prevent lock file issues
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-default-apps",
          // Additional arguments for containerized environments
          "--single-process",
          "--no-zygote",
          "--disable-background-networking",
          "--disable-sync",
          "--metrics-recording-only",
          "--safebrowsing-disable-auto-update",
          "--disable-component-update",
        ],
        ignoreHTTPSErrors: true,
        timeout: 600000,
        dumpio: false, // Disable dumpio to reduce noise in logs
      },
    });

   client.on('qr', async qr => {
  console.log('🔍 WhatsApp Authentication Required');
  console.log('='.repeat(60));
  
  lastQR = qr; // Store for web endpoint
  
  try {
    // Generate a simple block-style QR code that displays well in Railway logs
    const QRCode = require('qrcode');
    
    // Generate QR as a simple string using UTF-8 blocks
    const qrString = await QRCode.toString(qr, {
      type: 'utf8',
      width: 60,
      margin: 2,
      color: {
 dark: '#000000', // black blocks
    light: '#FFFFFF' // white spaces
      }
    });
    
    console.log('📱 SCAN WITH WHATSAPP:');
    console.log('');
    console.log(qrString);
    console.log('');
    
  } catch (error) {
    console.error('Failed to generate terminal QR code:', error);
    
    // Fallback: Display a simple ASCII grid
    console.log('📱 QR Code (fallback view):');
    console.log('┌' + '─'.repeat(50) + '┐');
    console.log('│' + ' '.repeat(16) + 'QR CODE HERE' + ' '.repeat(22) + '│');
    console.log('│' + ' '.repeat(10) + 'Visit web interface for QR' + ' '.repeat(13) + '│');
    console.log('└' + '─'.repeat(50) + '┘');
  }
  
  // Always show web interface info
  console.log('🌐 Better viewing options:');
  console.log(`   • Web interface: https://your-app.railway.app/`);
  console.log(`   • Direct QR image: https://your-app.railway.app/qr`);
  console.log('');
  console.log('📋 Raw QR data (backup):');
  console.log(qr);
  console.log('='.repeat(60));
  
  try {
    fs.writeFileSync(path.resolve('/tmp','last-qr.txt'), qr);
    console.log('💾 QR data saved to /tmp/last-qr.txt');
  } catch(e) {
    console.warn('Could not save QR:', e.message);
  }
});

// Alternative: Even simpler block-based QR for Railway


    client.on('authenticated', async session => {
      console.log('✅ Authenticated! Session upserting to Supabase…');
      isConnected = true;
      lastQR = null; // Clear QR code after authentication
      
      try {
        await supabase
          .from('whatsapp_sessions')
          .upsert({ id:'default', data: session });
        console.log('💾 Session saved.');
      } catch (e) {
        console.error('❌ Error saving session:', e.message);
      }
    });

    client.on('ready', () => {
      console.log('🎉 WhatsApp is ready!');
      isConnected = true;
      lastQR = null; // Ensure QR is cleared
      // remove any lingering QR file
      try { fs.unlinkSync('/tmp/last-qr.txt'); } catch {}
    });

    client.on('auth_failure', e => {
      console.error('⚠️ Auth failure:', e);
      isConnected = false;
      // Don't auto-restart on auth failure, let user handle it
    });

    client.on('disconnected', reason => {
      console.warn('⚠️ Disconnected:', reason);
      isConnected = false;
      
      // Only restart for certain disconnect reasons
      if (reason !== 'LOGOUT') {
        setTimeout(() => {
          console.log('🔄 Reinitializing after disconnect…');
          client.initialize();
        }, 5000);
      }
    });

    client.on('error', err => {
      console.error('🐞 Client error:', err);
      // Only restart for non-fatal errors
      if (!err.message.includes('Protocol error') && !err.message.includes('Target closed')) {
        setTimeout(() => {
          console.log('🔄 Reinitializing after error…');
          client.initialize();
        }, 10000);
      }
    });

    // Handle process termination gracefully
    process.on('SIGTERM', async () => {
      console.log('🔄 Received SIGTERM, gracefully shutting down...');
      try {
        await client.destroy();
      } catch (e) {
        console.warn('Error during shutdown:', e.message);
      }
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      console.log('🔄 Received SIGINT, gracefully shutting down...');
      try {
        await client.destroy();
      } catch (e) {
        console.warn('Error during shutdown:', e.message);
      }
      process.exit(0);
    });

    console.log('🚀 Initializing client…');
    await client.initialize();

    // ---------- message handler ----------
    client.on("message", async (m) => {
      const id = m.from;
      const name = m._data?.notifyName || m._data?.pushName || "";
      const raw = (m.body || "").trim();
      const txt = norm(raw);
      const s = st(id);

      /* bookkeeping */
      await upsertUser(id, name);
      await refreshLangCache(id);

      /* greetings / reset */
      const greetRE = /^(hi|hello|hey|yo|good\s*(morning|afternoon|evening))/i;
      if (greetRE.test(raw) || txt === "menu" || txt === "back") {
        s.step = null;
        s.data = {};
        return safeSend(id, str(id, "menu"));
      }

      /* === active‑step flows === */

      /* PERIOD TRACKING */
      if (s.step === "askDate") {
        const mDate = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (!mDate) return safeSend(id, str(id, "invalidDate"));
        const last = new Date(+mDate[3], mDate[2] - 1, +mDate[1]);
        if (isNaN(last)) return safeSend(id, str(id, "notValidDate"));
        const next = addD(last, CYCLE);
        await UserUpdate.period(id, last.toISOString(), next.toISOString());
        s.step = "askRem";
        return safeSend(id, str(id, "askReminder", fmt(next)));
      }
      if (s.step === "askRem") {
        const wants = txt.startsWith("y") || txt.startsWith("e");
        await UserUpdate.reminder(id, wants);
        s.step = null;
        return safeSend(
          id,
          wants ? str(id, "reminderYes") : str(id, "reminderNo")
        );
      }

      /* SYMPTOM LOOP */
      if (s.step === "symLoop") {
        if (txt === "done") {
          const n = s.data.count || 0;
          s.step = null;
          return safeSend(
            id,
            n
              ? str(id, "symptomsDone", n, n > 1 ? "s" : "")
              : str(id, "symptomsNothingSaved")
          );
        }
        if (txt === "cancel") {
          s.step = null;
          return safeSend(id, str(id, "symptomsCancel"));
        }
        await Symptom.add(id, raw);
        s.data.count = (s.data.count || 0) + 1;
        return safeSend(id, str(id, "savedSymptom"));
      }

      /* EDUCATION */
      if (s.step === "edu") {
        /* unchanged */
      }

      /* LANGUAGE CHANGE */
      if (s.step === "lang") {
        const newLang =
          Object.keys(STRINGS).find((l) =>
            l.toLowerCase().startsWith(raw.toLowerCase())
          ) || raw;
        await UserUpdate.lang(id, newLang);
        await refreshLangCache(id);
        s.step = null;
        return safeSend(id, str(id, "languageSet", newLang));
      }

      /* FEEDBACK */
      if (s.step === "fb1" && ["1", "2"].includes(txt)) {
        s.data.response1 = txt;
        s.step = "fb2";
        return safeSend(id, str(id, "feedbackQ2"));
      }
      if (s.step === "fb2") {
        await Feedback.add(id, s.data.response1, raw.trim());
        s.step = null;
        return safeSend(id, str(id, "feedbackThanks"));
      }

      /* ORDER HANDLING */
      if (s.step === "order") {
        const qty = parseInt(txt, 10);
        if (isNaN(qty) || qty < 1 || qty > 99) {
          return safeSend(id, str(id, "orderQuantityInvalid"));
        }
        // In production, replace this with your actual sales team or vendor number
        const salesContact = "https://wa.me/1234567890";
        await safeSend(
          id,
          str(id, "orderConfirmation", qty, qty > 1 ? "s" : "", salesContact)
        );
        // Notify a vendor group (if you have one set up)
        try {
          const vendorGroup = process.env.VENDOR_GROUP_ID;
          if (vendorGroup) {
            await safeSend(
              vendorGroup,
              str(id, "orderVendorMessage", name, id, qty, qty > 1 ? "s" : "")
            );
          }
        } catch (e) {
          console.warn("Failed to notify vendor:", e.message);
        }
        s.step = null;
        return;
      }

      /* === Menu picks (idle) === */
      const pick = (t, w, n) =>
        t === w || t === String(n) || t === `${n}.` || t === `${n})`;

      if (s.step === null && pick(txt, "trackmyperiod", 1)) {
        s.step = "askDate";
        return safeSend(id, str(id, "trackPrompt"));
      }
      if (s.step === null && pick(txt, "logsymptoms", 2)) {
        s.step = "symLoop";
        s.data.count = 0;
        return safeSend(id, str(id, "symptomPrompt"));
      }
      if (s.step === null && pick(txt, "learnaboutsexualhealth", 3)) {
        s.step = "edu";
        return safeSend(id, str(id, "eduTopics"));
      }
      if (s.step === null && pick(txt, "ordervenillepads", 4)) {
        s.step = "order";
        return safeSend(id, str(id, "orderQuantityPrompt"));
      }
      if (s.step === null && pick(txt, "viewmycycle", 5)) {
        const u = await getUser(id);
        if (!u?.last_period) return safeSend(id, str(id, "noPeriod"));
        return safeSend(
          id,
          str(
            id,
            "cycleInfo",
            fmt(new Date(u.last_period)),
            fmt(new Date(u.next_period))
          )
        );
      }
      if (s.step === null && pick(txt, "viewmysymptoms", 6)) {
        const { data: rows } = await Symptom.list(id);
        if (!rows?.length) return safeSend(id, str(id, "noSymptoms"));
        const symptomsText = rows
          .slice(0, 5)
          .map((r) => `• ${r.symptom}  _(${fmt(new Date(r.logged_at))})_`)
          .join("\n");
        return safeSend(id, str(id, "symptomsHistory", symptomsText));
      }
      if (s.step === null && pick(txt, "changelanguage", 7)) {
        s.step = "lang";
        return safeSend(id, str(id, "langPrompt"));
      }
      if (s.step === null && pick(txt, "givefeedback", 8)) {
        s.step = "fb1";
        return safeSend(id, str(id, "feedbackQ1"));
      }

      /* fallback */
      safeSend(id, str(id, "fallback"));
    });

    /* ---------- periodic reminder ---------- */
    cron.schedule("0 9 * * *", async () => {
      const today = new Date();
      const { data: users } = await supabase
        .from("users")
        .select("jid,next_period,language")
        .is("wants_reminder", true)
        .not("next_period", "is", null);

      for (const u of users || []) {
        const diff = Math.floor((new Date(u.next_period) - today) / 86400000);
        if (diff === 3) {
          const lang = u.language || "English";
          const msg = format(
            STRINGS[lang]?.reminderYes ?? STRINGS.English.reminderYes,
            fmt(new Date(u.next_period))
          );
          await safeSend(u.jid, "🩸 " + msg);
        }
      }
      console.log("[Reminder task] done");
    });
  } catch (error) {
    console.error("❌ Fatal error:", error);
    process.exit(1); // Exit with error code to let the platform know there was an issue
  }
})();
