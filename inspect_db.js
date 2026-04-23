const { Client } = require('pg');

async function inspect() {
  const uri = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/pms';
  const client = new Client({ connectionString: uri });

  try {
    await client.connect();
    console.log('Connected successfully to', uri);
    
    // Get all tables
    const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = res.rows.map(r => r.table_name);
    console.log('Tables:', tables);

    // Get columns for each table
    for (const table of tables) {
      const colRes = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = $1
      `, [table]);
      console.log(`\nTable ${table}:`);
      colRes.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));
    }
  } catch (err) {
    console.error('Error connecting to', uri, err.message);
    
    // Try without password
    if (err.message.includes('password authentication failed')) {
        console.log("Trying without password or with empty password...");
        try {
            const client2 = new Client({ connectionString: 'postgres://postgres@localhost:5432/pms' });
            await client2.connect();
            // Get all tables
            const res = await client2.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
            `);
            const tables = res.rows.map(r => r.table_name);
            console.log('Tables:', tables);

            // Get columns for each table
            for (const table of tables) {
            const colRes = await client2.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1
            `, [table]);
            console.log(`\nTable ${table}:`);
            colRes.rows.forEach(c => console.log(`  - ${c.column_name}: ${c.data_type}`));
            }
            client2.end();
        } catch (e) {
            console.error('Also failed:', e.message);
        }
    }
  } finally {
    client.end();
  }
}

inspect();
