const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "No token provided. Authorization denied."
      });
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "smartpark_secret_key_2024";

    const decoded = jwt.verify(token, secret);
    
    // Attach user info to request object
    req.user = decoded;
    next();
  } catch (err) {
    console.error("JWT VERIFICATION ERROR:", err.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token."
    });
  }
};

module.exports = { verifyToken };
