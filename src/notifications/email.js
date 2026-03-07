const nodemailer = require('nodemailer');
const config = require('../config');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.email.from,
    pass: config.email.password,
  },
});

function formatSlot(slot, watch) {
  const time = slot.date?.start?.split(' ')[1]?.substring(0, 5) || 'unknown';
  const seatType = slot.config?.type || 'unknown';
  const gda = slot.is_global_dining_access ? ' [GDA]' : '';
  const fee = slot.payment?.cancellation_fee
    ? ` | Cancel fee: $${slot.payment.cancellation_fee}`
    : '';
  const qty = slot.quantity ? ` | ${slot.quantity} left` : '';
  return `  ${time} — ${seatType}${gda}${fee}${qty}`;
}

function buildResyLink(watch, date) {
  const slug = watch.urlSlug || watch.venueName?.toLowerCase().replace(/\s+/g, '-') || '';
  return `https://resy.com/cities/new-york-ny/${slug}?date=${date}&seats=${watch.partySize}`;
}

async function sendSlotAlert(watch, slots, date) {
  const slotLines = slots.map((s) => formatSlot(s, watch)).join('\n');
  const link = buildResyLink(watch, date);

  const html = `
    <h2>${watch.venueName} — New Availability</h2>
    <p><strong>Date:</strong> ${date}</p>
    <p><strong>Party size:</strong> ${watch.partySize}</p>
    <h3>Available Slots:</h3>
    <pre>${slotLines}</pre>
    <p><a href="${link}">Book on Resy</a></p>
  `;

  await transporter.sendMail({
    from: config.email.from,
    to: config.email.to,
    subject: `Reservation Available: ${watch.venueName} on ${date}`,
    html,
  });
}

async function sendBookingConfirmation(watch, slot, date) {
  const time = slot.date?.start?.split(' ')[1]?.substring(0, 5) || 'unknown';
  const seatType = slot.config?.type || 'unknown';

  const html = `
    <h2>Auto-Booked: ${watch.venueName}</h2>
    <p><strong>Date:</strong> ${date}</p>
    <p><strong>Time:</strong> ${time}</p>
    <p><strong>Seat type:</strong> ${seatType}</p>
    <p><strong>Party size:</strong> ${watch.partySize}</p>
    <p>${slot.is_global_dining_access ? 'This is a Global Dining Access reservation.' : ''}</p>
    ${slot.payment?.cancellation_fee ? `<p>Cancellation fee: $${slot.payment.cancellation_fee}</p>` : ''}
  `;

  await transporter.sendMail({
    from: config.email.from,
    to: config.email.to,
    subject: `AUTO-BOOKED: ${watch.venueName} on ${date} at ${time}`,
    html,
  });
}

module.exports = { sendSlotAlert, sendBookingConfirmation };
