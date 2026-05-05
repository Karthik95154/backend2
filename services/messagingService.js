const twilio = require("twilio");

/**
 * Service to handle WhatsApp messages via Twilio
 */
const sendWhatsAppMessage = async (to, body) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_NUMBER || "whatsapp:+14155238886"; // Default Twilio sandbox number

  console.log(`[WhatsApp] Attempting to send message to ${to}: ${body}`);

  if (!accountSid || !authToken) {
    console.warn("[WhatsApp] Missing Twilio credentials. Message not sent.");
    console.log(`[WhatsApp LOG] To: ${to} | Body: ${body}`);
    return { success: false, error: "Missing credentials" };
  }

  try {
    const client = twilio(accountSid, authToken);
    
    // Ensure 'to' is in whatsapp format
    const formattedTo = to.startsWith("whatsapp:") ? to : `whatsapp:+91${to.replace(/\D/g, "").slice(-10)}`;
    
    const message = await client.messages.create({
      from,
      to: formattedTo,
      body,
    });

    console.log(`[WhatsApp] Message sent successfully. SID: ${message.sid}`);
    return { success: true, sid: message.sid };
  } catch (error) {
    console.error("[WhatsApp] Error sending message:", error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendWhatsAppMessage };
