// Outbound email through Resend's HTTP API. Node 22 ships fetch, so there is no
// SDK to install.
//
// Best effort, like storage.deleteByUrls: every caller has already saved its
// data before mailing, so a Resend outage or a missing key must never turn a
// stored order or message into a failed request. Failures are logged instead.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const adminAddress = () => process.env.ADMIN_NOTIFY_EMAIL || 'admin@tehilalevi.com';
// onboarding@resend.dev works before the domain is verified, but Resend only
// delivers it to the account owner's own address. Set MAIL_FROM for production.
const fromAddress = () => process.env.MAIL_FROM || 'Tehila Levi <onboarding@resend.dev>';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const formatUSD = (amount) => usd.format(Number(amount) || 0);

const send = async ({ subject, html, text, replyTo }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`RESEND_API_KEY is not set - skipping email "${subject}"`);
    return false;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [adminAddress()],
        subject,
        html,
        text,
        ...(replyTo ? { reply_to: replyTo } : {})
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`Resend rejected "${subject}" (${response.status}): ${body}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Failed to send "${subject}":`, error.message);
    return false;
  }
};

// Shared shell so both notifications look like they come from the same shop.
const layout = (title, bodyHtml) => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f4ef;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e6dfcf;padding:32px">
    <p style="margin:0 0 4px;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#8a6f3e">Tehila Levi</p>
    <h1 style="margin:0 0 24px;font-size:22px;font-weight:normal">${escapeHtml(title)}</h1>
    ${bodyHtml}
  </div>
</body></html>`;

const row = (label, valueHtml) =>
  `<tr><td style="padding:4px 16px 4px 0;color:#777;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0">${valueHtml}</td></tr>`;

const sectionHeading = (label) =>
  `<h2 style="font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:#8a6f3e;margin:0 0 8px">${escapeHtml(label)}</h2>`;

const sendContactNotification = ({ name, email, subject, message }) => {
  const html = layout(
    `New inquiry: ${subject}`,
    `<table style="border-collapse:collapse;font-size:14px;margin-bottom:24px">
      ${row('Name', escapeHtml(name))}
      ${row('Email', `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`)}
      ${row('Subject', escapeHtml(subject))}
    </table>
    <div style="white-space:pre-wrap;font-size:14px;line-height:1.6;border-top:1px solid #eee;padding-top:16px">${escapeHtml(message)}</div>
    <p style="margin-top:24px;font-size:12px;color:#999">Reply to this email to answer ${escapeHtml(name)} directly.</p>`
  );

  const text = `New inquiry from the website\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}\n`;

  // reply_to is the customer, so answering from the inbox reaches them.
  return send({ subject: `[Contact] ${subject} - ${name}`, html, text, replyTo: email });
};

const sendOrderNotification = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const created = new Date(order.createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC'
  });
  const addressLines = [
    order.address,
    [order.city, order.postalCode].filter(Boolean).join(' '),
    order.country
  ].filter(Boolean);
  const itemName = (item) =>
    item.name || (item.productId ? `Product #${item.productId}` : 'Deleted product');

  const itemRows = items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(itemName(item))}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">${formatUSD(item.unitPrice)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatUSD(item.unitPrice * item.quantity)}</td>
      </tr>`
    )
    .join('');

  const adminUrl = process.env.ADMIN_URL;
  const html = layout(
    `New order #${order.id}`,
    `<table style="border-collapse:collapse;font-size:14px;margin-bottom:24px">
      ${row('Placed', `${escapeHtml(created)} UTC`)}
      ${row('Payment', `${escapeHtml(order.paymentStatus)} (${escapeHtml(order.paymentMethod)})`)}
      ${row('Total', `<strong>${formatUSD(order.totalAmount)}</strong>`)}
    </table>

    ${sectionHeading('Buyer')}
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:24px">
      ${row('Name', escapeHtml(order.fullName))}
      ${row('Email', order.email ? `<a href="mailto:${escapeHtml(order.email)}">${escapeHtml(order.email)}</a>` : '-')}
      ${row('Phone', `<a href="tel:${escapeHtml(order.phone)}">${escapeHtml(order.phone)}</a>`)}
      ${row('Address', addressLines.map(escapeHtml).join('<br>'))}
    </table>

    ${sectionHeading('Items')}
    <table style="border-collapse:collapse;font-size:14px;width:100%">
      <tr style="color:#777;font-size:12px">
        <th style="text-align:left;padding:4px 0">Product</th>
        <th style="padding:4px 8px">Qty</th>
        <th style="text-align:right;padding:4px 8px">Unit</th>
        <th style="text-align:right;padding:4px 0">Line total</th>
      </tr>
      ${itemRows}
      <tr>
        <td colspan="3" style="padding:12px 8px 0 0;text-align:right"><strong>Total</strong></td>
        <td style="padding:12px 0 0;text-align:right"><strong>${formatUSD(order.totalAmount)}</strong></td>
      </tr>
    </table>
    ${
      adminUrl
        ? `<p style="margin-top:28px"><a href="${escapeHtml(adminUrl.replace(/\/$/, ''))}/logistics" style="color:#8a6f3e">Open in the admin dashboard</a></p>`
        : ''
    }`
  );

  const text = [
    `New order #${order.id}`,
    `Placed: ${created} UTC`,
    `Payment: ${order.paymentStatus} (${order.paymentMethod})`,
    '',
    'Buyer',
    `  ${order.fullName}`,
    `  ${order.email || '-'}`,
    `  ${order.phone}`,
    ...addressLines.map((line) => `  ${line}`),
    '',
    'Items',
    ...items.map(
      (item) =>
        `  ${item.quantity} x ${itemName(item)} @ ${formatUSD(item.unitPrice)} = ${formatUSD(item.unitPrice * item.quantity)}`
    ),
    '',
    `Total: ${formatUSD(order.totalAmount)}`
  ].join('\n');

  return send({
    subject: `New order #${order.id} - ${order.fullName} - ${formatUSD(order.totalAmount)}`,
    html,
    text,
    replyTo: order.email || undefined
  });
};

// Callers await these after their data is committed, so even a bug in building
// the message must not surface as a failed request.
const neverThrow = (label, fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    console.error(`${label} failed:`, error);
    return false;
  }
};

module.exports = {
  sendContactNotification: neverThrow('Contact notification', sendContactNotification),
  sendOrderNotification: neverThrow('Order notification', sendOrderNotification),
  escapeHtml
};
