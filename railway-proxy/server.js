const express = require("express");
const path = require("path");
const axios = require("axios");
const Evervault = require("@evervault/sdk");
const AttestationBindings = require("@evervault/attestation-bindings");

const app = express();
const PORT = process.env.PORT || 3000;
const ENCLAVE_URL = process.env.ENCLAVE_URL;
const EV_API_KEY = process.env.EV_API_KEY;
const EV_APP_UUID = process.env.EV_APP_UUID;
const ENCLAVE_NAME = process.env.ENCLAVE_NAME || "blackjack-enclave";
const REPO_URL = process.env.REPO_URL || null;
const COMMIT_SHA = process.env.COMMIT_SHA || null;
const HEARTBEAT_INTERVAL_MS = 30_000;

const PINNED_PCRS = {
  pcr0: process.env.PCR0,
  pcr1: process.env.PCR1,
  pcr2: process.env.PCR2,
  pcr8: process.env.PCR8,
};

if (!ENCLAVE_URL || !EV_API_KEY || !EV_APP_UUID) {
  console.error("Missing required env vars: ENCLAVE_URL, EV_API_KEY, and/or EV_APP_UUID");
  process.exit(1);
}
if (!PINNED_PCRS.pcr0 || !PINNED_PCRS.pcr1 || !PINNED_PCRS.pcr2 || !PINNED_PCRS.pcr8) {
  console.error("Missing pinned PCR env vars (PCR0/PCR1/PCR2/PCR8)");
  process.exit(1);
}

const evervault = new Evervault(EV_APP_UUID, EV_API_KEY);

let enclaveAgent = null;
let attestationStatus = { attested: false, error: "Attestation not yet performed" };

function baseStatusFields() {
  return {
    enclave: ENCLAVE_NAME,
    enclaveUrl: ENCLAVE_URL,
    pcr0: PINNED_PCRS.pcr0,
    pcr1: PINNED_PCRS.pcr1,
    pcr2: PINNED_PCRS.pcr2,
    pcr8: PINNED_PCRS.pcr8,
    commitSha: COMMIT_SHA,
    commitUrl: REPO_URL && COMMIT_SHA ? `${REPO_URL.replace(/\/$/, "")}/commit/${COMMIT_SHA}` : null,
  };
}

// Every https request made through enclaveAgent is attested on its TLS handshake, so this
// heartbeat is a genuine live re-check (not a cached flag) -- it proves the connection is
// still attesting successfully even when no one is actively playing.
async function heartbeat() {
  try {
    await axios.get(`${ENCLAVE_URL}/healthz`, {
      httpsAgent: enclaveAgent,
      headers: { "Api-Key": EV_API_KEY },
    });
    attestationStatus = { ...baseStatusFields(), attested: true, verifiedAt: new Date().toISOString() };
  } catch (err) {
    attestationStatus = { ...baseStatusFields(), attested: false, error: err.message };
    console.error("Enclave attestation heartbeat FAILED:", err.message);
  }
}

async function initAttestation() {
  try {
    enclaveAgent = await evervault.createEnclaveHttpsAgent(
      { [ENCLAVE_NAME]: PINNED_PCRS },
      AttestationBindings
    );
  } catch (err) {
    attestationStatus = { ...baseStatusFields(), attested: false, error: err.message };
    console.error("Enclave attestation agent setup FAILED:", err.message);
    return;
  }
  await heartbeat();
  console.log(`Enclave attestation ${attestationStatus.attested ? "verified" : "FAILED"} on startup`);
  setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
}

initAttestation();

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/attestation-status", (req, res) => {
  res.json(attestationStatus);
});

app.use("/api", async (req, res) => {
  if (!enclaveAgent || !attestationStatus.attested) {
    return res.status(503).json({ error: "Enclave attestation has not succeeded; refusing to forward request" });
  }

  const url = ENCLAVE_URL.replace(/\/$/, "") + "/api" + req.url;
  const headers = { "Api-Key": EV_API_KEY };
  const sessionId = req.get("x-session-id");
  if (sessionId) headers["x-session-id"] = sessionId;

  try {
    const upstream = await axios.request({
      url,
      method: req.method,
      headers,
      httpsAgent: enclaveAgent,
      validateStatus: () => true,
    });
    res.status(upstream.status).json(upstream.data);
  } catch (err) {
    res.status(502).json({ error: "Attested connection to Enclave failed: " + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Blackjack proxy listening on port ${PORT}`);
});
