#!/usr/bin/env python3
import json, datetime

ROUTES = {
  "LoginPage": {"route": "/login", "access": "public", "allowedRoles": [], "requiredModule": None, "layout": "standalone"},
  "RegisterPage": {"route": "/register", "access": "public", "allowedRoles": [], "requiredModule": None, "layout": "standalone"},
  "ForgotPassword": {"route": "/forgot-password", "access": "public", "allowedRoles": [], "requiredModule": None, "layout": "standalone"},
  "AccessDenied": {"route": "/access-denied", "access": "public", "allowedRoles": [], "requiredModule": None, "layout": "standalone"},
  "StatusTracking": {"route": "/track/:id", "access": "public-signed-token", "allowedRoles": [], "requiredModule": None, "layout": "standalone"},
  "DoctorReferralPortal": {"route": "/r/:id", "access": "public-signed-token", "allowedRoles": [], "requiredModule": None, "layout": "standalone"},
  "SharedStudyPage": {"route": "/share/:token", "access": "public-signed-token", "allowedRoles": [], "requiredModule": None, "layout": "standalone"},
  "WaitingAreaBoard": {"route": "/waiting-board", "access": "public", "allowedRoles": [], "requiredModule": None, "layout": "standalone"},
  "DicomViewerPage": {"route": "/dicom-viewer", "access": "protected", "allowedRoles": ["admindoctor","admin","doctor","technician","receptionist","accountant"], "requiredModule": "PACS", "layout": "standalone (outside AppLayout)"},
  "AdminBoard": {"route": "/admin-board", "access": "protected", "allowedRoles": ["admindoctor","admin"], "requiredModule": None, "layout": "AppLayout"},
  "SettingsHomePage": {"route": "/settings", "access": "protected-authOnly", "allowedRoles": [], "requiredModule": None, "layout": "AppLayout"},
  "ActiveSessionsPage": {"route": "/settings/sessions", "access": "protected-authOnly", "allowedRoles": [], "requiredModule": None, "layout": "AppLayout"},
  "SecuritySettingsPage": {"route": "/settings/security", "access": "protected-authOnly", "allowedRoles": [], "requiredModule": None, "layout": "AppLayout"},
  "SyncStatusPage": {"route": "/settings/sync", "access": "protected-authOnly", "allowedRoles": [], "requiredModule": None, "layout": "AppLayout"},
  "ReferralsPage": {"route": "/referrals", "access": "protected", "allowedRoles": ["admindoctor","admin"], "requiredModule": "RIS", "layout": "AppLayout"},
  "StaffPage": {"route": "/staff", "access": "protected", "allowedRoles": ["admindoctor","admin"], "requiredModule": None, "layout": "AppLayout"},
  "StaffDashboardPage": {"route": "/staff/dashboard", "access": "protected", "allowedRoles": ["admindoctor","admin"], "requiredModule": None, "layout": "AppLayout"},
  "AppointmentBoard": {"route": "/appointment-board", "access": "protected", "allowedRoles": ["admindoctor","admin","receptionist"], "requiredModule": "RIS", "layout": "AppLayout"},
  "TechnicianPage": {"route": "/technician", "access": "protected", "allowedRoles": ["admindoctor","technician"], "requiredModule": "RIS", "layout": "AppLayout"},
  "DoctorBoard": {"route": "/doctor-board", "access": "protected", "allowedRoles": ["admindoctor","doctor","technician"], "requiredModule": None, "layout": "AppLayout"},
  "BillingPage": {"route": "/billing", "access": "protected", "allowedRoles": ["admindoctor","admin","accountant"], "requiredModule": "RIS", "layout": "AppLayout"},
  "ViewerPage": {"route": "/viewer", "access": "protected", "allowedRoles": ["admindoctor","doctor","technician"], "requiredModule": "PACS", "layout": "AppLayout"},
  "ReportingPage": {"route": "/reporting/:id  and  /reporting?studyId=", "access": "protected", "allowedRoles": ["admindoctor","doctor","technician"], "requiredModule": "PACS (query-only /reporting variant)", "layout": "AppLayout"},
  "StudiesPage": {"route": "/studies", "access": "protected", "allowedRoles": ["admindoctor","admin","doctor","technician","receptionist"], "requiredModule": "PACS", "layout": "AppLayout"},
  "SubscriptionPage": {"route": "/subscription", "access": "protected", "allowedRoles": ["admindoctor","admin"], "requiredModule": None, "layout": "AppLayout"},
  "DicomBridgePage": {"route": "/dicom-bridge", "access": "protected", "allowedRoles": ["admindoctor","admin"], "requiredModule": "PACS", "layout": "AppLayout"},
  "ConfigurationPage": {"route": "/configuration", "access": "protected", "allowedRoles": ["admindoctor","admin","technician","doctor"], "requiredModule": None, "layout": "AppLayout"},
  "ApprovalsPage": {"route": "/approvals", "access": "protected", "allowedRoles": ["admindoctor","admin"], "requiredModule": None, "layout": "AppLayout"},
  "OperationsBoard": {"route": "/operations-board", "access": "protected", "allowedRoles": ["admindoctor","admin","receptionist","technician","doctor","accountant"], "requiredModule": None, "layout": "AppLayout"},
  "PatientTimelinePage": {"route": "/patient-timeline/:appointmentId", "access": "protected", "allowedRoles": ["admindoctor","doctor","technician"], "requiredModule": None, "layout": "AppLayout"},
}

pages = []

def load(name, raw):
    obj = json.loads(raw)
    if isinstance(obj, list):
        pages.extend(obj)
    else:
        pages.append(obj)

with open("__kb_data__.json", "r", encoding="utf-8") as f:
    all_data = json.load(f)
pages = all_data

for p in pages:
    meta = ROUTES.get(p["page"])
    if meta:
        ordered = {"page": p["page"], "file": p.get("file"),
                   "route": meta["route"], "access": meta["access"],
                   "allowedRoles": meta["allowedRoles"], "requiredModule": meta["requiredModule"],
                   "layout": meta["layout"]}
        for k, v in p.items():
            if k not in ("page", "file"):
                ordered[k] = v
        p.clear(); p.update(ordered)

pages.sort(key=lambda p: p["page"])
total_features = sum(len(p.get("features", [])) for p in pages)
all_eps = sorted({e for p in pages for e in p.get("apiEndpointsUsed", [])})

out = {
  "$schema": "easyrad-page-knowledge/v1",
  "meta": {
    "product": "EasyRad (1Rad) - radiology web app",
    "appName": "1rad",
    "source": "1Rad/easyrad/src (Vite + React)",
    "router": "src/routes/AppRouter.jsx",
    "generatedAt": datetime.date.today().isoformat(),
    "description": "Page-centric knowledge base of the EasyRad web app. Each page = a route; functions = every feature/action/dialog/filter and the backend API endpoints it calls. Generated by deep code analysis of each page component.",
    "totals": {"pages": len(pages), "features": total_features, "distinctApiEndpoints": len(all_eps)}
  },
  "pages": pages
}

with open("easyrad_knowledge.json", "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2, ensure_ascii=False)
print("pages:", len(pages), "features:", total_features, "endpoints:", len(all_eps))
print("missing meta:", [p["page"] for p in pages if p["page"] not in ROUTES])
