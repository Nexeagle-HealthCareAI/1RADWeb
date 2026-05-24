# NexEgale DICOM Bridge — Setup Guide

## What this does

Every time a new DICOM study arrives in your local **Orthanc** server, this bridge automatically:
1. Detects the new study
2. Matches it to a patient appointment in **NexEgale**
3. Downloads the study as a ZIP from Orthanc
4. Uploads it to NexEgale
5. Marks the appointment as **Scanned**

---

## Before you start

Make sure you have:
- [ ] **Node.js 18+** installed → download from https://nodejs.org (choose LTS)
- [ ] **Orthanc** running on this machine
- [ ] Your **NexEgale admin mobile number and password**

---

## Step 1 — Open the folder in PowerShell

```powershell
cd "C:\Users\mtnoo\OneDrive\Desktop\1Rad\nexegale-dicom-bridge"
```

---

## Step 2 — Install dependencies

```powershell
npm install
```

Wait for it to finish. You should see `added X packages`.

---

## Step 3 — Create your config file

```powershell
Copy-Item .env.example .env
notepad .env
```

Fill in these values and save:

```
ORTHANC_URL=http://localhost:8042
ORTHANC_USER=orthanc
ORTHANC_PASS=orthanc

ONERAD_API_URL=https://1radapi-bch4ere7a6cmgkap.centralindia-01.azurewebsites.net/api/v1
ONERAD_IDENTIFIER=9876543210        ← your mobile number
ONERAD_PASSWORD=yourpassword        ← your NexEgale password

POLL_INTERVAL_SECONDS=30
MATCH_CONFIDENCE_THRESHOLD=0.6
DATA_DIR=C:\ProgramData\NexEgale\bridge
LOG_LEVEL=info
```

> **ORTHANC_USER / ORTHANC_PASS** — check your Orthanc config. Default is `orthanc` / `orthanc`.

---

## Step 4 — Test the connection

```powershell
node scripts/test-connection.js
```

You should see:

```
  Orthanc (http://localhost:8042) ... ✓ Connected
  1Rad API (...) ... ✓ Authenticated

  All checks passed ✓
```

If anything fails, fix your `.env` and run this again before continuing.

---

## Step 5 — Test in terminal (optional but recommended)

```powershell
node src/index.js
```

You should see:

```
[HH:mm:ss] INFO  ✓ Orthanc connected
[HH:mm:ss] INFO  ✓ 1Rad API authenticated
[HH:mm:ss] INFO  [API] Status dashboard API running at http://localhost:3001
[HH:mm:ss] INFO  Bridge is running — waiting for new studies...
```

Press `Ctrl + C` to stop once confirmed working.

---

## Step 6 — Install as a Windows Service

> Run PowerShell **as Administrator** for this step.
>
> Right-click PowerShell → **Run as administrator**

```powershell
cd "C:\Users\mtnoo\OneDrive\Desktop\1Rad\nexegale-dicom-bridge"
node scripts/install-service.js
```

You should see:

```
✅ Service installed and started.
```

The bridge now:
- **Starts automatically** when Windows boots
- **Restarts itself** if it crashes
- **Runs silently** in the background — no terminal window needed

---

## Step 7 — Monitor from the NexEgale app

Open the NexEgale app, log in as **Admin** or **AdminDoctor**, and click:

```
🔗 DICOM BRIDGE  (in the left sidebar)
```

You will see:
- Green **BRIDGE ONLINE** badge
- Upload history table
- Match confidence scores
- Any failures with error details

---

## Managing the service

### Check if it is running
```powershell
sc query "NexEgale DICOM Bridge"
```

### Stop the service
```powershell
sc stop "NexEgale DICOM Bridge"
```

### Start the service
```powershell
sc start "NexEgale DICOM Bridge"
```

### Via Windows GUI
Press `Win + R` → type `services.msc` → find **NexEgale DICOM Bridge**

---

## View logs

Logs are stored at:
```
C:\ProgramData\NexEgale\bridge\logs\bridge.log
C:\ProgramData\NexEgale\bridge\logs\error.log
```

Open with Notepad or any text editor.

---

## Check upload history

```powershell
cd "C:\Users\mtnoo\OneDrive\Desktop\1Rad\nexegale-dicom-bridge"
npm run status
```

Shows last 20 processed studies with match confidence and status.

---

## If you change credentials

Whenever you update `.env` you must reinstall the service so it picks up the new values:

```powershell
# Run as Administrator
node scripts/uninstall-service.js
node scripts/install-service.js
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `Cannot reach Orthanc` | Check Orthanc is running. Open `http://localhost:8042` in browser |
| `1Rad authentication failed` | Check `ONERAD_IDENTIFIER` (mobile number) and `ONERAD_PASSWORD` in `.env` |
| `No appointment matched` | Lower `MATCH_CONFIDENCE_THRESHOLD` to `0.5` in `.env` and reinstall service |
| Bridge shows OFFLINE in dashboard | Start the service: `sc start "NexEgale DICOM Bridge"` |
| Service already installed warning | Run uninstall first, then install again |

---

## One-click reinstall

```powershell
# Run as Administrator
cd "C:\Users\mtnoo\OneDrive\Desktop\1Rad\nexegale-dicom-bridge"
node scripts/uninstall-service.js & node scripts/install-service.js
```
