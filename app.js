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

app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, status: "ok", prefix: "/api" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Unified Auth
app.use("/api/auth", authRoutes);

// Other routes flattened to /api
app.use("/api", pmsRoutes);
app.use("/api/slots", pmsRoutes);
app.use("/api", parkingRoutes);
app.use("/api", bookingRoutes);
app.use("/api", paymentRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

module.exports = app;
