// Built on first use rather than at require() time: the Stripe constructor
// throws when the key is missing, which used to take the whole server down at
// boot instead of failing only this endpoint.
let stripeClient;
const getStripe = () => {
  if (!process.env.STRIPE_SECRET_KEY) {
    const error = new Error('Stripe is not configured');
    error.status = 503;
    throw error;
  }
  if (!stripeClient) stripeClient = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
};

exports.createPaymentIntent = async (req, res, next) => {
  try {
    const stripe = getStripe();
    const { amount, currency } = req.body;

    if (!amount) {
        return res.status(400).json({ success: false, message: 'Amount is required' });
    }

    // Create a PaymentIntent with the order amount and currency
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents if amount is in dollars
      currency: currency || 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
    });

    res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret
    });
  } catch (error) {
    next(error);
  }
};
