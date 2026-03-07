require('dotenv').config();

module.exports = {
  resy: {
    apiKey: process.env.RESY_API_KEY,
    authToken: process.env.RESY_AUTH_TOKEN,
    paymentMethodId: parseInt(process.env.RESY_PAYMENT_METHOD_ID, 10),
  },
  email: {
    from: process.env.EMAIL_FROM,
    to: process.env.EMAIL_TO,
    password: process.env.EMAIL_PASSWORD,
  },
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES, 10) || 2,
  autoBook: process.env.AUTO_BOOK === 'true',
};
