const express = require("express");
const { Notification } = require("../models");

const router = express.Router();

router.get("/notifications/:userId", async (req, res) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.params.userId },
      order: [["createdAt", "DESC"]],
      limit: 50
    });

    return res.status(200).json({
      success: true,
      notifications
    });
  } catch (err) {
    console.error("GET NOTIFICATIONS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch notifications"
    });
  }
});

router.post("/notifications/read-all/:userId", async (req, res) => {
  try {
    await Notification.update(
      { isRead: true },
      { where: { userId: req.params.userId, isRead: false } }
    );
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false });
  }
});

module.exports = router;
