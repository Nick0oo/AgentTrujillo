import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const query = `
    SELECT id, created_at, owner_user_id, care_space_id, child_id, status, channel
    FROM public.agent_sessions
    ORDER BY created_at DESC
    LIMIT 5;
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
