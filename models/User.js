const { DataTypes } = require("sequelize");

module.exports = (sequelize) =>
  sequelize.define(
    "User",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      name: {
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
      resetCode: {
        type: DataTypes.STRING,
        allowNull: true
      },
      resetExpiry: {
        type: DataTypes.DATE,
        allowNull: true
      },
      vehicles: {
        type: DataTypes.JSON,
        defaultValue: [],
        allowNull: false
      }
    },
    {
      tableName: "users",
      timestamps: true
    }
  );
