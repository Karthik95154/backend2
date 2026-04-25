const express = require("express");
const { Op } = require("sequelize");
const { Booking, ParkingBusiness } = require("../models");

const router = express.Router();

const ACTIVE_BOOKING_STATUSES = ["Confirmed", "Checked-In"];

const buildParkingResponse = (parking, activeBookingCount = 0) => {
  const totalSlots = Number(parking.totalSlots || 0);
  const availableSlots = Math.max(totalSlots - activeBookingCount, 0);

  return {
    id: parking.id,
    businessName: parking.businessName,
    ownerName: parking.ownerName,
    email: parking.email,
    phone: parking.phone,
    latitude: parking.latitude,
    longitude: parking.longitude,
    address: parking.address,
    totalSlots,
    pricePerHour: Number(parking.pricePerHour || 0),
    openingTime: parking.openingTime,
    closingTime: parking.closingTime,
    availableSlots,
    name: parking.businessName,
    parking_name: parking.businessName,
    full_address: parking.address,
    total_slots: totalSlots,
    price_per_hour: Number(parking.pricePerHour || 0)
  };
};

const getCurrentActiveCounts = async (parkingIds) => {
  if (!parkingIds.length) {
    return {};
  }

  const now = new Date();
  const activeBookings = await Booking.findAll({
    where: {
      parkingId: { [Op.in]: parkingIds },
      bookingStatus: { [Op.in]: ACTIVE_BOOKING_STATUSES },
      startTime: { [Op.lte]: now },
      endTime: { [Op.gte]: now }
    },
    attributes: ["parkingId"]
  });

  return activeBookings.reduce((acc, booking) => {
    acc[booking.parkingId] = (acc[booking.parkingId] || 0) + 1;
    return acc;
  }, {});
};

router.get("/parking", async (req, res) => {
  try {
    const parkings = await ParkingBusiness.findAll({
      order: [["createdAt", "DESC"]]
    });

    const parkingIds = parkings.map((parking) => parking.id);
    const activeCounts = await getCurrentActiveCounts(parkingIds);

    return res.status(200).json(
      parkings.map((parking) =>
        buildParkingResponse(parking, activeCounts[parking.id] || 0)
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

router.get("/parking/:id", async (req, res) => {
  try {
    const parking = await ParkingBusiness.findByPk(req.params.id);

    if (!parking) {
      return res.status(404).json({
        success: false,
        message: "Parking not found"
      });
    }

    const activeCounts = await getCurrentActiveCounts([parking.id]);

    return res.status(200).json(
      buildParkingResponse(parking, activeCounts[parking.id] || 0)
    );
  } catch (err) {
    console.error("GET PARKING DETAIL ERROR:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message
    });
  }
});

module.exports = router;
