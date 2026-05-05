const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "ParkingBusiness",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      businessName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      ownerName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: false
      },
      password: {
        type: DataTypes.STRING,
        allowNull: false
      },
      latitude: {
        type: DataTypes.FLOAT,
        allowNull: false
      },
      longitude: {
        type: DataTypes.FLOAT,
        allowNull: false
      },
      address: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      totalSlots: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      pricePerHour: {
        type: DataTypes.FLOAT,
        allowNull: false
      },
      openingTime: {
        type: DataTypes.STRING,
        allowNull: false
      },
      closingTime: {
        type: DataTypes.STRING,
        allowNull: false
      },
      resetCode: {
        type: DataTypes.STRING,
        allowNull: true
      },
      resetExpiry: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: "parking_businesses",
      timestamps: true
    }
  );
