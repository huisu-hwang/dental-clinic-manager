const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.beahjntkmkfhpcbhfnrr:tNjSUoCUJcX3nPXg@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres'
});

async function run() {
  await client.connect();
  const res = await client.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'gift_logs'::regclass;
  `);
  console.log(res.rows);
  
  // get column types
  const colRes = await client.query(`
    SELECT column_name, data_type, character_maximum_length 
    FROM information_schema.columns 
    WHERE table_name = 'gift_logs';
  `);
  console.log(colRes.rows);
  
  await client.end();
}
run();
