const crypto = require("crypto");
const express = require("express");
const Razorpay = require("razorpay");
require("dotenv").config(); // Ensure env is loaded in this module
const { Booking, ParkingBusiness, User, Notification } = require("../models");
const { sendWhatsAppMessage } = require("../services/messagingService");

const router = express.Router();

const cleanEnvVar = (val) => {
  if (!val) return "";
  // Remove whitespace and any accidental quotes (common in Render/Vercel)
  return val.trim().replace(/^["']|["']$/g, "");
};

const getRazorpayClient = () => {
  const keyId = cleanEnvVar(process.env.RAZORPAY_KEY_ID);
  const keySecret = cleanEnvVar(process.env.RAZORPAY_KEY_SECRET);

  if (!keyId || !keySecret || keyId === "undefined" || keySecret === "undefined") {
    console.log("RAZORPAY CONFIG MISSING OR INVALID: Check environment variables");
    return null;
  }

  try {
    // Log masked credentials for debugging
    console.log(`RAZORPAY DEBUG: Key ID starts with [${keyId.substring(0, 10)}] (Length: ${keyId.length})`);
    console.log(`RAZORPAY DEBUG: Key Secret starts with [${keySecret.substring(0, 4)}] (Length: ${keySecret.length})`);
    
    return new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  } catch (err) {
    console.error("RAZORPAY INIT ERROR:", err);
    return null;
  }
};

router.post("/create-order", async (req, res) => {
  try {
    const { bookingId } = req.body;

    if (!bookingId) {
      return res.status(400).json({
        success: false,
        message: "bookingId is required"
      });
    }

    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      if (process.env.ALLOW_MOCK_PAYMENTS === 'true') {
        // Mock order for testing
        const mockOrder = {
          id: `order_mock_${Date.now()}`,
          amount: Math.round(Number(booking.totalAmount || 0) * 100),
          currency: "INR",
          receipt: booking.id
        };
        
        booking.razorpay_order_id = mockOrder.id;
        booking.paymentStatus = "Pending";
        await booking.save();

        return res.status(200).json({
          success: true,
          order: mockOrder,
          mock: true,
          key: "rzp_test_mock_key"
        });
      } else {
        return res.status(500).json({
          success: false,
          message: "Razorpay is not configured on the server. Please add RAZORPAY_KEY and RAZORPAY_SECRET to .env"
        });
      }
    }

    if (booking.paymentStatus === "Paid") {
      return res.status(400).json({
        success: false,
        message: "Payment already completed for this booking"
      });
    }

    if (Number(booking.totalAmount || 0) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Booking amount must be greater than zero"
      });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(Number(booking.totalAmount || 0) * 100),
      currency: "INR",
      receipt: booking.id
    });

    booking.razorpay_order_id = order.id;
    booking.paymentStatus = "Pending";
    await booking.save();

    return res.status(200).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error("CREATE ORDER ERROR:", err);
    
    let errorDetail = "Unknown Error";
    if (typeof err === "string") errorDetail = err;
    else if (err instanceof Error) errorDetail = err.message;
    else {
      try {
        errorDetail = JSON.stringify(err);
      } catch (e) {
        errorDetail = "Unserializable Error";
      }
    }

    return res.status(500).json({
      success: false,
      message: `Create Order Error: ${errorDetail}`,
      error: err
    });
  }
});

