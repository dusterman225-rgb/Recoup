# Recoup (Firebase edition)

Finds the money a small business is losing and helps run the job side too. It watches for unpaid invoices, quotes nobody followed up, jobs running over budget, and expiring licenses. It ranks what to chase first and drafts the message. Nothing is sent unless the owner approves it.

Everything marked **free** below works on Firebase's free Spark plan with no card. Things marked **paid service** are fully written into the code but stay switched off until you set the service up (sections 5 to 8). They do nothing until then.

## What is in it

**Free, works now**
- Quotes and invoices with line items, tax, discount, numbering (Q-0001, INV-0001), your logo, terms and pay instructions. Print or save as PDF from the page.
- Customer signature on a quote (marks it won) and on change orders, drawn with a finger.
- Deposit, progress and balance invoices from a won quote. Change orders that raise the job's contract value, and can be invoiced.
- Price book that fills in lines as you type. Recurring invoices created for your review when you open the app.
- Jobs with profit so far, costs, time tracking (timer or manual), job photos, shopping/materials lists.
- Customers with history, request page for new leads, schedule with calendar export, mileage tracker.
- Subcontractors with a 1099 watch and W-9 flag, licenses and insurance with expiry warnings and certificate photos.
- Receipt photos with items, price tracker that compares what you paid at different suppliers (from receipts you confirmed, never guessed).
- Reports (profit, expenses by category, income by customer, profit by job, tax set-aside estimate), CSV exports, 30-day cash flow, search, backup and restore.
- Ready to send queue with copy, open in email or texts, and "I sent it".
- Optional AI with the owner's own free Gemini key: reads receipts, rewords reminders, explains findings, drafts quote lines (prices only from your price book).

**Paid services (built in, off until configured)**
| Feature | Flag in `public/firebase-config.js` | Needs |
|---|---|---|
| Approve and send emails | `sendEmail` | Blaze plan + Resend (section 5) |
| Approve and send texts | `sendSms` | Blaze plan + Twilio (section 5) |
| Card payment link on invoices | `payments` | Blaze plan + Stripe (section 6) |
| Weekly summary email | `digest` | Blaze plan + Resend (section 7) |
| Live price lookup | `priceApi` | Blaze plan + a price data provider (section 8) |

QuickBooks is not connected. Reports give CSV files that QuickBooks and most accountants can import.

## Testing status (honest)
Tested here with a stand-in Firebase in a real browser: sign-in, setup, quotes with tax math, signatures, deposits, change orders, job profit and time, receipts and price tips, reports and CSV, schedule and calendar file, mileage, subcontractors, licenses, price book, recurring invoices, search, backup, request page, AI drafting with a stand-in Gemini, approve-and-send flow. 23 logic tests (`tests/lib.test.mjs`) and 23 server tests (`cd functions && npm test`) pass.
**Not yet run against real Firebase, Resend, Twilio, Stripe or Gemini.** Expect small fixes on first contact with each.

## 1. Create the Firebase project (about 10 minutes, no card needed)

1. Go to https://console.firebase.google.com and choose **Add project**. Name it `recoup`. Turn Google Analytics off.
2. **Build > Authentication > Get started.** Turn on **Email/Password**. Turn on **Google** too if you want that button (pick a support email).
3. **Build > Firestore Database > Create database.** Choose a location near you. Start in **production mode**.
4. **Project settings (gear) > Your apps > Web (`</>`).** Register an app named `recoup`. Copy the config values it shows.
5. Open `public/firebase-config.js` and paste those values over the `PASTE_...` placeholders. These values are not secrets.

Receipt photos are stored inside the Firestore record, so you do not need Cloud Storage. Cloud Storage needs a paid plan.

## 2. Put it on GitHub

