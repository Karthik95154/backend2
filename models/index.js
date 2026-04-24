const sequelize = require("../config/database");
const createUserModel = require("./User");
const createParkingBusinessModel = require("./ParkingBusiness");
const createBookingModel = require("./Booking");

const User = createUserModel(sequelize);
const ParkingBusiness = createParkingBusinessModel(sequelize);
const Booking = createBookingModel(sequelize);

module.exports = {
  sequelize,
  User,
  ParkingBusiness,
  Booking
};
