const express = require("express");
const bcrypt = require("bcryptjs");
const { User, ParkingBusiness } = require("../models");

const router = express.Router();

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const toSafeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  vehicles: user.vehicles || [],
  role: "user"
});

// Update user vehicles
router.post("/user/vehicles", async (req, res) => {
  try {
    const { userId, vehicles } = req.body;
    if (!userId || !Array.isArray(vehicles)) {
      return res.status(400).json({ success: false, message: "userId and vehicles array are required" });
    }

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    user.vehicles = vehicles;
    await user.save();

    return res.status(200).json({ success: true, vehicles: user.vehicles });
  } catch (err) {
    console.error("UPDATE VEHICLES ERROR:", err);
    return res.status(500).json({ success: false, message: `Register Error: ${err.message}` });
  }
});

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
  role: "admin"
});

// Unified Login
router.post("/login", async (req, res) => {
  try {
    const { password, role } = req.body;
    let { email } = req.body;
    email = normalizeEmail(email);

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    // 1. Try User Login (Only if role is 'user' or not specified)
    if (!role || role === 'user') {
      let user = await User.findOne({ where: { email } });
      if (user) {
        const match = await bcrypt.compare(password, user.password);
        if (match) {
          return res.status(200).json({
            success: true,
            message: "User login successful",
            ...toSafeUser(user)
          });
        }
        return res.status(401).json({ success: false, message: "Incorrect password" });
      }
    }

    // 2. Try PMS Login (Only if role is 'admin' or not specified)
    if (!role || role === 'admin') {
      let pms = await ParkingBusiness.findOne({ where: { email } });
      if (pms) {
        const match = await bcrypt.compare(password, pms.password);
        if (match) {
          return res.status(200).json({
            success: true,
            message: "PMS login successful",
            ...toSafePms(pms)
          });
        }
        return res.status(401).json({ success: false, message: "Incorrect password" });
      }
    }

    return res.status(404).json({ success: false, message: "Account not found for this role" });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ success: false, message: `Login Error: ${err.message}` });
  }
});

// Unified Signup (Handles both User and PMS)
router.post("/signup", async (req, res) => {
  try {
    let {
      name,
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

    // Detect if this is a PMS/Business registration
    const isBusiness = !!(legalBusinessName || businessName || contactPerson || totalSlots);

    if (isBusiness) {
      // --- PMS REGISTRATION LOGIC ---
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

      const existingPms = await ParkingBusiness.findOne({ where: { email } });
      if (existingPms) {
        return res.status(400).json({ success: false, message: "Email already exists" });
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
    } else {
      // --- REGULAR USER SIGNUP LOGIC ---
      email = normalizeEmail(email);
      if (!name || !email || !phone || !password) {
        return res.status(400).json({ success: false, message: "Name, email, phone, and password are required" });
      }

      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const user = await User.create({
        name,
        email,
        phone,
        password: hashedPassword
      });

      return res.status(201).json({
        success: true,
        message: "User signup successful",
        ...toSafeUser(user)
      });
    }
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    return res.status(500).json({ success: false, message: `Update Profile Error: ${err.message}`, error: err.message });
  }
});

// Fetch user profile
router.get("/me/:id", async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) {
      // Also try PMS
      const pms = await ParkingBusiness.findByPk(req.params.id);
      if (pms) {
        return res.status(200).json({ success: true, ...toSafePms(pms) });
      }
      return res.status(404).json({ success: false, message: "User not found" });
    }
    return res.status(200).json({ success: true, ...toSafeUser(user) });
  } catch (err) {
    console.error("GET PROFILE ERROR:", err);
    return res.status(500).json({ success: false, message: `Change Password Error: ${err.message}` });
  }
});

const { sendWhatsAppMessage } = require("../services/messagingService");
const { sendEmail } = require("../services/emailService");

router.post("/forgot-password", async (req, res) => {
  try {
    let { email } = req.body;
    email = normalizeEmail(email);

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }

    // Check User
    let account = await User.findOne({ where: { email } });
    let type = "user";

    if (!account) {
      account = await ParkingBusiness.findOne({ where: { email } });
      type = "business";
    }

    if (!account) {
      return res.status(404).json({ success: false, message: "Account not found" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    account.resetCode = otp;
    account.resetExpiry = expiry;
    await account.save();

    // Send via WhatsApp
    const message = `🔐 *ParkScope Password Reset*\n\nYour verification code is: *${otp}*\n\nThis code expires in 15 minutes. If you didn't request this, please ignore this message.`;
    
    await sendWhatsAppMessage(account.phone, message);

    // Send via Email
    const emailSubject = "ParkScope Password Reset Verification";
    const emailBody = `Your verification code is: ${otp}\n\nThis code expires in 15 minutes.`;
    await sendEmail(account.email, emailSubject, emailBody);

    return res.status(200).json({
      success: true,
      message: `Verification code sent to ${account.email} (Email) and ${account.phone} (WhatsApp)`,
      debug_otp: process.env.NODE_ENV === 'development' ? otp : undefined
    });
  } catch (err) {
    console.error("FORGOT PASS ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/reset-password", async (req, res) => {
  try {
    let { email, code, newPassword } = req.body;
    email = normalizeEmail(email);

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: "Email, code, and newPassword are required" });
    }

    // Check User
    let account = await User.findOne({ where: { email, resetCode: code } });
    if (!account) {
      account = await ParkingBusiness.findOne({ where: { email, resetCode: code } });
    }

    if (!account) {
      return res.status(400).json({ success: false, message: "Invalid verification code" });
    }

    if (new Date() > new Date(account.resetExpiry)) {
      return res.status(400).json({ success: false, message: "Code has expired" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    account.password = hashedPassword;
    account.resetCode = null;
    account.resetExpiry = null;
    await account.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successful. You can now login with your new password."
    });
  } catch (err) {
    console.error("RESET PASS ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});module.exports = router;
