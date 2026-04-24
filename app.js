const express = require("express");
const cors = require("cors");
const path = require("path");

const userRoutes = require("./routes/userRoutes");
const pmsRoutes = require("./routes/pmsRoutes");
const parkingRoutes = require("./routes/parkingRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.status(200).json({ success: true, status: "ok" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Unified Auth
app.use("/", authRoutes);

// Other routes flattened to root
app.use("/", pmsRoutes);
app.use("/", parkingRoutes);
app.use("/", bookingRoutes);
app.use("/", paymentRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

module.exports = app;
