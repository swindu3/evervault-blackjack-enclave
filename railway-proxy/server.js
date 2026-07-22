const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ENCLAVE_URL = process.env.ENCLAVE_URL;
const EV_API_KEY = process.env.EV_API_KEY;

if (!ENCLAVE_URL || !EV_API_KEY) {
  console.error("Missing required env vars: ENCLAVE_URL and/or EV_API_KEY");
  process.exit(1);
}

app.use(express.static(path.join(__dirname, "public")));

app.use("/api", async (req, res) => {
  const url = ENCLAVE_URL.replace(/\/$/, "") + "/api" + req.url;
  const headers = { "Api-Key": EV_API_KEY };
  const sessionId = req.get("x-session-id");
  if (sessionId) headers["x-session-id"] = sessionId;

  try {
    const upstream = await fetch(url, { method: req.method, headers });
    const body = await upstream.text();
    res.status(upstream.status);
    res.set("content-type", upstream.headers.get("content-type") || "application/json");
    res.send(body);
  } catch (err) {
    res.status(502).json({ error: "Failed to reach Enclave" });
  }
});

app.listen(PORT, () => {
  console.log(`Blackjack proxy listening on port ${PORT}`);
});
