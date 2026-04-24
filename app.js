const express = require("express");
const cors = require("cors");
const path = require("path");

const userRoutes = require("./routes/userRoutes");
const pmsRoutes = require("./routes/pmsRoutes");
const parkingRoutes = require("./routes/parkingRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

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

app.use("/api/user", userRoutes);
app.use("/api/pms", pmsRoutes);
app.use("/api", parkingRoutes);
app.use("/api", bookingRoutes);
app.use("/api", paymentRoutes);
app.use("/", parkingRoutes);
app.use("/", bookingRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

module.exports = app;
