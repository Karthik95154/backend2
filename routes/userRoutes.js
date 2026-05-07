const express = require("express");
const bcrypt = require("bcryptjs");
const { UniqueConstraintError } = require("sequelize");
const { User } = require("../models");

const router = express.Router();

const normalizeEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const toSafeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
});

router.post("/signup", async (req, res) => {
  try {
    let { name, email, phone, password } = req.body;

    email = normalizeEmail(email);

    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, phone, and password are required"
      });
    }

    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name: String(name).trim(),
      email,
      phone: String(phone).trim(),
      password: hashedPassword
    });

    return res.status(201).json({
      success: true,
      message: "User signup successful",
      user: toSafeUser(user)
    });
  } catch (err) {
    console.error("USER SIGNUP ERROR:", err);

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

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(400).json({
        success: false,
        message: "Wrong password"
      });
    }

    return res.status(200).json({
      success: true,
      message: "User login successful",
      user: toSafeUser(user)
    });
  } catch (err) {
    console.error("USER LOGIN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

router.put("/update/:id", async (req, res) => {
  try {
    const { name, phone } = req.body;
    const user = await User.findByPk(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (name) user.name = String(name).trim();
    if (phone) user.phone = String(phone).trim();

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: toSafeUser(user)
    });
  } catch (err) {
    console.error("UPDATE USER ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

module.exports = router;
