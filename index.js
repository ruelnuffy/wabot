require('dotenv').config();

const { Client, LocalAuth }  = require('whatsapp-web.js');
const SupaAuth               = require('./supa-auth');
const qrcode                 = require('qrcode-terminal');
const { createClient }       = require('@supabase/supabase-js');
const cron                   = require('node-cron');   

// ───────── Supabase (for your own tables, not auth) ─────────
if (!process.env.SUPA_URL || !process.env.SUPA_KEY) {
  throw new Error('Missing SUPA_URL or SUPA_KEY in environment');
}
const supabase = createClient(process.env.SUPA_URL, process.env.SUPA_KEY);

// ───────── WhatsApp client ─────────
const client = new Client({
  authStrategy: new SupaAuth(),  // <-- only this handles load/save of session.json
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => qrcode.generate(qr, { small: true }));
client.on('ready', () => console.log('✅ WhatsApp bot is ready'));
client.on('auth_failure', e => console.error('⚠️ Auth failure', e));
client.on('disconnected', () => console.log('⚠️ Disconnected, will re-authenticate'));

client.initialize();

// … the rest of your handlers …
 // last chance before exit

/* ---------- helpers (dates, strings, etc) ---------- */
const CYCLE = 28
const fmt   = d => d.toLocaleDateString('en-GB')
const addD  = (d, n) => { const c = new Date(d); c.setDate(c.getDate() + n); return c }
const norm  = s => (s || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
const mem   = {}   // chat‑state (id → { step, data })

function st(id) { return (mem[id] ??= { step: null, data: {} }) }
function format(str, ...a) { return str.replace(/{(\d+)}/g, (_, i) => a[i] ?? _) }

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

    fallback: 'Sorry, I didn\'t get that.\nType *menu* to see what I can do.',
    trackPrompt: '🩸 When did your last period start? (e.g. 12/05/2025)',
    langPrompt: 'Type your preferred language (e.g. English, Hausa…)',
    savedSymptom: 'Saved ✔︎ — send another, or type *done*.',
    askReminder: '✅ Saved! Your next period is likely around *{0}*.\nWould you like a reminder? (yes / no)',
    reminderYes: '🔔 Reminder noted! I\'ll message you a few days before.',
    reminderNo: '👍 No problem – ask me any time.',
    invalidDate: '🙈 Please type the date like *12/05/2025*',
    notValidDate: '🤔 That doesn\'t look like a valid date.',
    symptomsDone: '✅ {0} symptom{1} saved. Feel better soon ❤️',
    symptomsCancel: '🚫 Cancelled.',
    symptomsNothingSaved: 'Okay, nothing saved.',
    symptomPrompt: 'How are you feeling? Send one symptom at a time.\nWhen done, type *done* (or *cancel*).',
    eduTopics: `What topic?

1️⃣  STIs  
2️⃣  Contraceptives  
3️⃣  Consent  
4️⃣  Hygiene during menstruation  
5️⃣  Myths and Facts`,
    languageSet: '🔤 Language set to *{0}*.',
    noPeriod: 'No period date recorded yet.',
    cycleInfo: `📅 *Your cycle info:*  
• Last period: *{0}*  
• Predicted next: *{1}*`,
    noSymptoms: 'No symptoms logged yet.',
    symptomsHistory: '*Your symptom history (last 5):*\n{0}',
    feedbackQ1: 'Did you have access to sanitary pads this month?\n1. Yes   2. No',
    feedbackQ2: 'Thanks. What challenges did you face? (or type "skip")',
    feedbackThanks: '❤️  Feedback noted — thank you!',
    orderQuantityPrompt: 'How many packs of *Venille Pads* would you like to order?',
    orderQuantityInvalid: 'Please enter a *number* between 1 and 99, e.g. 3',
    orderConfirmation: `✅ Your order for *{0} pack{1}* has been forwarded.

Tap the link below to chat directly with our sales team and confirm delivery:
{2}

Thank you for choosing Venille!`,
    orderVendorMessage: `🆕 *Venille Pads order*

From : {0}
JID  : {1}
Qty  : {2} pack{3}

(Please contact the customer to arrange delivery.)`
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

    fallback: 'Yi hakuri, ban gane ba.\nRubuta *menu* don ganin abin da zan iya yi.',
    trackPrompt: '🩸 Yaushe ne lokacin farkon jinin haila na ƙarshe? (e.g. 12/05/2025)',
    langPrompt: 'Rubuta harshen da kake so (misali: English, Hausa…)',
    savedSymptom: 'An ajiye ✔︎ — aika wani ko rubuta *done*.',
    askReminder: '✅ An ajiye! Ana sa ran haila na gaba ne kusa da *{0}*.\nKana son aiko maka da tunatarwa? (ee / a\'a)',
    reminderYes: '🔔 Tunatarwa ta samu! Zan aiko maka saƙo \'yan kwanakin kafin.',
    reminderNo: '👍 Babu damuwa - tambayi ni a kowane lokaci.',
    invalidDate: '🙈 Da fatan za a rubuta kwanan wata kamar *12/05/2025*',
    notValidDate: '🤔 Wannan bai yi kama da kwanan wata mai kyau ba.',
    symptomsDone: '✅ An ajiye alama {0}{1}. Da fatan kawo maki sauki ❤️',
    symptomsCancel: '🚫 An soke.',
    symptomsNothingSaved: 'To, ba a adana komai ba.',
    symptomPrompt: 'Yaya jikin ki? Aika alama guda ɗaya a kowane lokaci.\nIn an gama, rubuta *done* (ko *cancel*).',
    eduTopics: `Wane batun?

1️⃣  Cutar STIs  
2️⃣  Hanyoyin Dakile Haihuwa  
3️⃣  Yarda  
4️⃣  Tsabta yayin jinin haila  
5️⃣  Karin Magana da Gaskiya`,
    languageSet: '🔤 An saita harshe zuwa *{0}*.',
    noPeriod: 'Ba a yi rijistar kwanan haila ba har yanzu.',
    cycleInfo: `📅 *Bayanin zagayen haila:*  
• Haila na ƙarshe: *{0}*  
• Ana hasashen na gaba: *{1}*`,
    noSymptoms: 'Ba a rubuta alamun rashin lafiya ba har yanzu.',
    symptomsHistory: '*Tarihin alamun rashin lafiyarki (na ƙarshe 5):*\n{0}',
    feedbackQ1: 'Shin kun samu damar samun sanitary pads a wannan watan?\n1. Ee   2. A\'a',
    feedbackQ2: 'Na gode. Wane irin kalubale kuka fuskanta? (ko rubuta "skip")',
    feedbackThanks: '❤️  An lura da ra\'ayin ku - na gode!',
    orderQuantityPrompt: 'Kwunnan *Venille Pads* nawa kuke son siyan?',
    orderQuantityInvalid: 'Da fatan a shigar da *lambar* tsakanin 1 da 99, misali 3',
    orderConfirmation: `✅ An aika odar ku ta *kwunan {0}{1}*.

Danna wannan hanyar don tattaunawa kai tsaye da ma\'aikatan sayarwarmu don tabbatar da isar:
{2}

Mun gode da zaɓen Venille!`,
    orderVendorMessage: `🆕 *Odar Venille Pads*

Daga : {0}
JID  : {1}
Adadi: {2} kwunan{3}

(Da fatan a tuntuɓi masoyi don shirya isar da shi.)`
  }
  // Add more languages here as needed
};
function str(jid, key, ...a) {
  const lang  = getUserLangCache(jid);
  const bloc  = STRINGS[lang] || STRINGS.English || {};
  const tmpl  = bloc[key]   // try user’s language
             || STRINGS.English?.[key]  // then English
             || '';                     // finally empty string
  return format(tmpl, ...a);
}


