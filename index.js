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

async function updateImageTimestamps() {
  try {
    // 1. Fetch image URLs from the table
    const { data: images, error } = await supabase
      .from('categories')
      .select('categoryid, photo_url');

    if (error) throw new Error(`Error fetching images: ${error.message}`);

    // Iterate over each image URL
    for (const image of images) {
      const { categoryid, image_url } = image;

      // 2. Retrieve the file metadata from storage
      const filePath = image_url.replace(`https://tjeougsaxfuznmquezon.supabase.co/storage/v1/object/public/categories/`, '');

      const { data: metadata, error: storageError } = await supabase
        .storage
        .from('categories')
        .list('', {
          search: filePath
        });

      if (storageError) {
        console.error(`Error fetching metadata for image ${id}:`, storageError);
        continue;
      }

      const timestamp = metadata[0]?.created_at;

      if (timestamp) {
        // 3. Update the table with the timestamp
        const { error: updateError } = await supabase
          .from('categories')
          .update({ created_at: timestamp })
          .eq('categoryid', categoryid);

        if (updateError) {
          console.error(`Error updating timestamp for image id ${categoryid}:`, updateError);
        } else {
          console.log(`Updated timestamp for image id ${categoryid}: ${timestamp}`);
        }
      }
    }

    return { success: true, message: 'Timestamps updated successfully' };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message };
  }
}
// New endpoint to trigger timestamp update
app.get('/update-image-timestamps', async (req, res) => {
  const result = await updateImageTimestamps();
  if (result.success) {
    res.status(200).send(result.message);
  } else {
    res.status(500).send(result.message);
  }
});

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

