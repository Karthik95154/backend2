require("dotenv").config();
const express = require("express");
const { Sequelize, DataTypes, Op } = require("sequelize");
const cors = require("cors");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cron = require("node-cron");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

/* ================= HEALTH & ROOT ================= */
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/health", (req, res) => res.json({ status: "ok" }));

/* ================= DB CONNECTION ================= */
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  }
});

sequelize.authenticate()
  .then(() => console.log("PostgreSQL connected successfully ✅"))
  .catch((err) => console.error("PostgreSQL Connection Error ❌:", err));

/* ================= RAZORPAY CONFIG ================= */
const RAZORPAY_KEY = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const ALLOW_MOCK_PAYMENTS = process.env.ALLOW_MOCK_PAYMENTS === "true";
const IS_RAZORPAY_CONFIGURED = Boolean(RAZORPAY_KEY && RAZORPAY_SECRET);

const razorpay = IS_RAZORPAY_CONFIGURED
  ? new Razorpay({ key_id: RAZORPAY_KEY, key_secret: RAZORPAY_SECRET })
  : null;

/* ================= MODELS ================= */
const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING, unique: true, allowNull: false },
  phone: DataTypes.STRING,
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.ENUM('USER', 'PMS'), defaultValue: 'USER' }
}, { tableName: 'users', underscored: true, timestamps: true });

const Vehicle = sequelize.define('Vehicle', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  vehicle_number: { type: DataTypes.STRING, allowNull: false },
  vehicle_type: { type: DataTypes.STRING, defaultValue: 'Car' },
  is_primary: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'vehicles', underscored: true, timestamps: true });

const Parking = sequelize.define('Parking', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  address: DataTypes.STRING,
  latitude: DataTypes.FLOAT,
  longitude: DataTypes.FLOAT,
  base_price_per_hour: DataTypes.FLOAT,
  total_slots: { type: DataTypes.INTEGER, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'parkings', underscored: true, timestamps: true });

const Zone = sequelize.define('Zone', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING, allowNull: false },
  description: DataTypes.STRING,
  price_per_hour: DataTypes.FLOAT,
  capacity: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'zones', underscored: true, timestamps: true });

const Slot = sequelize.define('Slot', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  slot_number: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.ENUM('FREE', 'OCCUPIED', 'RESERVED'), defaultValue: 'FREE' }
}, { tableName: 'slots', underscored: true, timestamps: true });

const Booking = sequelize.define('Booking', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  start_time: { type: DataTypes.DATE, allowNull: false },
  end_time: { type: DataTypes.DATE, allowNull: false },
  status: { type: DataTypes.ENUM('PENDING', 'CONFIRMED', 'CHECKED-IN', 'COMPLETED', 'CANCELLED', 'NOSHOW'), defaultValue: 'PENDING' },
  amount: DataTypes.FLOAT,
  ticket_qr: DataTypes.TEXT,
  sms_sent: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'bookings', underscored: true, timestamps: true });

const Payment = sequelize.define('Payment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  razorpay_order_id: DataTypes.STRING,
  razorpay_payment_id: DataTypes.STRING,
  amount: DataTypes.FLOAT,
  currency: { type: DataTypes.STRING, defaultValue: 'INR' },
  status: { type: DataTypes.ENUM('SUCCESS', 'FAILED', 'PENDING'), defaultValue: 'PENDING' },
  payment_time: DataTypes.DATE
}, { tableName: 'payments', underscored: true, timestamps: true });

// Relationships
User.hasMany(Vehicle, { foreignKey: 'user_id' });
Vehicle.belongsTo(User, { foreignKey: 'user_id' });

User.hasMany(Parking, { foreignKey: 'created_by' }); // PMS Owner
Parking.belongsTo(User, { foreignKey: 'created_by' });

Parking.hasMany(Zone, { foreignKey: 'parking_id' });
Zone.belongsTo(Parking, { foreignKey: 'parking_id' });

Parking.hasMany(Slot, { foreignKey: 'parking_id' });
Slot.belongsTo(Parking, { foreignKey: 'parking_id' });
Zone.hasMany(Slot, { foreignKey: 'zone_id' });
Slot.belongsTo(Zone, { foreignKey: 'zone_id' });

User.hasMany(Booking, { foreignKey: 'user_id' });
Booking.belongsTo(User, { foreignKey: 'user_id' });

Parking.hasMany(Booking, { foreignKey: 'parking_id' });
Booking.belongsTo(Parking, { foreignKey: 'parking_id' });

Vehicle.hasMany(Booking, { foreignKey: 'vehicle_id' });
Booking.belongsTo(Vehicle, { foreignKey: 'vehicle_id' });

Slot.hasMany(Booking, { foreignKey: 'slot_id' });
Booking.belongsTo(Slot, { foreignKey: 'slot_id' });

Booking.hasMany(Payment, { foreignKey: 'booking_id' });
Payment.belongsTo(Booking, { foreignKey: 'booking_id' });

// Sync DB
sequelize.sync({ alter: true }).then(() => console.log('DB synced with new Architecture')).catch(console.error);


