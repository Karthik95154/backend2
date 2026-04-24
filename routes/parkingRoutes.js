const express = require("express");
const { Op } = require("sequelize");
const { Booking, ParkingBusiness } = require("../models");

const router = express.Router();

const normalizeParking = (parking, activeBookingCount = 0) => {
  const totalSlots = Number(parking.totalSlots || 0);
  const availableSlots = Math.max(totalSlots - activeBookingCount, 0);

  return {
    id: parking.id,
    parking_name: parking.businessName,
    full_address: parking.address,
    city: "",
    state: "",
    postal_code: "",
    latitude: parking.latitude,
    longitude: parking.longitude,
    total_slots: totalSlots,
    price_per_hour: Number(parking.pricePerHour || 0),
    openingTime: parking.openingTime,
    closingTime: parking.closingTime,
    availableSlots,
    isOpen: availableSlots > 0
  };
};

router.get("/parking", async (req, res) => {
  try {
    const businesses = await ParkingBusiness.findAll({
      order: [["createdAt", "DESC"]]
    });

    const now = new Date();
    const activeBookings = await Booking.findAll({
      where: {
        status: "CONFIRMED",
        startTime: { [Op.lte]: now },
        endTime: { [Op.gte]: now }
      },
      attributes: ["parkingId"]
    });

    const activeCounts = activeBookings.reduce((acc, booking) => {
      acc[booking.parkingId] = (acc[booking.parkingId] || 0) + 1;
      return acc;
    }, {});

    return res.status(200).json(
      businesses.map((parking) =>
        normalizeParking(parking, activeCounts[parking.id] || 0)
      )
    );
  } catch (err) {
    console.error("GET PARKING ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

router.post("/book", async (req, res) => {
  try {
    const {
      userId,
      userName,
      userEmail,
      phone,
      vehicleNumber,
      parkingId,
      parkingName,
      hours,
      pricePerHour,
      startTime,
      endTime
    } = req.body;

    if (
      !userId ||
      !userName ||
      !userEmail ||
      !phone ||
      !vehicleNumber ||
      !parkingId ||
      !hours ||
      !startTime ||
      !endTime
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required booking fields"
      });
    }

    const parking = await ParkingBusiness.findByPk(parkingId);
    if (!parking) {
      return res.status(404).json({
        success: false,
        message: "Parking not found"
      });
    }

    const parsedHours = Number(hours);
    const parsedPricePerHour = Number(pricePerHour || parking.pricePerHour || 0);
    const bookingStart = new Date(startTime);
    const bookingEnd = new Date(endTime);

    if (
      !Number.isFinite(parsedHours) ||
      !Number.isFinite(parsedPricePerHour) ||
      Number.isNaN(bookingStart.getTime()) ||
      Number.isNaN(bookingEnd.getTime()) ||
      bookingEnd <= bookingStart
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking payload"
      });
    }

    const overlappingBookings = await Booking.count({
      where: {
        parkingId,
        status: "CONFIRMED",
        startTime: { [Op.lt]: bookingEnd },
        endTime: { [Op.gt]: bookingStart }
      }
    });

    if (overlappingBookings >= Number(parking.totalSlots || 0)) {
      return res.status(400).json({
        success: false,
        message: "No slots available for the selected time"
      });
    }

    const booking = await Booking.create({
      userId,
      userName,
      userEmail,
      phone,
      vehicleNumber: String(vehicleNumber).trim().toUpperCase(),
      parkingId,
      parkingName: parkingName || parking.businessName,
      hours: parsedHours,
      pricePerHour: parsedPricePerHour,
      totalAmount: parsedHours * parsedPricePerHour,
      startTime: bookingStart,
      endTime: bookingEnd
    });

    return res.status(201).json({
      success: true,
      message: "Booking successful",
      booking
    });
  } catch (err) {
    console.error("BOOKING ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

module.exports = router;
