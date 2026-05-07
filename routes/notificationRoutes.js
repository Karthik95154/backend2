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

// TEST ROUTE: Trigger a manual notification
router.get("/notifications/test-trigger/:userId", async (req, res) => {
  try {
    const notification = await Notification.create({
      userId: req.params.userId,
      title: "Test Notification 🔔",
      message: "This is a test notification to verify the system is working!",
      type: "General"
    });
    return res.status(200).json({ success: true, notification });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
