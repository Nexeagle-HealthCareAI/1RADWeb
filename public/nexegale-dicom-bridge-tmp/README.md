# NexEgale DICOM Bridge

Automatically monitors a local **Orthanc** DICOM server and uploads new studies to the **NexEgale / 1Rad** platform as soon as they arrive.

## How it works

```
Orthanc (local)  ──poll /changes──▶  Bridge  ──match──▶  1Rad Appointment  ──upload ZIP──▶  1Rad API
```

1. Polls `GET /changes` on Orthanc every N seconds (default 30s)
2. Detects `StableStudy` events (Orthanc fires this when a study is fully received)
3. Extracts patient name, study date, modality from DICOM tags
4. Searches 1Rad for a matching appointment (scored by name + date + modality)
5. Downloads the study as a ZIP from Orthanc
6. Uploads the ZIP to `POST /Study/upload` on 1Rad
7. Marks the appointment status as `scanned`
8. Records the result in a local SQLite database

---

## Requirements

- Node.js 18+
- Orthanc running locally (default: `http://localhost:8042`)
- 1Rad/NexEgale API credentials

---

## Setup

### 1. Install dependencies

```cmd
cd nexegale-dicom-bridge
npm install
```

### 2. Configure

```cmd
copy .env.example .env
notepad .env
```

Fill in:
- `ORTHANC_URL`, `ORTHANC_USER`, `ORTHANC_PASS`
- `ONERAD_API_URL`, `ONERAD_EMAIL`, `ONERAD_PASSWORD`

### 3. Test manually first

```cmd
node src/index.js
```

Watch the console. Press `Ctrl+C` to stop.

### 4. Install as Windows Service (run as Administrator)

```cmd
npm run install-service
```

The service starts automatically and restarts on reboot or crash.

---

## Commands

| Command | Description |
|---|---|
| `npm start` | Run in terminal (for testing) |
| `npm run install-service` | Install as Windows Service (Admin) |
| `npm run uninstall-service` | Remove Windows Service (Admin) |
| `npm run status` | Print upload history from local DB |

---

## Windows Service management

```cmd
# Check service status
sc query "NexEgale DICOM Bridge"

# Stop service
sc stop "NexEgale DICOM Bridge"

# Start service
sc start "NexEgale DICOM Bridge"

# Or via GUI
services.msc → "NexEgale DICOM Bridge"
```

---

## Logs

Logs are written to `DATA_DIR\logs\` (default: `C:\ProgramData\NexEgale\bridge\logs\`):

- `bridge.log` — all activity (rotated at 10 MB, keeps 5 files)
- `error.log`  — errors only

---

## Matching logic

Each appointment is scored against the incoming study:

| Factor | Weight |
|---|---|
| Patient name similarity | 50% |
| Study date (exact match) | 35% |
| Modality (exact match) | 15% |

`MATCH_CONFIDENCE_THRESHOLD` (default `0.6`) — studies scoring below this are logged as failed and skipped. Lower this if you see too many misses; raise it to reduce false matches.

---

## Troubleshooting

**Bridge says "Cannot reach Orthanc"**
- Check Orthanc is running: open `http://localhost:8042` in a browser
- Verify `ORTHANC_URL`, `ORTHANC_USER`, `ORTHANC_PASS` in `.env`

**"1Rad authentication failed"**
- Verify `ONERAD_EMAIL` and `ONERAD_PASSWORD` match a valid admin account

**"No appointment matched"**
- The patient name, date, or modality in the DICOM file doesn't closely match any 1Rad appointment
- Lower `MATCH_CONFIDENCE_THRESHOLD` to `0.5` or check the patient name in both systems
- Run `npm run status` to see what name/modality the bridge detected

**Service not starting after install**
- Open Event Viewer → Windows Logs → Application and look for errors from `NexEgale DICOM Bridge`
- Ensure `.env` is populated before installing the service (env vars are baked in at install time)
