# Boot / shutdown runbook — Blackjack Enclave + Railway proxy

Resources (don't need to be re-created — just scaled up/down):
- Enclave: `blackjack-enclave` (uuid `enclave_363fc4757bf3`, project dir `~/Downloads/Evervault`)
- Railway: project `railway-proxy` (`71f5371d-a1da-4a25-a973-94f900613586`), service `railway-proxy`, env `production` (`9a295dd5-29d2-43f0-899c-30002be41d9b`), region `us-east4-eqdc4a`
- Live URL: https://railway-proxy-production-a520.up.railway.app

## Boot everything back up

```bash
# 1. Resume the Enclave
cd ~/Downloads/Evervault
set -a && source .env && set +a
ev enclave scale --desired-replicas 1

# 2. Resume the Railway proxy (redeploys the last build)
cd railway-proxy
railway up --detach \
  --service railway-proxy \
  --project 71f5371d-a1da-4a25-a973-94f900613586 \
  --environment 9a295dd5-29d2-43f0-899c-30002be41d9b

# 3. Verify both are live (enclave cold start takes ~90s from 0 replicas -- poll, don't
#    assume failure immediately; and expect the first attestation heartbeat after a cold
#    boot to sometimes throw a transient SDK error that clears on the next 30s cycle)
curl https://blackjack-enclave.app-16ddc6097f46.enclave.evervault.com/healthz -H "Api-Key: $EV_API_KEY"
curl https://railway-proxy-production-a520.up.railway.app/api/attestation-status
```

Note: `railway scale <region>=<n>` turned out to be unreliable for this service in
practice (it once shifted the deployment to a different region with 1 replica instead
of zeroing the intended one) — `railway down` / `railway up` is the dependable way to
stop/start the Railway side.

If the enclave was fully deleted rather than scaled to 0, rebuild it instead of scaling:
```bash
cd ~/Downloads/Evervault
set -a && source .env && set +a
ev enclave deploy -v --reproducible
```
This also auto-triggers the GitHub Actions PCR sync to Railway on the next `git push` — or run it manually:
```bash
gh workflow run deploy-enclave.yml --repo swindu3/evervault-blackjack-enclave
```

## Shut everything down

```bash
# Enclave
cd ~/Downloads/Evervault
set -a && source .env && set +a
ev enclave scale --desired-replicas 0

# Railway proxy
railway down --yes \
  --service railway-proxy \
  --project 71f5371d-a1da-4a25-a973-94f900613586 \
  --environment 9a295dd5-29d2-43f0-899c-30002be41d9b
```

Both keep all config, secrets, and PCR pins intact — the enclave keeps its domain and
uuid at 0 replicas; Railway keeps the service/domain/variables and just needs a fresh
`railway up` to redeploy.
