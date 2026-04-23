const { Sequelize, DataTypes } = require("sequelize");

const sequelize = new Sequelize("postgres://postgres:Karthik@localhost:5432/pms", {
  dialect: 'postgres',
  logging: false,
});

const Parking = sequelize.define('Parking', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: DataTypes.STRING,
  totalSlots: DataTypes.INTEGER,
  pricePerHour: DataTypes.FLOAT,
  latitude: DataTypes.FLOAT,
  longitude: DataTypes.FLOAT,
  address: DataTypes.STRING,
  openingTime: DataTypes.STRING,
  closingTime: DataTypes.STRING,
  isOpen: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, { timestamps: false });

async function seed() {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    // Check if data already exists
    const count = await Parking.count();
    if(count === 0) {
        await Parking.bulkCreate([
            {
                name: "Uppal Parking",
                totalSlots: 22,
                pricePerHour: 15,
                latitude: 17.3982,
                longitude: 78.5583,
                address: "Uppal, Hyderabad",
                openingTime: "06:00",
                closingTime: "22:00"
            },
            {
                name: "LB Nagar Parking",
                totalSlots: 28,
                pricePerHour: 15,
                latitude: 17.3457,
                longitude: 78.5522,
                address: "LB Nagar, Hyderabad",
                openingTime: "06:00",
                closingTime: "23:00"
            }
        ]);
        console.log("Database seeded successfully!");
    } else {
        console.log("Database already has data.");
    }
    
  } catch(err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}

seed();
