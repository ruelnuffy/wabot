const { LocalAuth } = require('whatsapp-web.js');
const { createClient } = require('@supabase/supabase-js');

// Custom auth strategy that uses Supabase for storing session data
class SupaAuth extends LocalAuth {
  constructor(options = {}) {
    super({ dataPath: null }); // prevent local storage completely
    this.supabase = createClient(process.env.SUPA_URL, process.env.SUPA_KEY);
    this.tableName = options.tableName || 'whatsapp_sessions';
  }

  async beforeBrowserInitialized() {
    // Skip any local file setup
    return Promise.resolve();
  }

  async getAuthData() {
    const { data, error } = await this.supabase
      .from(this.tableName)
      .select('session_data')
      .eq('id', 'default')
      .single();

    if (error) {
      console.error('Error fetching auth data from Supabase:', error);
      return null;
    }
    return data?.session_data || null;
  }

  async saveAuthData(authData) {
    const { error } = await this.supabase
      .from(this.tableName)
      .upsert({
        id: 'default',
        session_data: authData,
        updated_at: new Date().toISOString(),
      });
    if (error) console.error('Error saving auth data:', error);
  }

  async removeAuthData() {
    const { error } = await this.supabase
      .from(this.tableName)
      .delete()
      .eq('id', 'default');
    if (error) console.error('Error removing auth data:', error);
  }
}

module.exports = SupaAuth;
