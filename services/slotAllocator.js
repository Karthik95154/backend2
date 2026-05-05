const { Op } = require("sequelize");
const { Booking, ParkingBusiness, User } = require("../models");

/**
 * Background task to allocate slots for bookings that are starting soon.
 * Runs every minute.
 */
const startSlotAllocator = () => {
  console.log("JIT Slot Allocator Service Started (Every 1 minute)");

  setInterval(async () => {
    try {
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

      // 1. Find Paid/Confirmed bookings that don't have a slot assigned yet
      // AND are starting within the next 5 minutes
      const pendingBookings = await Booking.findAll({
        where: {
          slotNumber: null,
          paymentStatus: "Paid",
          bookingStatus: "Confirmed",
          startTime: {
            [Op.lte]: fiveMinutesFromNow
          }
        },
        include: [{ model: ParkingBusiness, as: "parking" }, { model: User, as: "user" }]
      });

      if (pendingBookings.length > 0) {
        console.log(`[JIT] Found ${pendingBookings.length} bookings needing allocation.`);
      }

      for (const booking of pendingBookings) {
        await allocateAndNotify(booking);
      }
    } catch (err) {
      console.error("[JIT ERROR]:", err);
    }
  }, 60 * 1000); // 1 minute
};

const allocateAndNotify = async (booking) => {
  try {
    const { parking, startTime, endTime } = booking;

    // Find available slots at this parking for this specific time range
    const overlappingBookings = await Booking.findAll({
      where: {
        parkingId: parking.id,
        slotNumber: { [Op.ne]: null },
        bookingStatus: { [Op.in]: ["Confirmed", "Checked-In"] },
        startTime: { [Op.lt]: endTime },
        endTime: { [Op.gt]: startTime }
      },
      attributes: ["slotNumber"]
    });

    const occupiedSlots = new Set(overlappingBookings.map(b => Number(b.slotNumber)));
    let allocatedSlot = null;

    for (let i = 1; i <= parking.totalSlots; i++) {
      if (!occupiedSlots.has(i)) {
        allocatedSlot = i;
        break;
      }
    }

    if (allocatedSlot) {
      booking.slotNumber = allocatedSlot;
      await booking.save();

      console.log(`[JIT SUCCESS] Allocated Slot ${allocatedSlot} for Booking ${booking.id}`);

      // Send WhatsApp Notification (Mock)
      await sendWhatsAppNotification(booking, allocatedSlot);
    } else {
      console.warn(`[JIT FAILED] No slots available for booking ${booking.id} at ${parking.businessName}`);
    }
  } catch (err) {
    console.error(`[JIT ALLOCATION FAILED] for booking ${booking.id}:`, err);
  }
};

const sendWhatsAppNotification = async (booking, slotNumber) => {
  const { sendWhatsAppMessage } = require("./messagingService");
  const phone = booking.user.phone || "";
  const businessName = booking.parking.businessName;
  
  // Format time for IST
  const startTime = new Date(booking.startTime).toLocaleTimeString('en-IN', { 
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });

  const message = `🚗 *ParkScope Allocation*\n\nYour booking at *${businessName}* is starting soon!\n\n📍 *Slot:* #${slotNumber}\n🕒 *Start Time:* ${startTime}\n🚘 *Vehicle:* ${booking.vehicleNumber}\n\nPlease arrive on time. Thank you!`;

  console.log(`[JIT NOTIFY] Queuing message for Slot ${slotNumber} to ${phone}`);
  await sendWhatsAppMessage(phone, message);
};

module.exports = { startSlotAllocator };
