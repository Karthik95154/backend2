const express = require("express");
const cors = require("cors");
const path = require("path");

const userRoutes = require("./routes/userRoutes");
const pmsRoutes = require("./routes/pmsRoutes");
const parkingRoutes = require("./routes/parkingRoutes");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.status(200).json({ success: true });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use("/api/user", userRoutes);
app.use("/api/pms", pmsRoutes);
app.use("/", parkingRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

module.exports = app;
