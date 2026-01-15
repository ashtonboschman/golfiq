# Stripe Setup Guide

This guide walks you through setting up Stripe for the subscription system.

## Prerequisites

- A Stripe account (create one at https://stripe.com)
- Access to your Stripe Dashboard

## Step 1: Get API Keys

1. Log in to your Stripe Dashboard
2. Click on "Developers" in the left sidebar
3. Click on "API keys"
4. You'll see two keys:
   - **Publishable key** (starts with `pk_test_` for test mode or `pk_live_` for live mode)
   - **Secret key** (starts with `sk_test_` for test mode or `sk_live_` for live mode)
5. Copy both keys and add them to your `.env` file:
   ```
   STRIPE_SECRET_KEY="sk_test_YOUR_SECRET_KEY"
   STRIPE_PUBLISHABLE_KEY="pk_test_YOUR_PUBLISHABLE_KEY"
   ```

## Step 2: Create Products and Prices

### Create Premium Monthly Subscription

1. In Stripe Dashboard, go to "Products" → "Add product"
2. Enter product details:
   - **Name**: GolfIQ Premium Monthly
   - **Description**: Monthly subscription to GolfIQ Premium features
3. Click "Add pricing"
4. Enter pricing details:
   - **Pricing model**: Standard pricing
   - **Price**: $4.99
   - **Currency**: CAD
   - **Billing period**: Monthly
5. Click "Add product"
6. Copy the **Price ID** (starts with `price_`) and add to `.env`:
   ```
   STRIPE_PRICE_MONTHLY_CAD="price_YOUR_MONTHLY_PRICE_ID"
   ```

### Create Premium Annual Subscription

1. Go to "Products" → "Add product"
2. Enter product details:
   - **Name**: GolfIQ Premium Annual
   - **Description**: Annual subscription to GolfIQ Premium features (save 33%)
3. Click "Add pricing"
4. Enter pricing details:
   - **Pricing model**: Standard pricing
   - **Price**: $39.99
   - **Currency**: CAD
   - **Billing period**: Yearly
5. Click "Add product"
6. Copy the **Price ID** (starts with `price_`) and add to `.env`:
   ```
   STRIPE_PRICE_ANNUAL_CAD="price_YOUR_ANNUAL_PRICE_ID"
   ```

## Step 3: Set Up Webhooks

Webhooks are crucial for receiving real-time updates from Stripe about subscription changes.

### For Local Development (Using Stripe CLI)

1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
2. Log in to Stripe CLI:
   ```bash
   stripe login
   ```
3. Forward webhooks to your local server:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
4. Copy the webhook signing secret (starts with `whsec_`) and add to `.env`:
   ```
   STRIPE_WEBHOOK_SECRET="whsec_YOUR_WEBHOOK_SECRET"
   ```

### For Production

1. In Stripe Dashboard, go to "Developers" → "Webhooks"
2. Click "Add endpoint"
3. Enter your endpoint URL:
   ```
   https://yourdomain.com/api/webhooks/stripe
   ```
4. Select events to listen to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Click "Add endpoint"
6. Copy the **Signing secret** and add to your production `.env`:
   ```
   STRIPE_WEBHOOK_SECRET="whsec_YOUR_PRODUCTION_WEBHOOK_SECRET"
   ```

## Step 4: Configure Test Mode

During development, use Stripe's test mode:

1. Ensure you're in **Test mode** (toggle in top-right of Stripe Dashboard)
2. Use test card numbers for testing:
   - **Success**: `4242 4242 4242 4242`
   - **Requires authentication**: `4000 0025 0000 3155`
   - **Declined**: `4000 0000 0000 9995`
3. Use any future expiry date (e.g., 12/34)
4. Use any 3-digit CVC (e.g., 123)
5. Use any ZIP code (e.g., 12345)

## Step 5: Enable Customer Portal

The Customer Portal allows users to manage their subscriptions:

1. In Stripe Dashboard, go to "Settings" → "Billing" → "Customer portal"
2. Click "Activate test link" (or "Activate" for production)
3. Configure portal settings:
   - **Allow customers to**:
     - ✅ Update payment methods
     - ✅ Cancel subscriptions
     - ✅ Switch plans (if you want to allow monthly ↔ annual switching)
   - **Cancellation options**:
     - ✅ Cancel immediately
     - ✅ Cancel at end of billing period
4. Save settings

## Step 6: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```
2. Start Stripe webhook forwarding (in separate terminal):
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
3. Navigate to `/pricing` in your app
4. Click "Subscribe" on a plan
5. Use test card `4242 4242 4242 4242`
6. Complete checkout
7. Verify subscription appears in Stripe Dashboard
8. Verify your app database is updated with subscription details
9. Check webhook events in Stripe CLI output

## Step 7: Go Live

When ready for production:

1. Complete Stripe account verification
2. Switch to **Live mode** in Stripe Dashboard
3. Create new live products and prices (repeat Step 2)
4. Update `.env` with live API keys and price IDs
5. Set up production webhook endpoint (repeat Step 3)
6. Update `NEXT_PUBLIC_APP_URL` in `.env` to your production domain
7. Test with real card in production mode

## Environment Variables Summary

Your `.env` file should contain:

```env
# Stripe
STRIPE_SECRET_KEY="sk_test_..." # or sk_live_ for production
STRIPE_PUBLISHABLE_KEY="pk_test_..." # or pk_live_ for production
STRIPE_WEBHOOK_SECRET="whsec_..."

# Stripe Price IDs
STRIPE_PRICE_MONTHLY_CAD="price_..."
STRIPE_PRICE_ANNUAL_CAD="price_..."

# App URL
NEXT_PUBLIC_APP_URL="http://localhost:3000" # or your production URL
```

## Troubleshooting

### Webhooks not working

- Ensure Stripe CLI is running with correct forward URL
- Check webhook secret matches in `.env`
- Verify webhook endpoint is accessible
- Check Stripe Dashboard → Developers → Webhooks for failed attempts

### Checkout session not creating

- Verify price IDs are correct
- Check API keys are for the same mode (test/live)
- Ensure Stripe customer ID is valid
- Check server logs for errors

### Customer Portal errors

- Verify Customer Portal is activated
- Ensure customer has valid Stripe customer ID
- Check that subscription exists in Stripe

## Support

- Stripe Documentation: https://stripe.com/docs
- Stripe API Reference: https://stripe.com/docs/api
- Stripe CLI: https://stripe.com/docs/stripe-cli
