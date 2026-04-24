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
  role: "user"
});

const toSafePms = (pms) => ({
  id: pms.id,
  businessName: pms.businessName,
  ownerName: pms.ownerName,
  email: pms.email,
  phone: pms.phone,
  role: "admin"
});

// Unified Login
router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;
    email = normalizeEmail(email);

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required" });
    }

    // 1. Try User Login
    let user = await User.findOne({ where: { email } });
    if (user) {
      const match = await bcrypt.compare(password, user.password);
      if (match) {
        return res.status(200).json({
          success: true,
          message: "User login successful",
          user: toSafeUser(user)
        });
      }
    }

    // 2. Try PMS Login
    let pms = await ParkingBusiness.findOne({ where: { email } });
    if (pms) {
      const match = await bcrypt.compare(password, pms.password);
      if (match) {
        return res.status(200).json({
          success: true,
          message: "PMS login successful",
          user: toSafePms(pms) // Map to 'user' for consistency if needed, or keep 'pms'
        });
      }
    }

    return res.status(401).json({ success: false, message: "Invalid email or password" });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// User Signup
router.post("/signup", async (req, res) => {
  try {
    let { name, email, phone, password } = req.body;
    email = normalizeEmail(email);

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    const existing = await User.findOne({ where: { email } });
    if (existing) {
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
      user: toSafeUser(user)
    });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
});

module.exports = router;
