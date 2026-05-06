# 🚀 Enterprise Assessment & Quiz Management System

## 📖 Project Overview
A fully custom, scalable, and secure Assessment System built using Google Apps Script. This application serves as an end-to-end testing platform, featuring a robust Admin Dashboard for analytics and a secure, cheat-resistant frontend for test-takers. It eliminates the need for expensive third-party testing software by turning Google Sheets into a powerful, real-time relational database.

## ✨ Core Features

### 🛡️ For Test-Takers (Secure Assessment UI)
* **Smart Pagination:** Questions are served one at a time to reduce cognitive overload, with a final "Review Screen" before submission to catch missed questions.
* **Memory-Locked Timer:** A secure, server-synced countdown timer. If a user tries to cheat by closing or refreshing the tab, the timer stores the exact "End Time" in their browser cache and continues counting down in the background.
* **Smart Retake Engine:** Automatically calculates remaining attempts. If a user passes, it warns them before they burn an extra attempt.
* **Responsive UI:** A clean, Google Forms-inspired design that works flawlessly on desktop and mobile.

### 📊 For Administrators (Analytics Dashboard)
* **Omni-Scanner Authorization:** Advanced role-based access control (RBAC). The system dynamically scans the database to grant Admin, Creator, or Collaborator permissions seamlessly.
* **Item Analysis Engine:** Automatically calculates the Pass/Fail rate of *every individual question* and identifies the most frequently chosen wrong answers (distractors) to help improve test quality.
* **Pass Rate by Attempt Analytics:** Tracks user conversion rates to see if takers are learning from their mistakes on their 2nd or 3rd attempts.
* **Exception Management:** Admins can grant +1 Bonus Attempts or selectively delete specific response rows directly from the UI without touching the database.

### 💾 Data Integrity & Portability
* **Bulletproof CSV Deduplication:** Admins can bulk-import Google Forms CSVs. The system converts raw text to Unix timestamps and checks a unique fingerprint (Email + Minute + Score) to guarantee zero duplicate records.
* **Timezone Normalization:** Automatically converts and standardizes timestamps across different global timezones.
* **1-Click Exports:** Export raw data, overall results, item analysis, or database backups to CSV with a single click.
* **Google Forms Auto-Import:** Instantly convert existing Google Forms into this platform, pulling in all historical responses, questions, and answer keys automatically.

---

## 🛠️ Tech Stack & Architecture
To keep the application highly performant and maintainable, the codebase is modularized into 6 distinct files:

* **Backend / Server:** Google Apps Script (ES6 JavaScript)
  * `Code.gs`: The main routing engine (handling the `doGet` URL parameters) and external integrations like the Google Forms Auto-Importer.
  * `Database.gs`: The core database manager handling all CRUD (Create, Read, Update, Delete) operations, caching, and role-based access checks.
* **Frontend / Client:** HTML5, CSS3, Vanilla JavaScript
  * `Index.html`: The master layout and container for the Single Page Application (SPA).
  * `JavaScript.html`: The heavy-lifting logic engine containing the assessment pagination, timer logic, analytics math, and DOM manipulation.
  * `Stylesheet.html`: Custom, responsive CSS built around Google's Material Design principles.
  * `Modal.html`: Contains the structural HTML for all pop-ups (Creation, Settings, Sharing, and Admin Management).

---

## 🗄️ Database Schema (Google Sheets NoSQL Setup)
The system uses Google Sheets as a lightweight, real-time database, separated into 3 relational tables. To deploy this system yourself, create a blank Google Sheet, add three tabs at the bottom, and configure Row 1 of each tab with these exact headers:

### Tab 1: `Quizzes` (The Configuration Table)
Stores the master data for every assessment.
* **A:** Quiz ID
* **B:** Title
* **C:** Settings JSON
* **D:** Questions JSON
* **E:** Creation Date
* **F:** Creator Email
* **G:** Collaborators

### Tab 2: `Responses` (The Submissions Table)
Stores every individual attempt from the test-takers.
* **A:** Quiz ID
* **B:** Respondent Email
* **C:** Answers JSON
* **D:** Score
* **E:** Date Submitted

### Tab 3: `Admins` (The Access Control Table)
Stores the global list of users with system-wide administrative privileges.
* **A:** Admin Email
* **B:** Added By
* **C:** Date Added

---

## ⚙️ Deployment Guide
1. Go to [Google Sheets](https://sheets.google.com) and create a new blank spreadsheet.
2. Setup your 3 tabs (`Quizzes`, `Responses`, `Admins`) as outlined in the schema above.
3. Click **Extensions > Apps Script**.
4. Create the 6 files listed in this repository (save `.gs` files as Apps Script files, and `.html` files as HTML files).
5. Paste the corresponding code into each file and hit Save.
6. Click **Deploy > New Deployment** in the top right corner.
7. Select the gear icon ⚙️ and choose **Web App**.
8. Set **Execute as** to `Me` and **Who has access** to `Anyone within your organization` (or `Anyone` if testing publicly).
9. Click **Deploy** to generate your live Assessment Dashboard URL!

---

## ⚠️ Important Deployment & Usage Notes

### Authentication & Access Control
This application relies on Google's built-in OAuth "bouncer" to authenticate users and capture their email addresses securely. You do not need to build a custom login screen. 
* When deploying the Web App, you **must** set *Who has access* to `Anyone within your organization` (or `Anyone with a Google Account`). 
* If an unauthenticated user clicks the assessment link, Google will automatically redirect them to a secure login page before allowing access to the application.
* **Do not** set access to `Anyone` (Anonymous), or the system will be unable to capture respondent emails for grading.

### Known Issue: The "Multi-Account" Conflict
Because of how Google Apps Script handles active sessions, users who are logged into multiple Google accounts simultaneously (e.g., a personal `@gmail.com` and a corporate `@company.com` account in the same browser) may encounter an **"Access Denied"** error.

**The Fix:** Instruct your test-takers to complete the assessment using one of the following methods:
1. Use a dedicated Work/Corporate Chrome Profile.
2. Open the assessment link in an **Incognito / Private Browsing** window and log in strictly with their required organizational credentials.
