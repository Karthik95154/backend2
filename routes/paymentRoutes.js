const crypto = require("crypto");
const express = require("express");
const Razorpay = require("razorpay");
const { Booking } = require("../models");

const router = express.Router();

const getRazorpayClient = () => {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY;
  const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET;

  if (!keyId || !keySecret) {
    console.log("RAZORPAY CONFIG MISSING: No key or secret found in environment");
    return null;
  }

  console.log("RAZORPAY CLIENT INITIALIZED with Key:", keyId);
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret
  });
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
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
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
    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Payment verified successfully",
      booking
    });
  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

module.exports = router;
