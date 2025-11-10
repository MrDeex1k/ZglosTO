const { Pool } = require('pg');

// Create a connection pool (recommended for handling multiple queries efficiently)
const pool = new Pool({
  host: 'database',  // Service name from Docker Compose
  port: process.env.POSTGRES_PORT || 5432,  // Fallback to default Postgres port if not set
  user: process.env.POSTGRES_USER || 'zglosto_user',
  password: process.env.POSTGRES_PASSWORD,  // This should be set in .env
  database: process.env.POSTGRES_DB || 'zglosto_db',
  // Optional: Add SSL or other configs if needed, e.g., ssl: { rejectUnauthorized: false }
});

// Function to test the connection (async/await style)
async function testConnection() {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL database successfully');
    client.release();  // Release the client back to the pool
  } catch (err) {
    console.error('Error connecting to the database:', err.stack);
  }
}

// Example query function
async function runQuery() {
  try {
    const res = await pool.query('SELECT NOW() as current_time');
    console.log('Current time from DB:', res.rows[0].current_time);
  } catch (err) {
    console.error('Query error:', err.stack);
  }
}

// Export the pool for use in other parts of your app
//module.exports = { pool, testConnection, runQuery };
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
  testConnection
};

// Usage example: In your main app file (e.g., index.js or app.js)
// const { testConnection, runQuery } = require('./db');
// testConnection();
// runQuery();