router.post("/verify-payment", async (req, res) => {
  try {
    const {
      bookingId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "bookingId, razorpay_order_id, razorpay_payment_id, and razorpay_signature are required"
      });
    }

    const booking = await Booking.findByPk(bookingId);
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret || razorpay_order_id.startsWith("order_mock_")) {
      booking.razorpay_order_id = razorpay_order_id;
      booking.razorpay_payment_id = razorpay_payment_id;
      booking.paymentStatus = "Paid";
      await booking.save();

      return res.status(200).json({
        success: true,
        message: "Payment verified (Mock Success)",
        booking
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      booking.paymentStatus = "Failed";
      await booking.save();

      return res.status(400).json({
        success: false,
        message: "Invalid payment signature"
      });
    }

    booking.razorpay_order_id = razorpay_order_id;
    booking.razorpay_payment_id = razorpay_payment_id;
    booking.paymentStatus = "Paid";
    booking.bookingStatus = "Confirmed";
    await booking.save();

    // Fetch full booking details for WhatsApp message
    const bookingDetails = await Booking.findByPk(bookingId, {
      include: [{ model: ParkingBusiness, as: "parking" }]
    });

    if (bookingDetails) {
      const parkingName = bookingDetails.parking ? (bookingDetails.parking.businessName || bookingDetails.parking.name) : "Parking Lot";
      // Fetch user to get correct phone number
      const user = await User.findByPk(bookingDetails.userId);
      const userPhone = user ? user.phone : "";

      // Send WhatsApp Notification (Twilio Sandbox)
      if (userPhone) {
        try {
          const { sendWhatsAppNotification } = require("../services/whatsappService");
          const startTime = new Date(bookingDetails.startTime);
          const startTimeStr = startTime.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
          });

          const payMsg = `🚗 *Smart Parking Update*\n\n✅ *Payment Successful!*\n\nYour booking at *${parkingName}* for *${startTimeStr}* has been confirmed.\n\n🅿️ *Slot Assignment:* Your specific slot number will be sent to you *5 minutes* before your arrival.\n\nThank you for choosing SmartPark!`;
          await sendWhatsAppNotification(userPhone, payMsg);
        } catch (msgErr) {
          console.error("[WhatsApp Service] Payment notification failed:", msgErr.message);
        }
      }

      // Create App Notification
      try {
        await Notification.create({
          userId: booking.userId,
          title: "Payment Successful! ✅",
          message: `Your booking at ${parkingName} is confirmed. We will assign your slot 5 mins before you arrive.`,
          type: "Payment"
        });
      } catch (noteErr) {
        console.error("[PAYMENT NOTE ERROR]:", noteErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully and WhatsApp confirmation sent",
      booking
    });
  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: `Verify Payment Error: ${err.message}`,
      error: err.message
    });
  }
});

router.post("/create-overstay-order", async (req, res) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) return res.status(400).json({ success: false, message: "bookingId is required" });

    const booking = await Booking.findByPk(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    if (booking.overstayStatus !== "Pending" || booking.overstayAmount <= 0) {
      return res.status(400).json({ success: false, message: "No pending overstay charge found for this booking" });
    }

    const razorpay = getRazorpayClient();
    if (!razorpay) {
      if (process.env.ALLOW_MOCK_PAYMENTS === 'true') {
        const mockOrder = {
          id: `order_mock_over_${Date.now()}`,
          amount: Math.round(Number(booking.overstayAmount) * 100),
          currency: "INR",
          receipt: `overstay_${booking.id}`
        };
        return res.status(200).json({
          success: true,
          order: mockOrder,
          mock: true,
          key: "rzp_test_mock_key"
        });
      }
      return res.status(500).json({ success: false, message: "Razorpay not configured" });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(Number(booking.overstayAmount) * 100),
      currency: "INR",
      receipt: `os_${booking.id.substring(0, 30)}`
    });

    return res.status(200).json({
      success: true,
      order,
      key: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error("OVERSTAY ORDER ERROR:", err);
    return res.status(500).json({ success: false, message: `Overstay Order Error: ${err.message}` });
  }
});

router.post("/verify-overstay-payment", async (req, res) => {
  try {
    const { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!bookingId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret || razorpay_order_id.startsWith("order_mock_")) {
      // Allow mock verification
    } else {
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: "Invalid signature" });
      }
    }

    const booking = await Booking.findByPk(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });

    booking.overstayStatus = "Paid";
    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Overstay payment verified successfully. You can now check out.",
      booking
    });
  } catch (err) {
    console.error("VERIFY OVERSTAY ERROR:", err);
    return res.status(500).json({ success: false, message: `Verify Overstay Error: ${err.message}` });
  }
});

module.exports = router;
