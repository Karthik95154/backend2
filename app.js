const express = require("express");
const cors = require("cors");
const path = require("path");

const userRoutes = require("./routes/userRoutes");
const pmsRoutes = require("./routes/pmsRoutes");
const parkingRoutes = require("./routes/parkingRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const authRoutes = require("./routes/authRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const { generalLimiter, authLimiter } = require("./middleware/rateLimiter");


const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Apply general rate limiting to all /api routes
app.use("/api", generalLimiter);


app.get("/health", (req, res) => {
  res.status(200).json({ success: true, status: "ok" });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, status: "ok", prefix: "/api" });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Unified Auth with stricter rate limiting
app.use("/api/auth", authLimiter, authRoutes);


// Other routes flattened to /api
app.use("/api", pmsRoutes);
app.use("/api/slots", pmsRoutes);
app.use("/api", parkingRoutes);
app.use("/api", bookingRoutes);
app.use("/api", paymentRoutes);
app.use("/api", notificationRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("GLOBAL ERROR:", err);
  res.status(500).json({
    success: false,
    message: `Internal Server Error: ${err.message}`,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
});

module.exports = app;
