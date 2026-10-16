// The placeholder provider until a payment company is chosen. The order is
// placed as Payment Pending, the shop is emailed, and payment is arranged
// directly with the customer. The admin then marks the order paid by hand.
module.exports = {
  name: 'manual',
  paymentMethod: 'Manual',

  async startPayment(order) {
    return { mode: 'manual', reference: `manual-${order.id}` };
  },

  // Nothing to verify remotely: only the admin can mark a manual order paid.
  async verifyPayment() {
    return { paid: false, status: 'awaiting_manual_payment' };
  }

  // No handleWebhook: there is no remote party to call us back.
};