// ---------- Supabase data helpers (all async) ----------
async function getUser(jid) {
  const { data } = await supabase.from('users').select('*').eq('jid', jid).single()
  return data
}
async function upsertUser(jid, wa_name) {
  const now = new Date().toISOString()
  const row = await getUser(jid)
  if (row) {
    await supabase.from('users').update({ wa_name, last_seen: now }).eq('jid', jid)
  } else {
    await supabase.from('users').insert([{ jid, wa_name, first_seen: now, last_seen: now }])
  }
}
const UserUpdate = {
  lang      : (jid, language)        => supabase.from('users').update({ language        }).eq('jid', jid),
  period    : (jid, last, next)      => supabase.from('users').update({ last_period: last, next_period: next }).eq('jid', jid),
  reminder  : (jid, wants)           => supabase.from('users').update({ wants_reminder: wants }).eq('jid', jid)
}
const Symptom   = {
  add   : (jid, sym)      => supabase.from('symptoms').insert([{ jid, symptom: sym }]),
  list  : jid             => supabase.from('symptoms').select('symptom,logged_at').eq('jid', jid).order('logged_at', { ascending: false })
}
const Feedback  = {
  add   : (jid, r1, r2)   => supabase.from('feedback').insert([{ jid, response1: r1, response2: r2 }])
}

