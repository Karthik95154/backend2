const express = require("express");
const bcrypt = require("bcryptjs");
const { Op, UniqueConstraintError } = require("sequelize");
const { ParkingBusiness, Booking, User } = require("../models");

const router = express.Router();

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const isValidNumber = (value) => Number.isFinite(Number(value));

const toSafePms = (pms) => ({
  id: pms.id,
  businessName: pms.businessName,
  legalBusinessName: pms.businessName,
  parkingName: pms.parkingName || pms.businessName,
  ownerName: pms.ownerName,
  contactPerson: pms.ownerName,
  email: pms.email,
  contactEmail: pms.email,
  phone: pms.phone,
  contactPhone: pms.phone,
  latitude: pms.latitude,
  longitude: pms.longitude,
  address: pms.address,
  fullAddress: pms.address,
  totalSlots: pms.totalSlots,
  pricePerHour: pms.pricePerHour,
  openingTime: pms.openingTime,
  closingTime: pms.closingTime,
  createdAt: pms.createdAt,
  updatedAt: pms.updatedAt
});

router.post("/signup", async (req, res) => {
  try {
    let {
      businessName,
      legalBusinessName,
      ownerName,
      contactPerson,
      email,
      contactEmail,
      phone,
      contactPhone,
      password,
      adminPassword,
      location,
      latitude,
      longitude,
      lat,
      lng,
      address,
      fullAddress,
      totalSlots,
      pricePerHour,
      openingTime,
      closingTime
    } = req.body;

    businessName = businessName || legalBusinessName;
    ownerName = ownerName || contactPerson;
    email = normalizeEmail(email || contactEmail);
    phone = phone || contactPhone;
    password = password || adminPassword;
    address = address || fullAddress;

    const resolvedLatitude = location?.lat ?? latitude ?? lat;
    const resolvedLongitude = location?.lng ?? longitude ?? lng;

    const missingFields = [];
    if (!businessName) missingFields.push("businessName (legalBusinessName)");
    if (!ownerName) missingFields.push("ownerName (contactPerson)");
    if (!email) missingFields.push("email (contactEmail)");
    if (!phone) missingFields.push("phone (contactPhone)");
    if (!password) missingFields.push("password (adminPassword)");
    if (resolvedLatitude === undefined || resolvedLatitude === null) missingFields.push("latitude (map location)");
    if (resolvedLongitude === undefined || resolvedLongitude === null) missingFields.push("longitude (map location)");
    if (!address) missingFields.push("address (fullAddress)");
    if (totalSlots === undefined || totalSlots === null) missingFields.push("totalSlots");
    if (pricePerHour === undefined || pricePerHour === null) missingFields.push("pricePerHour");
    if (!openingTime) missingFields.push("openingTime");
    if (!closingTime) missingFields.push("closingTime");

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(", ")}`
      });
    }

    if (
      !isValidNumber(resolvedLatitude) ||
      !isValidNumber(resolvedLongitude) ||
      !isValidNumber(totalSlots) ||
      !isValidNumber(pricePerHour)
    ) {
      return res.status(400).json({
        success: false,
        message: "location, totalSlots, and pricePerHour must be valid numbers"
      });
    }

    const existingPms = await ParkingBusiness.findOne({ where: { email } });
    if (existingPms) {
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const pms = await ParkingBusiness.create({
      businessName: String(businessName).trim(),
      ownerName: String(ownerName).trim(),
      email,
      phone: String(phone).trim(),
      password: hashedPassword,
      latitude: Number(resolvedLatitude),
      longitude: Number(resolvedLongitude),
      address: String(address).trim(),
      totalSlots: Number(totalSlots),
      pricePerHour: Number(pricePerHour),
      openingTime: String(openingTime).trim(),
      closingTime: String(closingTime).trim()
    });

    return res.status(201).json({
      success: true,
      message: "PMS registration successful",
      ...toSafePms(pms)
    });
  } catch (err) {
    console.error("PMS REGISTER ERROR:", err);

    if (err instanceof UniqueConstraintError) {
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    return res.status(500).json({
      success: false,
      message: `PMS Register Error: ${err.message}`,
      error: err.message
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    email = normalizeEmail(email);

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const pms = await ParkingBusiness.findOne({ where: { email } });
    if (!pms) {
      return res.status(404).json({
        success: false,
        message: "PMS not found"
      });
    }

    const passwordMatch = await bcrypt.compare(password, pms.password);
    if (!passwordMatch) {
      return res.status(400).json({
        success: false,
        message: "Wrong password"
      });
    }

    return res.status(200).json({
      success: true,
      message: "PMS login successful",
      ...toSafePms(pms)
    });
  } catch (err) {
    console.error("PMS LOGIN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: `PMS Login Error: ${err.message}`,
      error: err.message
    });
  }
});

router.get("/dashboard/stats", async (req, res) => {
  try {
    const { parkingId } = req.query;
    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();

    if (!pms) {
      return res.status(200).json({
        totalSlots: 0,
        occupiedCount: 0,
        availableCount: 0,
        reservedCount: 0,
        overstayCount: 0,
        revenue: 0,
        zoneCount: 0,
        activeBookings: 0,
      });
    }

    const now = new Date();
    const [activeBookings, allBookings] = await Promise.all([
      Booking.findAll({
        where: {
          parkingId: pms.id,
          paymentStatus: "Paid",
          [Op.or]: [
            { 
              bookingStatus: "Checked-In" // Physically present
            },
            {
              bookingStatus: "Confirmed",
              startTime: { [Op.lte]: now },
              endTime: { [Op.gte]: now }
            }
          ]
        }
      }),
      Booking.findAll({
        where: { 
          parkingId: pms.id,
          paymentStatus: "Paid" // ONLY PAID BOOKINGS
        }
      })
    ]);

    const revenue = allBookings
      .filter(b => b.paymentStatus === "Paid")
      .reduce((sum, b) => sum + Number(b.totalAmount || 0), 0);

    const totalSlots = Number(pms.totalSlots || 0);
    
    // 1. Physically Occupied (Checked-In)
    const occupiedCount = activeBookings.filter(b => b.bookingStatus === "Checked-In").length;
    
    // 2. Reserved & Assigned (Confirmed with a Slot Number)
    // These are bookings in the 5-min JIT window or manually assigned
    const reservedCount = activeBookings.filter(b => 
      b.bookingStatus === "Confirmed" && b.slotNumber !== null
    ).length;

    // 3. Pending (Confirmed but NO Slot assigned yet)
    // These do NOT decrease physical availability yet
    const pendingCount = activeBookings.filter(b => 
      b.bookingStatus === "Confirmed" && b.slotNumber === null
    ).length;

    const availableCount = Math.max(totalSlots - (occupiedCount + reservedCount), 0);

    return res.status(200).json({
      totalSlots,
      occupiedCount,
      availableCount,
      reservedCount,
      pendingCount,
      overstayCount: 0,
      revenue,
      zoneCount: 1, 
      activeBookings: activeBookings.length,
    });
  } catch (err) {
    console.error("STATS ERROR:", err);
    return res.status(500).json({ success: false, message: `Stats Error: ${err.message}` });
  }
});

router.get("/availability", async (req, res) => {
  try {
    const { startTime, endTime, parkingId } = req.query;
    
    // Find the business (if parkingId not provided, take the first one)
    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();

    if (!pms) return res.json([]);

    const start = startTime ? new Date(startTime) : new Date();
    const end = endTime ? new Date(endTime) : new Date(start.getTime() + 3600000);

    const overlappingBookings = await Booking.findAll({
      where: {
        parkingId: pms.id,
        paymentStatus: "Paid",
        [Op.or]: [
          { bookingStatus: "Checked-In" },
          {
            bookingStatus: "Confirmed",
            startTime: { [Op.lt]: end },
            endTime: { [Op.gt]: start }
          }
        ]
      }
    });

    // Return the list of occupied slots for the frontend to normalize
    return res.json(overlappingBookings
      .filter(b => b.slotNumber !== null)
      .map(b => ({
        slotNumber: b.slotNumber,
        status: b.bookingStatus === "Checked-In" ? "occupied" : "reserved"
      }))
    );
  } catch (err) {
    console.error("AVAILABILITY ERROR:", err);
    return res.status(500).json([]);
  }
});

router.get("/slots", async (req, res) => {
  try {
    const { parkingId } = req.query;
    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();

    if (!pms) return res.status(200).json([]);

    const totalSlots = Number(pms.totalSlots || 0);
    const now = new Date();
    const activeBookings = await Booking.findAll({
      where: {
        parkingId: pms.id,
        paymentStatus: "Paid",
        [Op.or]: [
          { bookingStatus: "Checked-In" },
          {
            bookingStatus: "Confirmed",
            startTime: { [Op.lte]: now },
            endTime: { [Op.gte]: now }
          }
        ]
      }
    });

    const slots = [];
    const occupiedMap = new Map(activeBookings.map(b => [Number(b.slotNumber), b]));

    for (let i = 1; i <= totalSlots; i++) {
      const booking = occupiedMap.get(i);
      slots.push({
        id: `slot-${i}`,
        number: String(i),
        status: booking ? (booking.bookingStatus === "Checked-In" ? "occupied" : "reserved") : "free",
        vehicleNumber: booking?.vehicleNumber,
        zoneId: "zone-1"
      });
    }

    return res.status(200).json(slots);
  } catch (err) {
    console.error("SLOTS ERROR:", err);
    return res.status(500).json({ success: false, message: `Slots Error: ${err.message}` });
  }
});

router.patch("/slots/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, vehicleNumber, parkingId } = req.body;
    const slotNumber = id.replace("slot-", "");

    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();
    if (!pms) return res.status(404).json({ success: false, message: "Business not found" });

    if (status === "free") {
      // End any active booking for this slot
      await Booking.update(
        { bookingStatus: "Completed" },
        {
          where: {
            parkingId: pms.id,
            slotNumber: slotNumber,
            bookingStatus: { [Op.in]: ["Confirmed", "Checked-In"] }
          }
        }
      );
    } else if (status === "occupied") {
      // Find a valid user to associate with this manual booking
      const user = await User.findOne();
      if (!user) return res.status(400).json({ success: false, message: "No users found in database to link booking" });

      // Create a manual check-in booking
      await Booking.create({
        parkingId: pms.id,
        userId: user.id,
        vehicleNumber: vehicleNumber || "MANUAL",
        slotNumber: slotNumber,
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000), // 1 hour default
        bookingStatus: "Checked-In",
        paymentStatus: "Paid",
        totalAmount: pms.pricePerHour
      });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("SLOT UPDATE ERROR:", err);
    return res.status(500).json({ success: false, message: `Slot Update Error: ${err.message}` });
  }
});

router.get("/parking-zones", async (req, res) => {
  try {
    const { parkingId } = req.query;
    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();
    if (!pms) return res.status(200).json([]);

    return res.status(200).json([{
      id: "zone-1",
      name: "Main Area",
      capacity: pms.totalSlots,
      type: "General",
      rate: pms.pricePerHour
    }]);
  } catch (err) {
    console.error("ZONES ERROR:", err);
    return res.status(500).json({ success: false, message: `Zones Error: ${err.message}` });
  }
});

router.patch("/parking-zones/:id", async (req, res) => {
  try {
    const { capacity, rate, parkingId } = req.body;
    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();
    if (!pms) return res.status(404).json({ success: false, message: "Business not found" });

    if (capacity !== undefined) pms.totalSlots = Number(capacity);
    if (rate !== undefined) pms.pricePerHour = Number(rate);

    await pms.save();

    return res.status(200).json({
      success: true,
      message: "Zone updated successfully",
      zone: {
        id: "zone-1",
        name: pms.businessName,
        capacity: pms.totalSlots,
        rate: pms.pricePerHour
      }
    });
  } catch (err) {
    console.error("ZONE UPDATE ERROR:", err);
    return res.status(500).json({ success: false, message: `Zone Update Error: ${err.message}` });
  }
});

router.get("/payments", async (req, res) => {
  try {
    const { parkingId } = req.query;
    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();
    if (!pms) return res.status(200).json([]);

    const bookings = await Booking.findAll({
      where: {
        parkingId: pms.id,
        paymentStatus: "Paid"
      },
      order: [["updatedAt", "DESC"]]
    });

    const payments = bookings.map(b => ({
      id: `PAY-${b.id}`,
      bookingId: b.id,
      amount: b.totalAmount,
      status: "Paid",
      date: b.updatedAt
    }));

    return res.status(200).json(payments);
  } catch (err) {
    console.error("PAYMENTS ERROR:", err);
    return res.status(500).json({ success: false, message: `Payments Error: ${err.message}` });
  }
});

router.post("/bookings", async (req, res) => {
  try {
    const { parkingId, userPhone, vehicleNumber, startTime, endTime, assignedSlotId, amount } = req.body;

    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();

    if (!pms) return res.status(404).json({ success: false, message: "Business not found" });

    // Find or create a temporary "Offline User" record
    let user = await User.findOne({ where: { phone: userPhone || "OFFLINE" } });
    if (!user) {
      user = await User.create({
        name: "Offline Customer",
        email: `offline_${Date.now()}@example.com`,
        phone: userPhone || "OFFLINE",
        password: "N/A"
      });
    }

    const slotNumber = assignedSlotId ? parseInt(assignedSlotId.replace("slot-", ""), 10) : null;

    const booking = await Booking.create({
      parkingId: pms.id,
      userId: user.id,
      vehicleNumber: vehicleNumber || "OFFLINE",
      slotNumber: slotNumber,
      startTime: startTime ? new Date(startTime) : new Date(),
      endTime: endTime ? new Date(endTime) : new Date(Date.now() + 3600000),
      bookingStatus: slotNumber ? "Checked-In" : "Confirmed", // If slot given, assume they are arriving now
      paymentStatus: "Paid", // Manual/Offline payment
      totalAmount: amount || pms.pricePerHour
    });

    return res.status(201).json({
      success: true,
      message: "Offline booking created successfully",
      booking
    });
  } catch (err) {
    console.error("MANUAL BOOKING ERROR:", err);
    return res.status(500).json({ success: false, message: `Manual Booking Error: ${err.message}` });
  }
});

router.get("/bookings", async (req, res) => {
  try {
    const { parkingId } = req.query;
    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();
    if (!pms) return res.status(200).json([]);

    const bookings = await Booking.findAll({
      where: { 
        parkingId: pms.id,
        paymentStatus: "Paid" // ONLY PAID BOOKINGS
      },
      order: [["createdAt", "DESC"]]
    });

    return res.status(200).json(bookings.map(b => ({
      id: b.id,
      user: b.userId, // Simplified
      vehicle: b.vehicleNumber,
      time: b.startTime,
      status: b.bookingStatus === "Checked-In" ? "active" : (b.bookingStatus === "Confirmed" ? "booked" : "completed"),
      assignedSlotId: `slot-${b.slotNumber}`,
      amount: b.totalAmount
    })));
  } catch (err) {
    console.error("BOOKINGS ERROR:", err);
    return res.status(500).json({ success: false, message: `Bookings Error: ${err.message}` });
  }
});

router.patch("/bookings/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, assignedSlotId } = req.body;

    const booking = await Booking.findByPk(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    // Map PMS status to Backend status
    let newStatus = booking.bookingStatus;
    if (status === "active") newStatus = "Checked-In";
    if (status === "completed") newStatus = "Completed";
    if (status === "cancelled") newStatus = "Cancelled";
    if (status === "assigned") newStatus = "Confirmed";

    booking.bookingStatus = newStatus;

    // Handle manual slot assignment if provided
    if (assignedSlotId) {
      // assignedSlotId is usually "slot-N"
      const slotNumber = parseInt(assignedSlotId.replace("slot-", ""), 10);
      if (!isNaN(slotNumber)) {
        booking.slotNumber = slotNumber;
      }
    }

    await booking.save();

    return res.status(200).json({ success: true, booking });
  } catch (err) {
    console.error("BOOKING UPDATE ERROR:", err);
    return res.status(500).json({ success: false, message: `Booking Update Error: ${err.message}` });
  }
});

router.get("/business/profile", async (req, res) => {
  try {
    const { parkingId } = req.query;
    const pms = parkingId 
      ? await ParkingBusiness.findByPk(parkingId)
      : await ParkingBusiness.findOne();
    if (!pms) {
      return res.status(404).json({ success: false, message: "No business profile found" });
    }
    return res.status(200).json(toSafePms(pms));
  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    return res.status(500).json({ success: false, message: `Profile Error: ${err.message}` });
  }
});

module.exports = router;
