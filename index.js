const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const dotenv = require('dotenv');


dotenv.config();
const app = express();
const PORT = 3000;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

app.use(cors());
app.use(bodyParser.json());


app.get('/users', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM profiles');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).send('Server error');
    }
  });

  

  app.post('/create-payment', async (req, res) => {
    const url = 'https://api.oxapay.com/merchants/request/whitelabel';

    const data = {
        merchant: 'XZ758T-MFVYME-N77RV9-BFT0HC',
        amount: req.body.amount || 100,  // Get amount from request body
        currency: req.body.currency || 'USD',  // Get currency from request body
        payCurrency: req.body.payCurrency || 'TRX',  // Get payCurrency from request body
        lifeTime: req.body.lifeTime || 90,  // Get lifeTime from request body
        feePaidByPayer: req.body.feePaidByPayer || 1,  // Get feePaidByPayer from request body
        underPaidCover: req.body.underPaidCover || 10,  // Get underPaidCover from request body
        callbackUrl: req.body.callbackUrl || '',  // Get callbackUrl from request body
        description: req.body.description || 'Order #12345',  // Get description from request body
        orderId: req.body.orderId || 'ORD-12345',  // Get orderId from request body
        email: req.body.email || 'customer@example.com'  // Get email from request body
    };

    try {
        // Send payment request to the external API
        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        console.log('Payment request response:', response.data); 

        // Destructure necessary data from the response
        const {
          message,
          trackId,
          amount,
          currency,
          email,
          orderId,
          date,
          payDate,
          type,
          address,
          price,
          payAmount,
          receivedAmount,
          payCurrency,
          network,
          QRCode,
          rate
        } = response.data;

        // Try inserting payment details into the database
        try {
          const paymentResult = await pool.query(
            `INSERT INTO payments (paymentid, userid, merchantid, amount, currency, paymentgateway, paymentstatus) 
            VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING *`,
            [
              trackId, '12', '12', payAmount, payCurrency, address, message
            ]
          );
      
          // Send the response back to the front-end with the payment details
          res.json(response.data);

        } catch (err) {
          console.error('Error inserting payment:', err);
          res.status(500).send('Server error');
        }
    } catch (error) {
        console.error('Error occurred:', error.message, error.response ? error.response.data : '');
        res.status(500).json({
            error: 'Something went wrong',
            details: error.message,
            response: error.response ? error.response.data : 'No response data'
        });
    }
});


// // Callback route for payment success/failure notification
// app.post('/payment-callback', (req, res) => {
//     console.log('Callback received:', req.body); // Log to verify callback
//     const status = req.body.status; // Assume OxaPay sends payment status
//     const trackId = req.body.trackId;

//     if (status === 'Paid') {
//         console.log(`Payment with Track ID ${trackId} was successful.`);
//         res.redirect(`http://localhost:5173/success/${trackId}`);
//     } else {
//         console.log(`Payment with Track ID ${trackId} failed.`);
//         res.redirect(`http://localhost:5173/failure/${trackId}`);
//     }
// });


// Callback route for payment success/failure notification
app.post('/payment-callback', async (req, res) => {
    const {
      status,
      trackId,
      amount,
      currency,
      email,
      orderId,
      description,
      date,
      payDate,
      type,
      txID,
      price,
      payAmount,
      receivedAmount,
      payCurrency,
      network,
      rate
    } = req.body;
  
    console.log('Callback received:', req.body); // Log to verify callback
  
    try {
      // Insert payment details into the database
      const paymentResult = await pool.query(
        `INSERT INTO payments (paymentid, userid, merchantid, amount, currency, paymentgateway, paymentstatus) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
        RETURNING *`,
        [
           trackId,'12', '12', payAmount, payCurrency, txID, status
        ]
      );
  
      // Redirect to success or failure page based on status
      if (status === 'Paid') {
        console.log(`Payment with Track ID ${trackId} was successful.`);
        res.redirect(`http://localhost:5173/success/${trackId}`);
      } else {
        console.log(`Payment with Track ID ${trackId} failed.`);
        res.redirect(`http://localhost:5173/failure/${trackId}`);
      }
    } catch (err) {
      console.error('Error inserting payment:', err);
      res.status(500).send('Server error');
    }
  });
  
// Endpoint to inquire about payment status
app.post('/payment-inquiry', async (req, res) => {
  const { merchant, trackId } = req.body;
  
  const url = 'https://api.oxapay.com/merchants/inquiry';
  const data = JSON.stringify({
    merchant: merchant, // Use the merchant API key passed from the request
    trackId: trackId    // Use the trackId passed from the request
  });

  try {
    // Send POST request to OxaPay API
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Send the response from OxaPay back to the client
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error in payment inquiry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});
// Endpoint to inquire about payment status
app.post('/category', async (req, res) => {
  const { name, description } = req.body;
  
 console.log('Category received:', req.body); // Log to verify callback
  try {
    // Send POST request to OxaPay API
    const paymentResult = await pool.query(
        `INSERT INTO category (name, description) 
        VALUES ($1, $2) 
        RETURNING *`,
        [
           name, description
        ]
      );
    // Send the response from OxaPay back to the client
    res.status(200).json(response.data);
  } catch (error) {
    console.error('Error in payment inquiry:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

app.get('/transactions', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payments');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});
// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