// ---------- language helpers ----------
function getUserLangCache(jid) {
  return (mem[jid]?.langCache) || 'English'
}
async function refreshLangCache(jid) {
  const u = await getUser(jid)
  mem[jid] = mem[jid] || {}
  mem[jid].langCache = u?.language || 'English'
}
function str(jid, key, ...a) {
  const lang = getUserLangCache(jid)
  const bloc = STRINGS[lang] || STRINGS.English
  return format(bloc[key] ?? STRINGS.English[key], ...a)
}


client.on('qr', qr => qrcode.generate(qr, { small: true }))
client.on('ready', () => console.log('🤖 Venille bot is ready!'))
process.on('unhandledRejection', e => console.error('[unhandled]', e))

async function safeSend(id, text) {
  try { await client.sendMessage(id, text) }
  catch (e) { console.warn('[send fail]', e.message) }
}

// ---------- message handler ----------
client.on('message', async m => {
  const id   = m.from
  const name = m._data?.notifyName || m._data?.pushName || ''
  const raw  = (m.body || '').trim()
  const txt  = norm(raw)
  const s    = st(id)

  /* bookkeeping */
  await upsertUser(id, name)
  await refreshLangCache(id)

  /* greetings / reset */
  const greetRE = /^(hi|hello|hey|yo|good\s*(morning|afternoon|evening))/i
  if (greetRE.test(raw) || txt === 'menu' || txt === 'back') {
    s.step = null; s.data = {}
    return safeSend(id, str(id, 'menu'))
  }

  /* === active‑step flows === */

  /* PERIOD TRACKING */
  if (s.step === 'askDate') {
    const mDate = raw.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
    if (!mDate) return safeSend(id, str(id, 'invalidDate'))
    const last = new Date(+mDate[3], mDate[2] - 1, +mDate[1])
    if (isNaN(last)) return safeSend(id, str(id, 'notValidDate'))
    const next = addD(last, CYCLE)
    await UserUpdate.period(id, last.toISOString(), next.toISOString())
    s.step = 'askRem'
    return safeSend(id, str(id, 'askReminder', fmt(next)))
  }
  if (s.step === 'askRem') {
    const wants = txt.startsWith('y') || txt.startsWith('e')
    await UserUpdate.reminder(id, wants)
    s.step = null
    return safeSend(id, wants ? str(id, 'reminderYes') : str(id, 'reminderNo'))
  }

  /* SYMPTOM LOOP */
  if (s.step === 'symLoop') {
    if (txt === 'done') {
      const n = s.data.count || 0
      s.step = null
      return safeSend(id, n ? str(id, 'symptomsDone', n, n > 1 ? 's' : '') : str(id, 'symptomsNothingSaved'))
    }
    if (txt === 'cancel') { s.step = null; return safeSend(id, str(id, 'symptomsCancel')) }
    await Symptom.add(id, raw)
    s.data.count = (s.data.count || 0) + 1
    return safeSend(id, str(id, 'savedSymptom'))
  }

  /* EDUCATION */
  if (s.step === 'edu') { /* unchanged */ }

  /* LANGUAGE CHANGE */
  if (s.step === 'lang') {
    const newLang = Object.keys(STRINGS).find(l => l.toLowerCase().startsWith(raw.toLowerCase())) || raw
    await UserUpdate.lang(id, newLang)
    await refreshLangCache(id)
    s.step = null
    return safeSend(id, str(id, 'languageSet', newLang))
  }

  /* FEEDBACK */
  if (s.step === 'fb1' && ['1', '2'].includes(txt)) {
    s.data.response1 = txt
    s.step = 'fb2'
    return safeSend(id, str(id, 'feedbackQ2'))
  }
  if (s.step === 'fb2') {
    await Feedback.add(id, s.data.response1, raw.trim())
    s.step = null
    return safeSend(id, str(id, 'feedbackThanks'))
  }

  /* === Menu picks (idle) === */
  const pick = (t, w, n) => t === w || t === String(n) || t === `${n}.` || t === `${n})`

  if (s.step === null && pick(txt, 'trackmyperiod', 1)) {
    s.step = 'askDate'
    return safeSend(id, str(id, 'trackPrompt'))
  }
  if (s.step === null && pick(txt, 'logsymptoms', 2)) {
    s.step = 'symLoop'; s.data.count = 0
    return safeSend(id, str(id, 'symptomPrompt'))
  }
  if (s.step === null && pick(txt, 'learnaboutsexualhealth', 3)) {
    s.step = 'edu'
    return safeSend(id, str(id, 'eduTopics'))
  }
  if (s.step === null && pick(txt, 'viewmycycle', 5)) {
    const u = await getUser(id)
    if (!u?.last_period) return safeSend(id, str(id, 'noPeriod'))
    return safeSend(id, str(id, 'cycleInfo', fmt(new Date(u.last_period)), fmt(new Date(u.next_period))))
  }
  if (s.step === null && pick(txt, 'viewmysymptoms', 6)) {
    const { data: rows } = await Symptom.list(id)
    if (!rows?.length) return safeSend(id, str(id, 'noSymptoms'))
    const symptomsText = rows.slice(0, 5).map(r => `• ${r.symptom}  _(${fmt(new Date(r.logged_at))})_`).join('\n')
    return safeSend(id, str(id, 'symptomsHistory', symptomsText))
  }
  if (s.step === null && pick(txt, 'changelanguage', 7)) {
    s.step = 'lang'
    return safeSend(id, str(id, 'langPrompt'))
  }
  if (s.step === null && pick(txt, 'givefeedback', 8)) {
    s.step = 'fb1'
    return safeSend(id, str(id, 'feedbackQ1'))
  }

  /* fallback */
  safeSend(id, str(id, 'fallback'))
})

/* ---------- periodic reminder ---------- */
cron.schedule('0 9 * * *', async () => {
  const today = new Date()
  const { data: users } = await supabase
    .from('users')
    .select('jid,next_period,language')
    .is('wants_reminder', true)
    .not('next_period', 'is', null)

  for (const u of users || []) {
    const diff = Math.floor((new Date(u.next_period) - today) / 86400000)
    if (diff === 3) {
      const lang = u.language || 'English'
      const msg  = format((STRINGS[lang]?.reminderYes ?? STRINGS.English.reminderYes), fmt(new Date(u.next_period)))
      await safeSend(u.jid, '🩸 ' + msg)
    }
  }
  console.log('[Reminder task] done')
})


