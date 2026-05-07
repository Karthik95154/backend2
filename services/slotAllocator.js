const { Op } = require("sequelize");
const { Booking, ParkingBusiness, User, Notification } = require("../models");

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
      } else {
        // Heartbeat log every 10 runs (~5 mins)
        if (Math.random() < 0.1) console.log("[JIT] Heartbeat: Service active and scanning...");
      }

      for (const booking of pendingBookings) {
        if (!booking.user || !booking.user.phone) {
          console.warn(`[JIT WARN] Cannot notify for booking ${booking.id}: User phone missing.`);
          // Still allocate even if we can't notify
          await allocateAndNotify(booking);
          continue;
        }
        await allocateAndNotify(booking);
      }

      // 2. Send 15-minute "End of Booking" Reminders
      const fifteenMinutesFromNow = new Date(now.getTime() + 15 * 60 * 1000);
      const fourteenMinutesFromNow = new Date(now.getTime() + 14 * 60 * 1000);

      const expiringBookings = await Booking.findAll({
        where: {
          bookingStatus: "Checked-In",
          endTime: {
            [Op.between]: [fourteenMinutesFromNow, fifteenMinutesFromNow]
          }
        },
        include: [{ model: ParkingBusiness, as: "parking" }, { model: User, as: "user" }]
      });

      for (const booking of expiringBookings) {
        await sendEndReminder(booking);
      }
    } catch (err) {
      console.error("[JIT ERROR]:", err);
    }
  }, 30 * 1000); // 30 seconds
};

const sendEndReminder = async (booking) => {
  const { sendWhatsAppMessage } = require("./messagingService");
  const phone = booking.user.phone || "";
  const businessName = booking.parking.businessName;

  const message = `⚠️ *ParkScope Reminder*\n\nYour booking at *${businessName}* will end in *15 minutes*.\n\n✅ *Want to stay longer?* Open the app to extend your time.\n🚪 *Ready to leave?* Please proceed to the exit to avoid overstay charges.`;

  console.log(`[REMINDER] Sent to ${phone} for booking ${booking.id}`);
  await sendWhatsAppMessage(phone, message);
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

      // Create App Notification
      try {
        await Notification.create({
          userId: booking.userId,
          title: "Slot Allocated! 🚗",
          message: `Your spot at ${parking.businessName} is ready. Please park in Slot #${allocatedSlot}.`,
          type: "Allocation"
        });
      } catch (noteErr) {
        console.error("[JIT NOTE ERROR]:", noteErr.message);
      }

      // Send WhatsApp Notification (Twilio Sandbox)
      try {
        const { sendWhatsAppNotification } = require("./whatsappService");
        const slotMsg = `🚗 *Smart Parking Update*\n\nYour parking slot has been assigned successfully.\n\nSlot Number: *${allocatedSlot}*\nFloor: *Ground Floor*\n\nPlease proceed to the parking area.`;
        await sendWhatsAppNotification(booking.user.phone, slotMsg);
      } catch (msgErr) {
        console.error("[WhatsApp Service] JIT Allocation notification failed:", msgErr.message);
      }
    } else {
      console.warn(`[JIT FAILED] No slots available for booking ${booking.id} at ${parking.businessName}`);
    }
  } catch (err) {
    console.error(`[JIT ALLOCATION FAILED] for booking ${booking.id}:`, err);
  }
};


module.exports = { startSlotAllocator };
