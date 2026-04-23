const { Client } = require('pg');
const client = new Client('postgres://postgres:Karthik@localhost:5432/pms');
client.connect()
  .then(() => client.query('SELECT * FROM "Parkings"'))
  .then(res => { console.log("Parkings:\n", res.rows); return client.query('SELECT * FROM business_profile'); })
  .then(res => { console.log("business_profile:\n", res.rows); client.end(); })
  .catch(err => { console.log("Could not find Parkings table or other error:"); console.error(err); client.end(); });
