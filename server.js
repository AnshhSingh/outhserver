require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;


const {
  ZOHO_ACCOUNT_ID,
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_API_KEY
} = process.env;

let ZOHO_OAUTH_TOKEN = process.env.ZOHO_OAUTH_TOKEN;

app.use(cors());
app.use(express.json());

// Token refresh function
async function refreshZohoToken() {
  try {
    const response = await fetch('https://accounts.zoho.in/oauth/v2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: ZOHO_REFRESH_TOKEN,
        client_id: ZOHO_CLIENT_ID,
        client_secret: ZOHO_CLIENT_SECRET,
        grant_type: 'refresh_token'
      })
    });
    
    const data = await response.json();
    if (data.access_token) {
      ZOHO_OAUTH_TOKEN = data.access_token;
      console.log('Zoho token refreshed successfully');
      return true;
    }
    console.error('Token refresh failed:', data);
    return false;
  } catch (err) {
    console.error('Error refreshing token:', err);
    return false;
  }
}

// Middleware to check token
app.use('/api/create-payment-session', async (req, res, next) => {
  try {
    const refreshed = await refreshZohoToken();
    if (!refreshed) {
      console.error('Token refresh failed at:', new Date().toISOString());
      return res.status(401).json({ 
        error: 'Payment authentication failed - check server logs' 
      });
    }
    next();
  } catch (err) {
    console.error('Middleware error:', err);
    res.status(500).json({ error: 'Authentication system error' });
  }
});

// Payment session endpoint

app.post('/api/create-payment-session', async (req, res) => {
  try {
    const { 
      amount, 
      currency, 
      description, 
      invoice_number, 
      reference_number,
      customer_name,
      customer_email,
      customer_phone
    } = req.body;

  
    if (!amount || !currency || !description) {
      return res.status(400).json({ error: 'Missing required fields: amount, currency, or description' });
    }

    const body = {
      amount: parseFloat(amount).toFixed(2),
      currency: currency.toUpperCase(),
      description,
      invoice_number
    };

    // Add metadata if we have reference_number
    if (reference_number) {
      body.meta_data = [
        { key: "reference", value: reference_number }
      ];
      
      // Add customer info to metadata if available
      if (customer_name) {
        body.meta_data.push({ key: "customer", value: customer_name });
      }
    }

    console.log('Zoho Request Body:', JSON.stringify(body, null, 2));

    const zohoRes = await fetch(
      `https://payments.zoho.in/api/v1/paymentsessions?account_id=${ZOHO_ACCOUNT_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${ZOHO_OAUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

   
    const rawResponse = await zohoRes.text();
    console.log('Raw Zoho Response:', rawResponse);
    
    // Parser
    const data = JSON.parse(rawResponse);
    
    if (data.code !== 0) {
      console.error('Zoho API Error:', data);
      return res.status(400).json({ 
        error: data.message || 'Payment session creation failed',
        details: data
      });
    }
    
    res.json({ payments_session_id: data.payments_session.payments_session_id });
    
  } catch (err) {
    console.error('Server Error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

// Alternative API key-based implementation (if needed)
// Payment session endpoint
app.post('/api/create-payment-session', async (req, res) => {
  try {
    const { 
      amount, 
      currency, 
      description, 
      invoice_number, 
      reference_number,
      customer_name,
      customer_email,
      customer_phone
    } = req.body;

    // Validation - check customer details
    if (!customer_name || !customer_email || !customer_phone) {
      return res.status(400).json({ error: 'Missing customer details' });
    }

    const body = {
      amount: parseFloat(amount).toFixed(2),
      currency_code: currency.toUpperCase(), 
      description,
      invoice_number,
      reference_number,
      customer: { 
        name: customer_name,
        email: customer_email,
        phone: customer_phone
      }
   
    };

    console.log('Request body to Zoho:', JSON.stringify(body));

    const zohoRes = await fetch(
      `https://payments.zoho.in/api/v1/paymentsessions?account_id=${ZOHO_ACCOUNT_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Zoho-oauthtoken ${ZOHO_OAUTH_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );

    const data = await zohoRes.json();
    console.log('Zoho API Response:', JSON.stringify(data));
    
    if (!data.payments_session || !data.payments_session.payments_session_id) {
      console.error('Zoho API Error:', data);
      return res.status(400).json({ 
        error: data.message || 'Payment session creation failed',
        code: data.code || 'unknown'
      });
    }
    
    res.json({ payments_session_id: data.payments_session.payments_session_id });
    
  } catch (err) {
    console.error('Server Error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});