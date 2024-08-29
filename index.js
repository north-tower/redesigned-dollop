const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Pool } = require('pg');
const dotenv = require('dotenv');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

dotenv.config();
const app = express();
const PORT = 3001;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
  
  // Supabase setup
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  // Configure Multer for file upload handling
const storage = multer.memoryStorage();
const upload = multer({ storage });

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

app.get('/categories', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM categories');
      res.json(result.rows);
    } catch (err) {
      console.error(err);
      res.status(500).send('Server error');
    }
  });

  

  app.post('/create-payment', async (req, res) => {
    const url = 'https://api.oxapay.com/merchants/request/whitelabel';

    const data = {
        merchant: '3RRD1M-KL8UP1-39WP15-CMX7X3',
        amount: req.body.amount || 100,  
        currency: req.body.currency || 'USD',  
        payCurrency: req.body.payCurrency || 'TRX',  
        lifeTime: req.body.lifeTime || 90,  
        feePaidByPayer: req.body.feePaidByPayer || 1,  
        underPaidCover: req.body.underPaidCover || 10,  
        callbackUrl: req.body.callbackUrl || '',  
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
            `INSERT INTO payments (paymentid, userid, merchantid, amount, currency, paymentgateway, paymentstatus, "user") 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
            RETURNING *`,
            [
              trackId, '12', '12', payAmount, payCurrency, address, message, email
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
app.post('/category', upload.single('photo'), async (req, res) => {
  const { name, description } = req.body;
  const { file } = req;
  
  try {
    // Upload the photo to Supabase storage
    let photoUrl = null;
    if (file) {
      const { data, error: uploadError } = await supabase
        .storage
        .from('categories') // Supabase storage bucket name
        .upload(`photos/${Date.now()}_${file.originalname}`, file.buffer, {
          contentType: file.mimetype,
        });

      if (uploadError) {
        throw new Error(uploadError.message);
      }


      console.log(data)

      photoUrl = supabase.storage.from('categories').getPublicUrl(data.path);
      console.log(photoUrl)
    }

    // Insert the category details into the database
    const paymentResult = await pool.query(
      `INSERT INTO categories (name, description, photo_url) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [name, description, photoUrl]
    );

    res.status(200).json(paymentResult.rows[0]);
  } catch (error) {
    console.error('Error creating category:', error);
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
});// Callback route for payment success/failure notification
app.post('/grants', async (req, res) => {
    const {
      GrantorID,
      GranteeID,
      Privilege
    } = req.body;
  
    console.log('Callback received:', req.body); // Log to verify callback
  
    try {
      // Insert payment details into the database
      const grants = await pool.query(
        `INSERT INTO grants (grantorid, granteeid, privilege) 
        VALUES ($1, $2, $3) 
        RETURNING *`,
        [
           GrantorID,GranteeID, Privilege
        ]
      );
   res.status(200).json(grants.rows[0]);
     
    } catch (err) {
      console.error('Error inserting payment:', err);
      res.status(500).send('Server error');
    }
  });


// Endpoint to insert a new journal entry
app.post('/referals', async (req, res) => {
  const { userId, referalcode1, referalcode2 } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO referals (userid, referalcode1, referalcode2) VALUES ($1, $2, $3) RETURNING *',
      [ userid, referalcode1, referalcode2]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Endpoint to insert a new journal entry
app.post('/referals2', async (req, res) => {
  const { userId, referalcode } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO referals2 (userid, referalcode) VALUES ($1, $2) RETURNING *',
      [ userid, referalcode ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});
// Endpoint to check if referral code is unique
app.get('/check-referral-code/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const result = await pool.query('SELECT COUNT(*) FROM referals WHERE referalcode1 = $1', [code]);
    const exists = result.rows[0].count > 0;
    res.json({ exists });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});


  app.get('/grants', async (req, res) => {
   
    try {
      const result = await pool.query('SELECT * FROM grants');
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