app.get('/attendance', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM attendance');
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

app.get('/present', async (req, res) => {
  try {
    // Count the number of entries where attendance = 'p'
    const result = await pool.query("SELECT COUNT(*) AS present FROM attendance WHERE attendance = 'p'");
    
    res.json(result.rows[0]); // Return the count as 'present'
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});
 app.get('/absent', async (req, res) => {
  try {
    // Count the number of entries where attendance = 'p'
    const result = await pool.query("SELECT COUNT(*) AS absent FROM attendance WHERE attendance = 'a'");
    
    res.json(result.rows[0]); // Return the count as 'present'
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

app.get('/leave', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM leave');
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

app.post('/leave', async (req, res) => {
    const {
     nature, start, finish , description
    } = req.body;

    const approval = "Pending"
  
    console.log('Callback received:', req.body); // Log to verify callback
  
    try {
      // Insert payment details into the database
      const grants = await pool.query(
        `INSERT INTO leave (nature, start, finish, approval , description) 
        VALUES ($1, $2, $3, $4, $5) 
        RETURNING *`,
        [
           nature, start, finish, approval , description
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
  const { UserId, amount, address, type } = req.body;

  console.log('Payout received:', req.body);

  try {
    // Insert payment details into the database
    const payouts = await pool.query(
      `INSERT INTO payouts (userid, amount, address, type) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [UserId, amount, address, type]
    );

    res.status(200).json(payouts.rows[0]); // Corrected the response object name to 'payouts'
  } catch (err) {
    console.error('Error inserting payment:', err);
    res.status(500).send('Server error');
  }
    
});

// Express.js API endpoint
app.post('/attendance', async (req, res) => {
  const { UserId, attendance } = req.body;

  console.log('Attendance received:', req.body);

  try {
    // Insert payment details into the database
    const payouts = await pool.query(
      `INSERT INTO attendance (userid, attendance) 
       VALUES ($1, $2) 
       RETURNING *`,
      [UserId,attendance]
    );

    res.status(200).json(payouts.rows[0]); // Corrected the response object name to 'payouts'
  } catch (err) {
    console.error('Error inserting payment:', err);
    res.status(500).send('Server error');
  }
    
});

app.post('/users', async (req, res) => {
  const { uid, email, display_name, photo_url, provider_id } = req.body;

  console.log('User received:', req.body);

  try {
    // Check if the email already exists
    const emailCheck = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

    // If email exists, skip the insert and return a message
    if (emailCheck.rows.length > 0) {
      return res.status(200).json({ message: 'User with this email already exists', user: emailCheck.rows[0] });
    }

    // If email is unique, insert user details into the database
    const users = await pool.query(
      `INSERT INTO users (uid, email, display_name, photo_url, provider_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [uid, email, display_name, photo_url, provider_id]
    );

    res.status(200).json(users.rows[0]);
  } catch (err) {
    console.error('Error inserting user:', err);
    res.status(500).send('Server error');
  }
});


app.get('/transactions2', async (req, res) => {
  try {
    const result = await pool.query('SELECT SUM(received_amount) AS total_received FROM deposits');
    res.json(result.rows[0]); // Access the first row for total_received
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});




// Endpoint to insert a new journal entry
app.post('/referals', async (req, res) => {
  const { userid, referalcode1, referalcode2 } = req.body;
    const amount = 5;
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

// Endpoint to insert a new journal entry
app.post('/verified', async (req, res) => {
  const { userid  } = req.body;
    const amount = 4;
  try {
    const result = await pool.query(
      'INSERT INTO verified (userid ) VALUES ($1 ) RETURNING *',
      [ userid ]
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



  app.get('/verified', async (req, res) => {
   
    try {
      const result = await pool.query('SELECT * FROM verified');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
  });

 app.get('/grants2', async (req, res) => {
  try {
    const result = await pool.query('SELECT SUM(privilege) AS total FROM grants');
    res.json(result.rows[0]); // Access the first row for total_received
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

 app.get('/payouts6', async (req, res) => {
  try {
    const result = await pool.query('SELECT SUM(amount) AS totalPayout FROM payouts');
    res.json(result.rows[0]); // Access the first row for total_received
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Add a DELETE route to handle transaction deletion
app.delete('/transactions/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Delete the transaction by id
    const result = await pool.query('DELETE FROM deposits WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted successfully', deletedTransaction: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.delete('/payouts/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    // Delete the transaction by id
    const result = await pool.query('DELETE FROM payouts WHERE id = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    res.json({ message: 'Transaction deleted successfully', deletedTransaction: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});


app.put('/payouts/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Expecting the new status from the request body

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  try {
    // Update the status of the payout in the database
    const result = await pool.query(
      'UPDATE payouts SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Payout not found' });
    }

    res.status(200).json({
      message: 'Payout status updated successfully',
      payout: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating payout status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

app.put('/attendance/:id', async (req, res) => {
  const { id } = req.params; // Extract the attendance ID from the URL params

  try {
    // Update only the updated_at field in the database
    const result = await pool.query(
      'UPDATE attendance SET updated_at = NOW() WHERE id = $1 RETURNING *',
      [id] // Use the id from the request params
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Attendance record not found' });
    }

    res.status(200).json({
      message: 'Attendance updated successfully',
      attendance: result.rows[0], // Return the updated attendance record
    });
  } catch (error) {
    console.error('Error updating attendance record:', error);
    res.status(500).json({ message: 'Server error' });
  }
});



app.put('/leave/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Expecting the new status from the request body

  if (!status) {
    return res.status(400).json({ message: 'Status is required' });
  }

  try {
    // Update the status of the payout in the database
    const result = await pool.query(
      'UPDATE leave SET approval = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Payout not found' });
    }

    res.status(200).json({
      message: 'Payout status updated successfully',
      payout: result.rows[0],
    });
  } catch (error) {
    console.error('Error updating payout status:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


app.get('/grants/total-per-user', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT grantorid, SUM(privilege) AS total_grants
      FROM grants
      GROUP BY grantorid
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});
app.get('/grants/referral-count', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT userid, referalcode1 AS referal_code, COUNT(*) AS referral_count
      FROM referals
      WHERE referalcode2 IS NOT NULL
      GROUP BY userid, referalcode1
    `);

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

