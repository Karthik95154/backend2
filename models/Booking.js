const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "Booking",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      vehicleNumber: {
        type: DataTypes.STRING,
        allowNull: false
      },
      parkingId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      slotNumber: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      totalAmount: {
        type: DataTypes.FLOAT,
        allowNull: false
      },
      startTime: {
        type: DataTypes.DATE,
        allowNull: false
      },
      endTime: {
        type: DataTypes.DATE,
        allowNull: false
      },
      paymentStatus: {
        type: DataTypes.ENUM("Pending", "Paid", "Failed"),
        allowNull: false,
        defaultValue: "Pending"
      },
      bookingStatus: {
        type: DataTypes.ENUM("Confirmed", "Checked-In", "Completed", "Cancelled"),
        allowNull: false,
        defaultValue: "Confirmed"
      },
      razorpay_order_id: {
        type: DataTypes.STRING,
        allowNull: true
      },
      razorpay_payment_id: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      tableName: "bookings",
      timestamps: true
    }
  );
