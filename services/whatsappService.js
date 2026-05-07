const twilio = require("twilio");

/**
 * WhatsApp Messaging Service (Twilio Sandbox Integration)
 * Handles secure, formatted WhatsApp notifications with graceful failure.
 */
const sendWhatsAppNotification = async (to, body) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886";

  // Phone Formatting Logic
  let formattedTo = String(to).replace(/\D/g, ""); // Remove non-numeric characters
  
  if (formattedTo.length === 10) {
    // If 10 digits, prepend +91 (India)
    formattedTo = `whatsapp:+91${formattedTo}`;
  } else if (!formattedTo.startsWith("+")) {
    // If it has more digits but no +, prepend +
    formattedTo = `whatsapp:+${formattedTo}`;
  } else {
    // Already has +
    formattedTo = `whatsapp:${formattedTo}`;
  }

  console.log(`[WhatsApp Service] Attempting delivery to: ${formattedTo}`);
  
  // Guard clause for missing credentials to prevent backend crashes
  if (!accountSid || !authToken) {
    console.warn("[WhatsApp Service] CRITICAL: Twilio credentials missing. Logging message instead.");
    console.log(`[DUMMY LOG] To: ${formattedTo} | Message: ${body}`);
    return { success: false, error: "Missing credentials" };
  }

  try {
    const client = twilio(accountSid, authToken);
    
    const message = await client.messages.create({
      from,
      to: formattedTo,
      body: body
    });

    console.log(`[WhatsApp Service] Delivery SUCCESS | SID: ${message.sid} | Status: ${message.status}`);
    return { success: true, sid: message.sid };
  } catch (error) {
    // Graceful error handling - never crash the backend
    console.error("[WhatsApp Service] Delivery FAILED | Error:", error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendWhatsAppNotification };
