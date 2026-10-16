// Paste your Firebase web app settings here (Firebase console > Project settings > Your apps > Web app).
Export const firebaseConfig = {
  apiKey: "AIzaSyDgsqIR6Lz8YLuWH3JV-GRvPGtFuBlbSkk",
  authDomain: "recoup-fb2fd.firebaseapp.com",
  projectId: "recoup-fb2fd",
  storageBucket: "recoup-fb2fd.firebasestorage.app",
  messagingSenderId: "405800204359",
  appId: "1:405800204359:web:3120f4ec35090db3721962"
};

// Paid services. Everything here is built into the code but stays OFF until you set the service up (README sections 5 to 8).
// Turning a flag on before the service is set up just makes the matching button fail with a friendly message.
export const features = {
  sendEmail: false,  // approve-and-send emails (Blaze plan + Resend)
  sendSms: false,    // approve-and-send texts (Blaze plan + Twilio)
  payments: false,   // card payment links on invoices (Blaze plan + Stripe)
  digest: false,     // weekly summary email to you (Blaze plan + Resend)
  priceApi: false    // live price lookup at other stores (Blaze plan + a price data provider)
};
  
