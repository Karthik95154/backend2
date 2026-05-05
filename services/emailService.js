const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, text) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("-----------------------------------------");
    console.log("MOCK EMAIL SENT TO:", to);
    console.log("SUBJECT:", subject);
    console.log("BODY:", text);
    console.log("-----------------------------------------");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  try {
    await transporter.sendMail({
      from: `"ParkScope Support" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text
    });
    console.log(`[EMAIL SUCCESS] Sent to ${to}`);
  } catch (err) {
    console.error(`[EMAIL FAILED] Error:`, err.message);
  }
};

module.exports = { sendEmail };
