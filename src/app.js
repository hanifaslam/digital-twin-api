const express = require("express");
const cookieParser = require("cookie-parser");
const routes = require("./routes");

const app = express();

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
