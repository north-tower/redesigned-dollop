// File: server.js

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());

app.post('/create-payment', async (req, res) => {
    const url = 'https://api.oxapay.com/merchants/request';

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
        const response = await axios.post(url, data, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        res.json(response.data);
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
app.post('/payment-callback', (req, res) => {
    console.log('Callback received:', req.body); // Log to verify callback
    const status = req.body.status; // Assume OxaPay sends payment status
    const trackId = req.body.trackId;

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

