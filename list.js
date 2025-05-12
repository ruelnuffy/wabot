// list.js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPA_URL, process.env.SUPA_KEY);

(async () => {
  // list everything in the waSession bucket
  const { data: objects, error } = await supabase
    .storage
    .from('waSession')
    .list();           

  if (error) throw error;
  console.log('Stored objects:', objects);
})();
