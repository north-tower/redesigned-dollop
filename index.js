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
const PORT = 3000;

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

  

// Route to handle payment creation


app.post('/create-payment', async (req, res) => {
  const { amount, lifeTime, feePaidByPayer, underPaidCover, callbackUrl, returnUrl, description, orderId, email } = req.body;

  // Override currency and payCurrency to TRX
  const currency = 'USDT';
  const payCurrency = 'USDT';

  const data = JSON.stringify({
    merchant: 'TYCR7F-TME38N-CA4Y6A-6GCMA7',
    amount,
    currency,
    payCurrency,
    lifeTime,
    feePaidByPayer,
    underPaidCover,
    callbackUrl,
    returnUrl,
    description,
    orderId,
    email,
    network: 'TRC20'
  });

  const url = 'https://api.oxapay.com/merchants/request/whitelabel';

  try {
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(response.data);

    const { trackId, address,payLink, expiredAt, lifeTime } = response.data;
    res.json({ trackId, address,payLink, expiredAt, lifeTime });
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create payment' });
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



// Utility function to generate a unique referral code
function generateReferralCode(length = 8) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let referralCode = '';
  for (let i = 0; i < length; i++) {
      referralCode += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return referralCode;
}

// Callback route for payment success/failure notification
app.post('/payment-callback', async (req, res) => {
  console.log('Callback received:', req.body);

  const { status, trackId, amount, currency, txID, payCurrency, receivedAmount, email } = req.body;

  if (!status || !trackId) {
      console.error('Invalid callback data received');
      return res.status(400).send('Bad Request: Missing status or trackId');
  }

  if (status === 'Paid') {
      try {
          // Check if the user already has a referral code
          const referralResult = await pool.query(
              'SELECT referral_code FROM deposits WHERE email = $1 LIMIT 1',
              [email]
          );

          let referralCode;
          if (referralResult.rows.length > 0) {
              // Use the existing referral code
              referralCode = referralResult.rows[0].referral_code;
              console.log(`User already has a referral code: ${referralCode}`);
          } else {
              // Generate a new referral code if none exists
              referralCode = generateReferralCode();
              console.log(`Generated new referral code: ${referralCode}`);
          }

          // Insert the payment details into the database, regardless of referral code status
          await pool.query(
              `INSERT INTO deposits (track_id, amount, received_amount, transaction_id, referral_code, email) 
               VALUES ($1, $2, $3, $4, $5, $6) 
               RETURNING *`,
              [
                  trackId, amount, receivedAmount, txID, referralCode, email
              ]
          );

          // Send the referral code to the frontend (along with success redirect)
          res.redirect(`http://localhost:5173/success/${trackId}?referralCode=${referralCode}`);
      } catch (err) {
          console.error('Error handling payment callback:', err);
          res.status(500).send('Server error');
      }
  } else {
      console.log(`Payment with Track ID ${trackId} failed.`);
      res.redirect(`http://localhost:5173/failure/${trackId}`);
  }
});

app.post('/payment-inquiry/:trackId', async (req, res) => {
  const merchant = 'TYCR7F-TME38N-CA4Y6A-6GCMA7';
  const { trackId } = req.params; // Get trackId from the URL params
  
  const url = 'https://api.oxapay.com/merchants/inquiry';
  const data = JSON.stringify({
    merchant: merchant, // Use the merchant API key
    trackId: trackId    // Use the trackId from the URL params
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
    const result = await pool.query('SELECT * FROM deposits');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/referals', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM referals');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/payouts', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM payouts');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.get('/rewards', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM referals');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});



app.post('/check-referrals', async (req, res) => {
  const { userId, referal } = req.body;

  try {
    // Check if a reward has already been issued for this user and referral code
    const rewardCheckResult = await pool.query(
      `SELECT COUNT(*) FROM rewards WHERE userid = $1 AND referalcode2 = $2`,
      [userId, referal]
    );

    const rewardExists = parseInt(rewardCheckResult.rows[0].count, 10) > 0;

    if (!rewardExists) {
      // No previous reward for this referral, so we award 10 USDT
      await pool.query(
        `INSERT INTO rewards (userid, amount, currency, referalcode2) VALUES ($1, $2, $3, $4)`,
        [userId, 10, 'USDT', referal]
      );
    }

    // Get the latest deposit timestamp for this user
    const latestDepositResult = await pool.query(
      `SELECT MAX(created_at) AS latest_deposit FROM rewards WHERE userid = $1 AND amount = 40 AND currency = 'USDT'`,
      [userId]
    );
    const latestDepositTimestamp = latestDepositResult.rows[0]?.latest_deposit || null;

    // Count referrals since the last reward
    const referralCountResult = await pool.query(
      `SELECT COUNT(*) FROM referals WHERE referalcode2 = $1 AND referaltimestamp > COALESCE($2::timestamp, '1970-01-01T00:00:00Z'::timestamp)`,
      [referal, latestDepositTimestamp]
    );
    
    const referralCount = parseInt(referralCountResult.rows[0].count, 10);

    // Send a response with the referral count and progress message
    const requiredReferrals = 5;
    const referralsLeft = requiredReferrals - referralCount;

    // Construct message based on referral progress
    const message = referralsLeft > 0
      ? `You have ${referralCount} new referrals! Keep going — you're just ${referralsLeft} referrals away from earning your 40 USDT reward.`
      : 'Congratulations! You have reached 5 or more referrals and earned your 40 USDT reward!';

    res.json({ 
      message: rewardExists 
        ? `You have already been rewarded for this referral. ${message}` 
        : `10 USDT reward granted. ${message}`, 
      rewardAdded: !rewardExists 
    });

  } catch (err) {
    console.error('Error checking referrals:', err);
    res.status(500).json({ message: 'Server error' });
  }
});



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

// Express.js API endpoint
app.post('/payouts', async (req, res) => {
  const { UserId, amount, address } = req.body;

  console.log('Payout received:', req.body);

  try {
    // Insert payment details into the database
    const payouts = await pool.query(
      `INSERT INTO payouts (userid, amount, address) 
       VALUES ($1, $2, $3) 
       RETURNING *`,
      [UserId, amount, address]
    );

    res.status(200).json(payouts.rows[0]); // Corrected the response object name to 'payouts'
  } catch (err) {
    console.error('Error inserting payment:', err);
    res.status(500).send('Server error');
  }
});



// Endpoint to insert a new journal entry
app.post('/referals', async (req, res) => {
  const { userid, referalcode1, referalcode2 } = req.body;
    const amount = 10;
  try {
    const result = await pool.query(
      'INSERT INTO referals (userid, referalcode1, referalcode2, amount) VALUES ($1, $2, $3, $4) RETURNING *',
      [ userid, referalcode1, referalcode2, amount]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Endpoint to get referer's code by userId
app.get('/get-referer-code', async (req, res) => {
  const { userId } = req.query;

  try {
    const result = await pool.query(
      'SELECT referalcode2 FROM referals WHERE userid = $1 LIMIT 1',
      [userId]
    );

    if (result.rows.length > 0) {
      res.json({ refererCode: result.rows[0].referalcode2 });
    } else {
      res.status(404).json({ message: 'Referer code not found' });
    }
  } catch (err) {
    console.error('Error fetching referer code:', err);
    res.status(500).json({ message: 'Server error' });
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
// Route to get referral code by email
app.get('/get-referral-code', async (req, res) => {
  const { email } = req.query;

  try {
    // Fetch referral code from the deposits table
    const referralResult = await pool.query(
      'SELECT referral_code FROM deposits WHERE email = $1 LIMIT 1',
      [email]
    );

    if (referralResult.rows.length > 0) {
      res.json({ referralCode: referralResult.rows[0].referral_code });
    } else {
      res.status(404).json({ message: 'Referral code not found' });
    }
  } catch (error) {
    console.error('Error fetching referral code:', error);
    res.status(500).json({ message: 'Server error' });
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

