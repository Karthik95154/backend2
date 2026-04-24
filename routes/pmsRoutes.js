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
  ownerName: pms.ownerName,
  email: pms.email,
  phone: pms.phone,
  latitude: pms.latitude,
  longitude: pms.longitude,
  address: pms.address,
  totalSlots: pms.totalSlots,
  pricePerHour: pms.pricePerHour,
  openingTime: pms.openingTime,
  closingTime: pms.closingTime,
  createdAt: pms.createdAt,
  updatedAt: pms.updatedAt
});

router.post("/register", async (req, res) => {
  try {
    let {
      businessName,
      ownerName,
      email,
      phone,
      password,
      location,
      latitude,
      longitude,
      lat,
      lng,
      address,
      totalSlots,
      pricePerHour,
      openingTime,
      closingTime
    } = req.body;

    email = normalizeEmail(email);

    const resolvedLatitude = location?.lat ?? latitude ?? lat;
    const resolvedLongitude = location?.lng ?? longitude ?? lng;

    if (
      !businessName ||
      !ownerName ||
      !email ||
      !phone ||
      !password ||
      resolvedLatitude === undefined ||
      resolvedLongitude === undefined ||
      !address ||
      totalSlots === undefined ||
      pricePerHour === undefined ||
      !openingTime ||
      !closingTime
    ) {
      return res.status(400).json({
        success: false,
        message:
          "businessName, ownerName, email, phone, password, location.lat, location.lng, address, totalSlots, pricePerHour, openingTime, and closingTime are required"
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
      pms: toSafePms(pms)
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
      pms: toSafePms(pms)
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

module.exports = router;
