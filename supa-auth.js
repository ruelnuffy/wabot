// supa-auth.js
require('dotenv').config();
const { LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPA_URL || !process.env.SUPA_KEY) {
  throw new Error('Missing SUPA_URL or SUPA_KEY in environment');
}

// initialize Supabase client
const supabase = createClient(process.env.SUPA_URL, process.env.SUPA_KEY);

// your bucket + object names
const BUCKET = 'whatsapp-sessions';
const OBJ    = 'session.json';

async function readSession() {
  const { data, error } = await supabase
    .storage
    .from(BUCKET)
    .download(OBJ);
  if (error) {
    // no session yet
    return null;
  }
  return JSON.parse(await data.text());
}

async function writeSession(session) {
  await supabase
    .storage
    .from(BUCKET)
    .upload(OBJ,
      Buffer.from(JSON.stringify(session)),
      { upsert: true, contentType: 'application/json' }
    );
}

class SupaAuth extends LocalAuth {
  async saveAuthInfo(data) {
    await writeSession(data);
  }
  async loadAuthInfo() {
    return await readSession();
  }
}

module.exports = SupaAuth;
