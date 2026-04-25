const express = require("express");
const { Op } = require("sequelize");
const { Booking, ParkingBusiness, User } = require("../models");

const router = express.Router();

const ACTIVE_BOOKING_STATUSES = ["Confirmed", "Checked-In"];

const getDurationHours = (startTime, endTime) => {
  const diffMs = endTime.getTime() - startTime.getTime();
  return diffMs / (1000 * 60 * 60);
};

const isSlotAvailable = async (parkingId, startTime, endTime, totalSlots) => {
  const overlappingBookings = await Booking.findAll({
    where: {
      parkingId,
      bookingStatus: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      startTime: { [Op.lt]: endTime },
      endTime: { [Op.gt]: startTime }
    }
  });

  // Check if we have at least one free physical slot
  return overlappingBookings.length < Number(totalSlots);
};

router.post("/book", async (req, res) => {
  try {
    const {
      userId,
      parkingId,
      vehicleNumber,
      startTime,
      endTime
    } = req.body;

    if (!userId || !parkingId || !vehicleNumber || !startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: "userId, parkingId, vehicleNumber, startTime, and endTime are required"
      });
    }

    const [user, parking] = await Promise.all([
      User.findByPk(userId),
      ParkingBusiness.findByPk(parkingId)
    ]);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    if (!parking) {
      return res.status(404).json({
        success: false,
        message: "Parking not found"
      });
    }

    const bookingStart = new Date(startTime);
    const bookingEnd = new Date(endTime);

    if (
      Number.isNaN(bookingStart.getTime()) ||
      Number.isNaN(bookingEnd.getTime()) ||
      bookingEnd <= bookingStart
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid time range"
      });
    }

    const durationHours = getDurationHours(bookingStart, bookingEnd);
    if (durationHours <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid time range"
      });
    }

    const available = await isSlotAvailable(
      parking.id,
      bookingStart,
      bookingEnd,
      parking.totalSlots
    );

    if (!available) {
      return res.status(400).json({
        success: false,
        message: "No slots available for the selected time"
      });
    }

    const booking = await Booking.create({
      userId: user.id,
      parkingId: parking.id,
      vehicleNumber: String(vehicleNumber).trim().toUpperCase(),
      slotNumber: null, // JIT Allocation will set this later
      startTime: bookingStart,
      endTime: bookingEnd,
      totalAmount: Number((durationHours * Number(parking.pricePerHour || 0)).toFixed(2))
    });

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking
    });
  } catch (err) {
    console.error("CREATE BOOKING ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

router.get("/my-bookings/:userId", async (req, res) => {
  try {
    const user = await User.findByPk(req.params.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const bookings = await Booking.findAll({
      where: { userId: req.params.userId },
      include: [
        {
          model: ParkingBusiness,
          as: "parking",
          attributes: [
            "id",
            "businessName",
            "ownerName",
            "address",
            "latitude",
            "longitude",
            "pricePerHour"
          ]
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    return res.status(200).json({
      success: true,
      bookings
    });
  } catch (err) {
    console.error("GET MY BOOKINGS ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

router.post("/check-in/:bookingId", async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    if (booking.paymentStatus !== "Paid") {
      return res.status(400).json({
        success: false,
        message: "Payment not completed"
      });
    }

    if (booking.bookingStatus !== "Confirmed") {
      return res.status(400).json({
        success: false,
        message: "Booking cannot be checked in"
      });
    }

    booking.bookingStatus = "Checked-In";
    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Check-in successful",
      booking
    });
  } catch (err) {
    console.error("CHECK-IN ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

router.post("/check-out/:bookingId", async (req, res) => {
  try {
    const booking = await Booking.findByPk(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found"
      });
    }

    if (booking.bookingStatus !== "Checked-In") {
      return res.status(400).json({
        success: false,
        message: "Booking cannot be checked out"
      });
    }

    booking.bookingStatus = "Completed";
    await booking.save();

    return res.status(200).json({
      success: true,
      message: "Check-out successful",
      booking
    });
  } catch (err) {
    console.error("CHECK-OUT ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

module.exports = router;
