const sequelize = require("../config/database");
const createUserModel = require("./User");
const createParkingBusinessModel = require("./ParkingBusiness");
const createBookingModel = require("./Booking");
const createNotificationModel = require("./Notification");

const User = createUserModel(sequelize);
const ParkingBusiness = createParkingBusinessModel(sequelize);
const Booking = createBookingModel(sequelize);
const Notification = createNotificationModel(sequelize);

User.hasMany(Booking, {
  foreignKey: "userId",
  as: "bookings",
  onDelete: "CASCADE"
});
Booking.belongsTo(User, {
  foreignKey: "userId",
  as: "user"
});

User.hasMany(Notification, {
  foreignKey: "userId",
  as: "notifications",
  onDelete: "CASCADE"
});
Notification.belongsTo(User, {
  foreignKey: "userId",
  as: "user"
});

ParkingBusiness.hasMany(Booking, {
  foreignKey: "parkingId",
  as: "bookings",
  onDelete: "CASCADE"
});
Booking.belongsTo(ParkingBusiness, {
  foreignKey: "parkingId",
  as: "parking"
});

module.exports = {
  sequelize,
  User,
  ParkingBusiness,
  Booking,
  Notification
};
