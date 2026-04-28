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
            [Op.lte]: fiveMinutesFromNow,
            [Op.gt]: now // Starting soon
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
  const phone = booking.user.phone || "";
  const businessName = booking.parking.businessName;
  const startTime = new Date(booking.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const message = `
🚗 *ParkScope Allocation*
Your booking at *${businessName}* is starting soon!

📍 *Assigned Slot:* Slot #${slotNumber}
🕒 *Time:* ${startTime}
Vehicle: ${booking.vehicleNumber}

Please show this at the entrance for quick entry.
  `;

  console.log(`[WHATSAPP QUEUED] to ${phone}: Slot ${slotNumber}`);

  // REAL TWILIO INTEGRATION
  if (process.env.TWILIO_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_NUMBER) {
    try {
      const client = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

      // Ensure phone is in E.164 format (e.g., +91...)
      const formattedPhone = phone.startsWith('+') ? phone : `+91${phone}`;

      await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_NUMBER,
        body: message,
        to: `whatsapp:${formattedPhone}`
      });
      console.log(`[WHATSAPP SENT] Real message sent to ${formattedPhone}`);
    } catch (err) {
      console.error(`[WHATSAPP FAILED] Twilio Error:`, err.message);
    }
  } else {
    console.log(`----------------------------------------`);
    console.log(`[WHATSAPP SIMULATION] (Add TWILIO_SID to Render to send for real)`);
    console.log(`To: ${phone}`);
    console.log(message);
    console.log(`----------------------------------------`);
  }
};

module.exports = { startSlotAllocator };