/* ================= MIDDLEWARE ================= */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Access Token Required" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid Token" });
    req.user = user;
    next();
  });
};

const requirePMS = (req, res, next) => {
  if (req.user.role !== 'PMS') return res.status(403).json({ message: "Requires PMS Admin Access" });
  next();
};

/* ================= AUTH SERVICE ================= */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const userRole = role === 'PMS' ? 'PMS' : 'USER';
    const user = await User.create({ name, email, phone, password: hashedPassword, role: userRole });
    res.json({ message: "Registration successful", user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(400).json({ message: "User not found" });

    const validPass = await bcrypt.compare(password, user.password);
    if (!validPass) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ message: "Login successful", token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= SEARCH & USER SERVICE ================= */
// Haversine formula directly in SQL
app.get("/api/search/nearby", async (req, res) => {
  try {
    const { lat, lng, radius = 10 } = req.query; // radius in km
    if (!lat || !lng) return res.status(400).json({ message: "Latitude and Longitude required" });

    const parkings = await sequelize.query(`
      SELECT id, name, address, latitude, longitude, base_price_per_hour, total_slots,
      ( 6371 * acos( cos( radians(:lat) ) * cos( radians( latitude ) ) 
      * cos( radians( longitude ) - radians(:lng) ) + sin( radians(:lat) ) 
      * sin( radians( latitude ) ) ) ) AS distance 
      FROM parkings 
      WHERE is_active = true
      HAVING ( 6371 * acos( cos( radians(:lat) ) * cos( radians( latitude ) ) 
      * cos( radians( longitude ) - radians(:lng) ) + sin( radians(:lat) ) 
      * sin( radians( latitude ) ) ) ) < :radius
      ORDER BY distance;
    `, {
      replacements: { lat: parseFloat(lat), lng: parseFloat(lng), radius: parseFloat(radius) },
      type: sequelize.QueryTypes.SELECT
    });

    res.json(parkings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/vehicles", authenticateToken, async (req, res) => {
  try {
    const { vehicle_number, vehicle_type } = req.body;
    const vehicle = await Vehicle.create({ user_id: req.user.id, vehicle_number, vehicle_type });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/vehicles", authenticateToken, async (req, res) => {
  try {
    const vehicles = await Vehicle.findAll({ where: { user_id: req.user.id } });
    res.json(vehicles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ================= PARKING SERVICE (PMS) ================= */
app.post("/api/pms/parkings", authenticateToken, requirePMS, async (req, res) => {
  try {
    const { name, address, latitude, longitude, base_price_per_hour, total_slots } = req.body;
    const parking = await Parking.create({
      name, address, latitude, longitude, base_price_per_hour, total_slots,
      created_by: req.user.id
    });
    res.json(parking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pms/zones", authenticateToken, requirePMS, async (req, res) => {
  try {
    const { parking_id, name, description, price_per_hour, capacity } = req.body;
    // Verify owner
    const parking = await Parking.findOne({ where: { id: parking_id, created_by: req.user.id } });
    if (!parking) return res.status(403).json({ message: "Not authorized for this parking lot" });

    const zone = await Zone.create({ parking_id, name, description, price_per_hour, capacity });
    res.json(zone);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Auto slot generation based on zone capacity
app.post("/api/pms/slots/generate", authenticateToken, requirePMS, async (req, res) => {
  try {
    const { zone_id } = req.body;
    const zone = await Zone.findByPk(zone_id, { include: [Parking] });
    if (!zone || zone.Parking.created_by !== req.user.id) return res.status(403).json({ message: "Unauthorized" });

    const existingSlots = await Slot.count({ where: { zone_id } });
    const slotsToCreate = zone.capacity - existingSlots;

    if (slotsToCreate <= 0) return res.status(400).json({ message: "Capacity already reached" });

    const newSlots = [];
    for (let i = 1; i <= slotsToCreate; i++) {
      newSlots.push({
        parking_id: zone.parking_id,
        zone_id: zone.id,
        slot_number: `${zone.name}-${existingSlots + i}`,
        status: 'FREE'
      });
    }

    await Slot.bulkCreate(newSlots);
    res.json({ message: `${slotsToCreate} slots generated successfully` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual Slot Assignment by Owner
app.post("/api/pms/slots/manual-assign", authenticateToken, requirePMS, async (req, res) => {
  try {
    const { booking_id, slot_id } = req.body;
    const booking = await Booking.findByPk(booking_id, { include: [{ model: Parking, as: 'Parking' }] });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.Parking.created_by !== req.user.id) return res.status(403).json({ message: "Unauthorized" });

    const slot = await Slot.findByPk(slot_id);
    if (!slot || slot.parking_id !== booking.parking_id) return res.status(400).json({ message: "Invalid slot" });
    if (slot.status !== 'FREE') return res.status(400).json({ message: "Slot is not free" });

    // Assign
    booking.slot_id = slot.id;
    booking.sms_sent = true; 
    await booking.save();

    slot.status = 'RESERVED';
    slot.booking_id = booking.id;
    await slot.save();

    console.log(`[SMS MOCK] Sent to User: Your slot is ${slot.slot_number} at ${booking.Parking.name}`);

    res.json({ message: "Slot assigned manually and SMS sent", booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ================= BOOKING SERVICE ================= */
app.post("/api/bookings", authenticateToken, async (req, res) => {
  try {
    const { parking_id, vehicle_id, start_time, end_time } = req.body;
    const parking = await Parking.findByPk(parking_id);
    if (!parking) return res.status(404).json({ message: "Parking not found" });

    const sTime = new Date(start_time);
    const eTime = new Date(end_time);
    const hours = Math.ceil((eTime - sTime) / (1000 * 60 * 60));
    if (hours <= 0) return res.status(400).json({ message: "Invalid time range" });

    const amount = hours * parking.base_price_per_hour;

    const booking = await Booking.create({
      user_id: req.user.id,
      parking_id,
      vehicle_id,
      start_time: sTime,
      end_time: eTime,
      amount,
      status: 'PENDING'
    });

    res.json(booking);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bookings/my", authenticateToken, async (req, res) => {
  try {
    const bookings = await Booking.findAll({ where: { user_id: req.user.id }, include: [Parking, Vehicle, Slot] });
    res.json(bookings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/bookings/:id/check-in", authenticateToken, async (req, res) => {
  try {
    const booking = await Booking.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status !== 'CONFIRMED') return res.status(400).json({ message: "Booking not confirmed" });
    if (!booking.slot_id) return res.status(400).json({ message: "Slot not assigned yet" });

    booking.status = 'CHECKED-IN';
    await booking.save();

    await Slot.update({ status: 'OCCUPIED' }, { where: { id: booking.slot_id } });

    res.json({ message: "Checked in successfully", booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ================= PAYMENT SERVICE ================= */
app.post("/api/payments/create-order", authenticateToken, async (req, res) => {
  try {
    const { booking_id } = req.body;
    const booking = await Booking.findByPk(booking_id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    const amountInPaise = Math.round(booking.amount * 100);

    let order;
    if (IS_RAZORPAY_CONFIGURED) {
      order = await razorpay.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: `receipt_${booking.id}`
      });
    } else if (ALLOW_MOCK_PAYMENTS) {
      order = { id: `mock_order_${booking.id}`, amount: amountInPaise, currency: "INR" };
    } else {
      return res.status(503).json({ message: "Payments not configured" });
    }

    const payment = await Payment.create({
      booking_id,
      razorpay_order_id: order.id,
      amount: booking.amount,
      status: 'PENDING'
    });

    res.json({ order, payment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/payments/verify", authenticateToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, booking_id } = req.body;

    const payment = await Payment.findOne({ where: { razorpay_order_id } });
    const booking = await Booking.findByPk(booking_id);
    if (!payment || !booking) return res.status(404).json({ message: "Invalid payment or booking" });

    let isValid = false;
    if (razorpay_signature === "mock_web_signature" && ALLOW_MOCK_PAYMENTS) {
      isValid = true;
    } else if (IS_RAZORPAY_CONFIGURED) {
      const expected = crypto.createHmac("sha256", RAZORPAY_SECRET)
        .update(razorpay_order_id + "|" + razorpay_payment_id)
        .digest("hex");
      isValid = expected === razorpay_signature;
    }

    if (isValid) {
      payment.status = 'SUCCESS';
      payment.razorpay_payment_id = razorpay_payment_id;
      payment.payment_time = new Date();
      await payment.save();

      booking.status = 'CONFIRMED';
      booking.ticket_qr = JSON.stringify({ booking_id: booking.id, user_id: req.user.id });
      await booking.save();

      res.json({ message: "Payment verified, Booking Confirmed" });
    } else {
      payment.status = 'FAILED';
      await payment.save();
      res.status(400).json({ message: "Payment Verification Failed" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* ================= SLOT ENGINE + SCHEDULER ================= */
// Cron Job (Every 1 Minute)
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();
    const lookaheadTime = new Date(now.getTime() + 5 * 60 * 1000); // Now + 5 mins

    const upcomingBookings = await Booking.findAll({
      where: {
        status: 'CONFIRMED',
        slot_id: null,
        sms_sent: false,
        start_time: { [Op.lte]: lookaheadTime, [Op.gt]: now }
      }
    });

    for (let booking of upcomingBookings) {
      // Find a FREE slot in the booked parking
      const freeSlot = await Slot.findOne({
        where: { parking_id: booking.parking_id, status: 'FREE' },
        order: [['slot_number', 'ASC']]
      });

      if (freeSlot) {
        booking.slot_id = freeSlot.id;
        booking.sms_sent = true;
        await booking.save();

        freeSlot.status = 'RESERVED';
        freeSlot.booking_id = booking.id;
        await freeSlot.save();

        console.log(`[SLOT ENGINE] Assigned ${freeSlot.slot_number} to Booking ${booking.id}`);
        console.log(`[SMS SERVICE] Sent SMS to User: Slot ${freeSlot.slot_number} is ready for you!`);
      } else {
        console.warn(`[SLOT ENGINE] No free slots available for Booking ${booking.id}!`);
      }
    }
  } catch (err) {
    console.error("Cron Job Error:", err);
  }
});

/* ================= SERVER START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} 🚀`));
