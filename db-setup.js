// db-setup.js
const fs = require('fs');
const mysql = require('mysql2/promise'); // Using mysql2 with promises
require("dotenv").config();

const dbHost = process.env.DB_HOST;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;

async function setupDatabase() {
  // Read the SQL schema file
  const schemaSQL = fs.readFileSync('./hospital-schema.sql', 'utf8');
  
  // Split the SQL into individual statements
  // This is a simple approach - more robust parsers exist for production use
  const statements = schemaSQL.split(';').filter(statement => statement.trim());

  // Create database connection
  const connection = await mysql.createConnection({
    host: dbHost,
    user: dbUser,
    password: dbPass,
    // Omit database name to create it
  });
  
  try {
    // Create the database
    await connection.query('CREATE DATABASE IF NOT EXISTS hospital_management');
    
    // Use the database
    await connection.query('USE hospital_management');
    
    // Execute each statement
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
        console.log('Executed:', statement.substring(0, 50) + '...');
      }
    }
    
    console.log('Database setup completed successfully');
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    await connection.end();
  }
}

setupDatabase();