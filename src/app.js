require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const routes = require("./routes");

const app = express();

app.use(cors({
  origin: (origin, callback) => {
    // Jika FRONTEND_URL tidak ada, default ke localhost
    if (!process.env.FRONTEND_URL) {
      return callback(null, "http://localhost:3000");
    }

    // Split dengan koma dan trim setiap origin, hapus trailing slash jika ada
    const allowedOrigins = process.env.FRONTEND_URL
      .split(",")
      .map(url => url.trim().replace(/\/$/, ""));

    // Izinkan jika origin request ada di daftar yang diizinkan
    // origin bisa undefined jika request bukan dari browser (misalnya mobile app atau curl)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`CORS Error: Origin ${origin} not allowed. Allowed: ${allowedOrigins.join(", ")}`);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(cookieParser()); // PENTING: Untuk baca refresh token

// Main Routes
app.use("/api", routes);

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

module.exports = app;
