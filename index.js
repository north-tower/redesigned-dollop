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
        merchant: 'sandbox',
        amount: req.body.amount || 100,
        currency: req.body.currency || 'USD',
        payCurrency: req.body.payCurrency || 'TRX',
        lifeTime: req.body.lifeTime || 90,
        feePaidByPayer: req.body.feePaidByPayer || 1,
        underPaidCover: req.body.underPaidCover || 10,
        callbackUrl: 'https://e989-102-210-221-10.ngrok-free.app/payment-callback',  // The callback URL for payment updates
        description: req.body.description || 'Order #12345',
        orderId: req.body.orderId || 'ORD-12345',
        email: req.body.email || 'customer@example.com'
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
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

