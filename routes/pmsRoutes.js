const express = require("express");
const bcrypt = require("bcryptjs");
const { UniqueConstraintError } = require("sequelize");
const { ParkingBusiness } = require("../models");

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
      message: "Internal server error",
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
      message: "Internal server error",
      error: err.message
    });
  }
});

router.get("/business/profile", async (req, res) => {
  try {
    const pms = await ParkingBusiness.findOne();
    if (!pms) {
      return res.status(404).json({ success: false, message: "No business profile found" });
    }
    return res.status(200).json(toSafePms(pms));
  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