Create an empty repository on GitHub, then upload these files (GitHub's **Add file > Upload files** works) or push from a computer.

## 3. Deploy without Termux: GitHub Codespaces

1. In your repository choose **Code > Codespaces > Create codespace on main**. A code editor opens in the browser.
2. In its terminal run:
   ```
   npm install -g firebase-tools
   firebase login --no-localhost
   firebase use --add        # pick your project, give it the alias "default"
   firebase deploy
   ```
3. The last command prints your live address, like `https://recoup-xxxxx.web.app`. Open it on your phone and create an account.

`firebase deploy` also publishes `firestore.rules`. Until you finish section 5, deploy with `firebase deploy --only hosting,firestore` instead. The full command also tries to deploy the sending function, which needs the paid plan.

`firestore.rules` is published by that command too. Those rules let each signed-in person read and write only their own records.

To redeploy after changes, run `firebase deploy` again.

## 4. Turn on the AI helper (optional)

1. Each owner creates a free key at https://aistudio.google.com/apikey.
2. In Recoup, go to **More > AI helper**, paste the key, tap **Save**, then **Test key**.

The key stays in that browser and is sent only to Google. It is never saved in Firebase. If Google renames the model, change the model name on the same screen.

What the AI can do: read a receipt photo into the form for the owner to check, reword a drafted reminder (rejected automatically if any amount, number or date changes), and explain why something was flagged. It never marks anything as fixed.

## 5. Turn on Approve and send (needs the paid Blaze plan)

Out of the box, the **Ready to send** screen drafts each reminder and quote follow-up, and the owner copies it and sends it from their own email. To let Recoup send the email after the owner taps one button:

1. In the Firebase console, upgrade the project to the **Blaze** plan (pay as you go, a card is required). Set a budget alert at $5 so a surprise can't grow.
2. Create an account at https://resend.com, add and verify your sending domain, and create an API key.
3. In the Codespaces terminal:
   ```
   cd functions && npm install && npm test && cd ..
   cp functions/.env.example functions/.env      # then edit it: FROM_ADDRESS=notifications@your-domain.com
   firebase functions:secrets:set RESEND_API_KEY   # paste the Resend key when asked
   firebase deploy
   ```
4. In `public/firebase-config.js` set `sendEmail: true` and run `firebase deploy --only hosting`.

How it stays safe:
- The owner reads and approves every message. Nothing sends by itself.
- The server checks each message again before sending: the address must belong to a saved customer, and the invoice must still be unpaid (or the quote still open).
- At most 25 emails a day per business. Anything refused shows as "Not sent" with the reason.
- Replies go straight to the owner's own email address.
- Approved messages cannot be edited or deleted afterward, so the log is reliable.
- After an email is sent, the follow-up clock restarts, so the same customer is not nagged for 7 days.

Check the laws that apply to you before sending collection reminders to customers. Rules differ by country and state. This is not legal advice.

The checks the server runs are covered by tests (`cd functions && npm test`). The function itself and the Resend connection have not been run against real services.


## 5b. Text messages (paid: Twilio)
1. Create a Twilio account, get a phone number, and complete US carrier registration for business texting (Twilio walks you through it; it takes days).
2. ```
   firebase functions:secrets:set TWILIO_ACCOUNT_SID
   firebase functions:secrets:set TWILIO_AUTH_TOKEN
   ```
   Add `TWILIO_FROM_NUMBER=+1555...` to `functions/.env`, then `firebase deploy`.
3. Set `sendSms: true` in `public/firebase-config.js`, `firebase deploy --only hosting`.
Texts go only to customers marked "agreed to receive text messages" on their page, and the server checks that again. Texting laws (TCPA in the US) are strict about consent. Check yours.

## 6. Card payments on invoices (paid: Stripe)
1. Create a Stripe account and get a secret key.
2. `firebase functions:secrets:set STRIPE_SECRET_KEY`, then `firebase deploy`. Copy the `stripeWebhook` URL it prints.
3. In Stripe, add a webhook for `checkout.session.completed` pointing at that URL. Put its signing secret in with `firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`, then `firebase deploy` again.
4. Set `payments: true`. Each unpaid invoice gets a **Card payment link** button. When the customer pays, the invoice is marked paid automatically. The amount always comes from the saved invoice, and the webhook signature is verified (tested).
Stripe charges its own fees. Until this is set up, the free alternative is to paste any Venmo, Square or PayPal link in **Business details**. It is added to invoices and reminders.

## 7. Weekly summary email (paid: Resend)
Uses the same Resend setup as section 5. Owners switch it on in **Business details**. Set `digest: true`, then `firebase deploy`. It sends Monday 8am Pacific, only when there is something to report.

## 8. Live price lookup (paid: a price data provider)
`lookupPrice` in `functions/index.js` is a placeholder. Choose a provider (a retail price API), put its key in with `firebase functions:secrets:set PRICE_API_KEY`, fill in the function, then set `priceApi: true`. Results are shown as **estimates** with the store and date, and always next to what the owner actually paid.

## Quote request page
In **More > Requests**, turn the page on and share the link (`/request.html?b=...`). Requests land in the Requests inbox. The rules only allow creating a request while the page is on, with fixed fields and size limits. Add Firebase App Check before sharing widely, to cut spam.

## Notes before real customers

- Add your domain under **Authentication > Settings > Authorized domains** if you use your own.
- Add Firebase App Check before opening sign-up to the public.
- A server-side AI key with credits is not built yet. For now each owner uses their own Gemini key.
- Quotes, jobs, invoices, costs and customers live in one record per person (Firestore limit 1 MB). That is plenty for a small business. Photos, receipts, certificates and leads are stored as separate records. Split the main record before heavy use.
