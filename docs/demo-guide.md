# Demo guide

A five-minute walk through DamuLink on the demo server (https://dl.anselmelly.com). All people, facilities and numbers are invented. No SMS or email reaches anyone real.

**Password for every demo account: `<PASSWORD>`** (given with the submission; it is not kept in git).

| Role | Sign in with |
|---|---|
| Donor | `donor1@demo.example` |
| Facility admin | `admin.rift-county-hospital@demo.example` plus the Rift County Hospital facility code |
| Facility attendant | `attendant.rift-county-hospital@demo.example` plus the same facility code |

The facility code is in `demo-accounts.txt` on the server. On the log-in page open "Signing in to a facility? Add its code". Use a private window per role so the sessions do not mix.

## 1. See what the public sees (no login)

1. Open the home page, then **Calls for blood**. Open the live call for Rift County Hospital: it shows the blood type, the facility and a share button, and never the patient.
2. Open **Blood drives** and a drive page, with its QR code and "I am interested" button.

## 2. A family asks for blood (donor account)

1. Sign in as `donor1@demo.example`. Open **Donation appeal** and send a request to Rift County Hospital for a patient (fictional details).
2. Open **My requests** to follow its status.

## 3. The facility checks and publishes (attendant, then admin)

1. Sign in as the attendant with the facility code. Open **Requests**, the new request, then confirm it with the blood type and units.
2. Sign in as the facility admin (or an approver) and approve it.
3. Open the approved request and **Publish a call**: choose the accepted types, urgency and wording. The call goes public and matching donors are texted in rings: your own facility's donors first, then nearby, then the wider area.

## 4. The donor says yes

1. As a donor, open **Calls for you**: calls that fit the donor's blood type and nearby facilities. Tap **Yes, I can donate**. This is the same as replying YES to the SMS.
2. As the attendant, open the call: the donor's yes appears (and only now the donor's number). Schedule them for a time.

## 5. The visit

1. As the attendant, open **Check in** and enter the donor's code (`DL-XXXX-XX` on the donor's dashboard). Record the outcome (donated, deferred, no-show) with the screening readings.
2. The donor's dashboard updates: last donation, next eligible date, and a donation record.

## 6. Blood drives

1. As the admin, open **Blood drives**, create a drive, then publish it. The share card and QR code are ready to post.
2. On the day, open the drive's tracker: mark who arrived, close the drive, and download the summary as CSV.

## 7. The platform side (super admin)

Super admin access is not part of the demo logins. If you were given it: the dashboard shows what needs attention, the **Verification queue** approves new facilities, **Misuse** shows people flagged for repeated rejected requests or no-shows (suspend or clear), and the **Audit log** records who did what.

## Reset

If the data gets messy, re-run the seeder (see `deploy/README.md`). It skips what already exists, so it never touches real records.
