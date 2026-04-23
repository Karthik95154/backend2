const { Client } = require('pg');
const client = new Client('postgres://postgres:Karthik@localhost:5432/pms');
client.connect().then(async () => {
    try {
        const existP = await client.query('SELECT id FROM "Parkings" LIMIT 1');
        await client.query(
          `UPDATE "Parkings" SET name=$1, "totalSlots"=$2, "pricePerHour"=$3, latitude=$4, longitude=$5, address=$6, "openingTime"=$7, "closingTime"=$8 WHERE id=$9`, 
          ['karthik', 40, 40, 17.40089683544021, 78.56077909382293, 'uppla', '06:00', '23:00', existP.rows[0].id]
        );
        console.log("Success!");
    } catch(e) {
        console.error("Error:", e.message);
    } finally {
        client.end();
    }
});
