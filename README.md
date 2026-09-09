# Praksh Collection Loyalty Website — corrected

This package keeps the original customer design and removes the owner dashboard from the customer page.

## Files
- index.html — customer portal only
- style.css — original styling retained
- app.js — customer + API calls
- owner-login.html — separate owner login
- owner.html — private owner dashboard
- Code.gs — Google Apps Script backend

## Setup
1. In Google Apps Script, replace the existing backend with Code.gs.
2. Run `setup()` once and authorize it.
3. In Script Properties, change OWNER_USERNAME and OWNER_PASSWORD from the defaults.
4. Deploy as Web App, Execute as Me. Use an access setting appropriate for your business.
5. Copy the Web App URL into API_URL at the top of app.js.
6. Upload all HTML/CSS/JS files together to your hosting.
7. Customers use index.html. Owner uses owner-login.html.

The Web App URL must be the deployed URL ending in `/exec`, not the Apps Script
editor URL or the `/dev` test URL. If the URL is left as the placeholder in
app.js, the pages will show the connection error intentionally.

## Bill flow
Customer submits bill -> Pending -> Owner opens owner.html -> checks bill -> Approve or Reject -> Approved bills receive floor(amount / 999) points. Pending bills receive 0 points.

## Important
The customer page contains no owner dashboard or owner controls. Owner approval is performed through authenticated Apps Script actions. Do not put the owner password in frontend files.
