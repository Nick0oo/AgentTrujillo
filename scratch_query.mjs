import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const query = `
    SELECT column_name, column_default, is_nullable, data_type
    FROM information_schema.columns 
    WHERE table_name = 'development_observations';
  `;

  const res = await fetch('https://api.supabase.com/v1/projects/yapjiinrjsrothzgzxsv/database/query', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query })
  });
  console.log(await res.json());
}
run();
