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
      userName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      userEmail: {
        type: DataTypes.STRING,
        allowNull: false
      },
      phone: {
        type: DataTypes.STRING,
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
      parkingName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      hours: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      pricePerHour: {
        type: DataTypes.FLOAT,
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
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "CONFIRMED"
      }
    },
    {
      tableName: "bookings",
      timestamps: true
    }
  );
