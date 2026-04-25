const { ParkingBusiness } = require("../models");
const sequelize = require("../config/database");

async function dump() {
  try {
    await sequelize.authenticate();
    const parkings = await ParkingBusiness.findAll();
    console.log(JSON.stringify(parkings, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await sequelize.close();
  }
}

dump();
