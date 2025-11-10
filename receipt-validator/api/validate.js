// Serverless function to validate App Store receipts
// Deploy to Vercel for free receipt validation
// TEMPORARY WORKAROUND - Remove once com.luiz.PandaApp.lifetime is restored in App Store Connect

const https = require('https');

// Apple's receipt validation endpoints
const PRODUCTION_URL = 'https://buy.itunes.apple.com/verifyReceipt';
const SANDBOX_URL = 'https://sandbox.itunes.apple.com/verifyReceipt';

// Validate receipt with Apple's API
function validateReceipt(receiptData, isSandbox = false) {
  return new Promise((resolve, reject) => {
    const url = isSandbox ? SANDBOX_URL : PRODUCTION_URL;
    const postData = JSON.stringify({
      'receipt-data': receiptData,
      'password': '', // Leave empty - we don't need auto-renewable subscription validation
      'exclude-old-transactions': false // IMPORTANT: Include old transactions (deleted product IDs)
    });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };

    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Check if user has lifetime purchase in receipt
function hasLifetimePurchase(receipt) {
  if (!receipt || !receipt.in_app) return false;

  // Look for any product ID containing "lifetime"
  const lifetimeProducts = [
    'com.luiz.PandaApp.lifetime',
    'com.luiz.PandaApp.lifetime.v2'
  ];

  for (const purchase of receipt.in_app) {
    const productId = purchase.product_id;

    // Check exact matches
    if (lifetimeProducts.includes(productId)) {
      // Ensure not refunded
      if (!purchase.cancellation_date) {
        return true;
      }
    }

    // Check wildcard (any product with "lifetime" in the name)
    if (productId && productId.includes('lifetime') && !purchase.cancellation_date) {
      return true;
    }
  }

  return false;
}

// Main serverless function handler
module.exports = async (req, res) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get receipt data from request
  const { receiptData } = req.body;

  if (!receiptData) {
    return res.status(400).json({ error: 'Missing receipt data' });
  }

  try {
    // Try production first
    let result = await validateReceipt(receiptData, false);

    // If sandbox receipt, retry with sandbox endpoint
    if (result.status === 21007) {
      result = await validateReceipt(receiptData, true);
    }

    // Check validation status
    if (result.status !== 0) {
      return res.status(400).json({
        success: false,
        error: `Apple validation failed with status ${result.status}`,
        status: result.status
      });
    }

    // Check for lifetime purchase
    const hasLifetime = hasLifetimePurchase(result.receipt);

    // Return result
    return res.status(200).json({
      success: true,
      hasLifetime,
      environment: result.environment || 'Production',
      // Include purchase details for debugging (remove in production if sensitive)
      purchases: result.receipt.in_app?.map(p => ({
        productId: p.product_id,
        transactionId: p.transaction_id,
        purchaseDate: p.purchase_date,
        cancelled: !!p.cancellation_date
      }))
    });

  } catch (error) {
    console.error('Receipt validation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    });
  }
};
