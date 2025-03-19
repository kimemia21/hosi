const express = require('express');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const cors = require('cors');
require('dotenv').config();
const os = require('os');


const app = express();

const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/auth'); 

const port = process.env.PORT || 3000;
const host = process.env.DB_HOST


// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // HTTP request logger
app.use(express.json()); // Parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Database Connection Pool
const pool =require("./db");
// Test database connection
app.use('/api/auth', authRoutes);
app.get('/api/health', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    connection.release();
    res.status(200).json({ status: 'success', message: 'Database connection successful' });
  } catch (error) {
    console.error('Database connection failed:', error);
    res.status(500).json({ status: 'error', message: 'Database connection failed', error: error.message });
  }
});



// Routes





  // 404 handler



// ====================== PATIENT ROUTES ======================
// Get all patients
app.get('/api/patients', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM patients');
    res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    console.error('Error fetching patients:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch patients', error: error.message });
  }
});

// Get patient by ID
app.get('/api/patients/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM patients WHERE patient_id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Patient not found' });
    }
    
    res.status(200).json({ status: 'success', data: rows[0] });
  } catch (error) {
    console.error(`Error fetching patient ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch patient', error: error.message });
  }
});

// Create a new patient
app.post('/api/patients', async (req, res) => {
  try {
    // Basic validation
    const requiredFields = ['first_name', 'last_name', 'date_of_birth', 'gender', 'address', 'city', 'state', 'postal_code', 'country', 'phone'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ status: 'error', message: `Missing required field: ${field}` });
      }
    }

    const result = await pool.query(
      'INSERT INTO patients (first_name, last_name, date_of_birth, gender, blood_type, address, city, state, postal_code, country, phone, email, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, insurance_provider, insurance_policy_number, allergies) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        req.body.first_name,
        req.body.last_name,
        req.body.date_of_birth,
        req.body.gender,
        req.body.blood_type || null,
        req.body.address,
        req.body.city,
        req.body.state,
        req.body.postal_code,
        req.body.country,
        req.body.phone,
        req.body.email || null,
        req.body.emergency_contact_name || null,
        req.body.emergency_contact_phone || null,
        req.body.emergency_contact_relation || null,
        req.body.insurance_provider || null,
        req.body.insurance_policy_number || null,
        req.body.allergies || null
      ]
    );
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Patient created successfully', 
      data: { patient_id: result[0].insertId }
    });
  } catch (error) {
    console.error('Error creating patient:', error);
    res.status(500).json({ status: 'error', message: 'Failed to create patient', error: error.message });
  }
});

// Update a patient
app.put('/api/patients/:id', async (req, res) => {
  try {
    // Check if patient exists
    const [patient] = await pool.query('SELECT * FROM patients WHERE patient_id = ?', [req.params.id]);
    if (patient.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Patient not found' });
    }
    
    // Create dynamic SQL update query
    const updates = [];
    const values = [];
    
    // Only update fields that are provided
    const allowedFields = [
      'first_name', 'last_name', 'date_of_birth', 'gender', 'blood_type', 
      'address', 'city', 'state', 'postal_code', 'country', 'phone', 'email',
      'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relation',
      'insurance_provider', 'insurance_policy_number', 'allergies'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
    }
    
    // Add patient_id to values array for WHERE clause
    values.push(req.params.id);
    
    await pool.query(
      `UPDATE patients SET ${updates.join(', ')} WHERE patient_id = ?`,
      values
    );
    
    res.status(200).json({ status: 'success', message: 'Patient updated successfully' });
  } catch (error) {
    console.error(`Error updating patient ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to update patient', error: error.message });
  }
});

// Delete a patient
app.delete('/api/patients/:id', async (req, res) => {
  try {
    // Check if patient exists
    const [patient] = await pool.query('SELECT * FROM patients WHERE patient_id = ?', [req.params.id]);
    if (patient.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Patient not found' });
    }
    
    // Begin transaction to handle cascade deletions properly
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Check for foreign key constraints before deletion
      const [visits] = await connection.query('SELECT * FROM visits WHERE patient_id = ?', [req.params.id]);
      if (visits.length > 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ 
          status: 'error', 
          message: 'Cannot delete patient with associated visits. Delete related records first.' 
        });
      }
      
      // Delete medical history records
      await connection.query('DELETE FROM medical_history WHERE patient_id = ?', [req.params.id]);
      
      // Delete the patient
      await connection.query('DELETE FROM patients WHERE patient_id = ?', [req.params.id]);
      
      await connection.commit();
      connection.release();
      
      res.status(200).json({ status: 'success', message: 'Patient deleted successfully' });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error(`Error deleting patient ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to delete patient', error: error.message });
  }
});

// ====================== STAFF ROUTES ======================
// Get all staff
app.get('/api/staff', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM staff');
    res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    console.error('Error fetching staff:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch staff', error: error.message });
  }
});

// Get staff by ID
app.get('/api/staff/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM staff WHERE staff_id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Staff member not found' });
    }
    
    res.status(200).json({ status: 'success', data: rows[0] });
  } catch (error) {
    console.error(`Error fetching staff member ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch staff member', error: error.message });
  }
});

// Create a new staff member
app.post('/api/staff', async (req, res) => {
  try {
    // Basic validation
    const requiredFields = ['first_name', 'last_name', 'role', 'phone', 'email', 'hire_date'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ status: 'error', message: `Missing required field: ${field}` });
      }
    }
    
    // Validate department exists if provided
    if (req.body.department_id) {
      const [dept] = await pool.query('SELECT * FROM departments WHERE department_id = ?', [req.body.department_id]);
      if (dept.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Department does not exist' });
      }
    }

    const result = await pool.query(
      'INSERT INTO staff (first_name, last_name, role, department_id, specialization, license_number, phone, email, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        req.body.first_name,
        req.body.last_name,
        req.body.role,
        req.body.department_id || null,
        req.body.specialization || null,
        req.body.license_number || null,
        req.body.phone,
        req.body.email,
        req.body.hire_date
      ]
    );
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Staff member created successfully', 
      data: { staff_id: result[0].insertId }
    });
  } catch (error) {
    console.error('Error creating staff member:', error);
    res.status(500).json({ status: 'error', message: 'Failed to create staff member', error: error.message });
  }
});

// Update a staff member
app.put('/api/staff/:id', async (req, res) => {
  try {
    // Check if staff exists
    const [staff] = await pool.query('SELECT * FROM staff WHERE staff_id = ?', [req.params.id]);
    if (staff.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Staff member not found' });
    }
    
    // Validate department exists if provided
    if (req.body.department_id) {
      const [dept] = await pool.query('SELECT * FROM departments WHERE department_id = ?', [req.body.department_id]);
      if (dept.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Department does not exist' });
      }
    }
    
    // Create dynamic SQL update query
    const updates = [];
    const values = [];
    
    // Only update fields that are provided
    const allowedFields = [
      'first_name', 'last_name', 'role', 'department_id', 'specialization', 
      'license_number', 'phone', 'email', 'hire_date'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
    }
    
    // Add staff_id to values array for WHERE clause
    values.push(req.params.id);
    
    await pool.query(
      `UPDATE staff SET ${updates.join(', ')} WHERE staff_id = ?`,
      values
    );
    
    res.status(200).json({ status: 'success', message: 'Staff member updated successfully' });
  } catch (error) {
    console.error(`Error updating staff member ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to update staff member', error: error.message });
  }
});

// Delete a staff member
app.delete('/api/staff/:id', async (req, res) => {
  try {
    // Check if staff exists
    const [staff] = await pool.query('SELECT * FROM staff WHERE staff_id = ?', [req.params.id]);
    if (staff.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Staff member not found' });
    }
    
    // Begin transaction to handle cascade deletions properly
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Check for foreign key constraints before deletion
      const [visits] = await connection.query('SELECT * FROM visits WHERE attending_doctor_id = ?', [req.params.id]);
      if (visits.length > 0) {
        await connection.rollback();
        connection.release();
        return res.status(400).json({ 
          status: 'error', 
          message: 'Cannot delete staff member with associated visits. Reassign or delete related records first.' 
        });
      }
      
      // Delete the staff member
      await connection.query('DELETE FROM staff WHERE staff_id = ?', [req.params.id]);
      
      await connection.commit();
      connection.release();
      
      res.status(200).json({ status: 'success', message: 'Staff member deleted successfully' });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error(`Error deleting staff member ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to delete staff member', error: error.message });
  }
});

// ====================== VISITS ROUTES ======================
// Get all visits
app.get('/api/visits', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT v.*, 
             p.first_name AS patient_first_name, 
             p.last_name AS patient_last_name,
             s.first_name AS doctor_first_name,
             s.last_name AS doctor_last_name
      FROM visits v
      JOIN patients p ON v.patient_id = p.patient_id
      JOIN staff s ON v.attending_doctor_id = s.staff_id
      ORDER BY v.visit_date DESC
    `);
    res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    console.error('Error fetching visits:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch visits', error: error.message });
  }
});

// Get visit by ID
app.get('/api/visits/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT v.*, 
             p.first_name AS patient_first_name, 
             p.last_name AS patient_last_name,
             s.first_name AS doctor_first_name,
             s.last_name AS doctor_last_name
      FROM visits v
      JOIN patients p ON v.patient_id = p.patient_id
      JOIN staff s ON v.attending_doctor_id = s.staff_id
      WHERE v.visit_id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Visit not found' });
    }
    
    res.status(200).json({ status: 'success', data: rows[0] });
  } catch (error) {
    console.error(`Error fetching visit ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch visit', error: error.message });
  }
});

// Create a new visit
app.post('/api/visits', async (req, res) => {
  try {
    // Basic validation
    const requiredFields = ['patient_id', 'visit_date', 'visit_type', 'primary_complaint', 'attending_doctor_id'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ status: 'error', message: `Missing required field: ${field}` });
      }
    }
    
    // Validate patient exists
    const [patient] = await pool.query('SELECT * FROM patients WHERE patient_id = ?', [req.body.patient_id]);
    if (patient.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Patient does not exist' });
    }
    
    // Validate doctor exists
    const [doctor] = await pool.query('SELECT * FROM staff WHERE staff_id = ? AND role = "Doctor"', [req.body.attending_doctor_id]);
    if (doctor.length === 0) {
      return res.status(400).json({ status: 'error', message: 'Doctor does not exist or staff member is not a doctor' });
    }

    const result = await pool.query(
      `INSERT INTO visits (
        patient_id, visit_date, visit_type, primary_complaint, initial_diagnosis,
        final_diagnosis, attending_doctor_id, vital_signs, visit_notes, discharge_date, discharge_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.body.patient_id,
        req.body.visit_date,
        req.body.visit_type,
        req.body.primary_complaint,
        req.body.initial_diagnosis || null,
        req.body.final_diagnosis || null,
        req.body.attending_doctor_id,
        req.body.vital_signs || null,
        req.body.visit_notes || null,
        req.body.discharge_date || null,
        req.body.discharge_notes || null
      ]
    );
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Visit created successfully', 
      data: { visit_id: result[0].insertId }
    });
  } catch (error) {
    console.error('Error creating visit:', error);
    res.status(500).json({ status: 'error', message: 'Failed to create visit', error: error.message });
  }
});

// Update a visit
app.put('/api/visits/:id', async (req, res) => {
  try {
    // Check if visit exists
    const [visit] = await pool.query('SELECT * FROM visits WHERE visit_id = ?', [req.params.id]);
    if (visit.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Visit not found' });
    }
    
    // Validate patient exists if patient_id is being updated
    if (req.body.patient_id) {
      const [patient] = await pool.query('SELECT * FROM patients WHERE patient_id = ?', [req.body.patient_id]);
      if (patient.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Patient does not exist' });
      }
    }
    
    // Validate doctor exists if attending_doctor_id is being updated
    if (req.body.attending_doctor_id) {
      const [doctor] = await pool.query('SELECT * FROM staff WHERE staff_id = ? AND role = "Doctor"', [req.body.attending_doctor_id]);
      if (doctor.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Doctor does not exist or staff member is not a doctor' });
      }
    }
    
    // Create dynamic SQL update query
    const updates = [];
    const values = [];
    
    // Only update fields that are provided
    const allowedFields = [
      'patient_id', 'visit_date', 'visit_type', 'primary_complaint', 'initial_diagnosis',
      'final_diagnosis', 'attending_doctor_id', 'vital_signs', 'visit_notes', 'discharge_date', 'discharge_notes'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
    }
    
    // Add visit_id to values array for WHERE clause
    values.push(req.params.id);
    
    await pool.query(
      `UPDATE visits SET ${updates.join(', ')} WHERE visit_id = ?`,
      values
    );
    
    res.status(200).json({ status: 'success', message: 'Visit updated successfully' });
  } catch (error) {
    console.error(`Error updating visit ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to update visit', error: error.message });
  }
});

// Delete a visit
app.delete('/api/visits/:id', async (req, res) => {
  try {
    // Check if visit exists
    const [visit] = await pool.query('SELECT * FROM visits WHERE visit_id = ?', [req.params.id]);
    if (visit.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Visit not found' });
    }
    
    // Begin transaction to handle cascade deletions properly
    const connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // Delete related diagnoses
      await connection.query('DELETE FROM diagnoses WHERE visit_id = ?', [req.params.id]);
      
      // Delete related prescriptions (first need to delete prescription_details)
      const [prescriptions] = await connection.query('SELECT prescription_id FROM prescriptions WHERE visit_id = ?', [req.params.id]);
      for (const prescription of prescriptions) {
        await connection.query('DELETE FROM prescription_details WHERE prescription_id = ?', [prescription.prescription_id]);
      }
      await connection.query('DELETE FROM prescriptions WHERE visit_id = ?', [req.params.id]);
      
      // Delete related lab tests
      await connection.query('DELETE FROM lab_tests WHERE visit_id = ?', [req.params.id]);
      
      // Delete related billing items (first need to delete billing_items)
      const [bills] = await connection.query('SELECT bill_id FROM billing WHERE visit_id = ?', [req.params.id]);
      for (const bill of bills) {
        await connection.query('DELETE FROM billing_items WHERE bill_id = ?', [bill.bill_id]);
      }
      await connection.query('DELETE FROM billing WHERE visit_id = ?', [req.params.id]);
      
      // Finally delete the visit
      await connection.query('DELETE FROM visits WHERE visit_id = ?', [req.params.id]);
      
      await connection.commit();
      connection.release();
      
      res.status(200).json({ status: 'success', message: 'Visit and all related records deleted successfully' });
    } catch (error) {
      await connection.rollback();
      connection.release();
      throw error;
    }
  } catch (error) {
    console.error(`Error deleting visit ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to delete visit', error: error.message });
  }
});

// ====================== MEDICATIONS ROUTES ======================
// Get all medications
app.get('/api/medications', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM medications ORDER BY name');
    res.status(200).json({ status: 'success', data: rows });
  } catch (error) {
    console.error('Error fetching medications:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch medications', error: error.message });
  }
});

// Get medication by ID
app.get('/api/medications/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM medications WHERE medication_id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Medication not found' });
    }
    
    res.status(200).json({ status: 'success', data: rows[0] });
  } catch (error) {
    console.error(`Error fetching medication ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch medication', error: error.message });
  }
});

// Create a new medication
app.post('/api/medications', async (req, res) => {
  try {
    // Basic validation
    const requiredFields = ['name', 'unit_price'];
    for (const field of requiredFields) {
      if (!req.body[field]) {
        return res.status(400).json({ status: 'error', message: `Missing required field: ${field}` });
      }
    }

    const result = await pool.query(
      `INSERT INTO medications (
        name, generic_name, description, dosage_form, 
        strength, manufacturer, unit_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.body.name,
        req.body.generic_name || null,
        req.body.description || null,
        req.body.dosage_form || null,
        req.body.strength || null,
        req.body.manufacturer || null,
        req.body.unit_price
      ]
    );
    
    res.status(201).json({ 
      status: 'success', 
      message: 'Medication created successfully', 
      data: { medication_id: result[0].insertId }
    });
  } catch (error) {
    console.error('Error creating medication:', error);
    res.status(500).json({ status: 'error', message: 'Failed to create medication', error: error.message });
  }
});

// Update a medication
app.put('/api/medications/:id', async (req, res) => {
  try {
    // Check if medication exists
    const [medication] = await pool.query('SELECT * FROM medications WHERE medication_id = ?', [req.params.id]);
    if (medication.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Medication not found' });
    }
    
    // Create dynamic SQL update query
    const updates = [];
    const values = [];
    
    // Only update fields that are provided
    const allowedFields = [
      'name', 'generic_name', 'description', 'dosage_form', 
      'strength', 'manufacturer', 'unit_price'
    ];
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
    }
    
    // Add medication_id to values array for WHERE clause
    values.push(req.params.id);
    
    await pool.query(
      `UPDATE medications SET ${updates.join(', ')} WHERE medication_id = ?`,
      values
    );
    
    res.status(200).json({ status: 'success', message: 'Medication updated successfully' });
  } catch (error) {
    console.error(`Error updating medication ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to update medication', error: error.message });
  }
});

// Delete a medication
app.delete('/api/medications/:id', async (req, res) => {
  try {
    // Check if medication exists
    const [medication] = await pool.query('SELECT * FROM medications WHERE medication_id = ?', [req.params.id]);
    if (medication.length === 0) {
      return res.status(404).json({ status: 'error', message: 'Medication not found' });
    }
    
    // Check if medication is in use
    const [prescriptions] = await pool.query('SELECT * FROM prescription_details WHERE medication_id = ?', [req.params.id]);
    if (prescriptions.length > 0) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Cannot delete medication that is used in prescriptions' 
      });
    }
    
    await pool.query('DELETE FROM medications WHERE medication_id = ?', [req.params.id]);
    
    res.status(200).json({ status: 'success', message: 'Medication deleted successfully' });
  } catch (error) {
    console.error(`Error deleting medication ${req.params.id}:`, error);
    res.status(500).json({ status: 'error', message: 'Failed to delete medication', error: error.message });
  }
});

// ====================== DEPARTMENTS ROUTES ======================
app.get('/api/departments', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM departments ORDER BY name');
      res.status(200).json({ status: 'success', data: rows });
    } catch (error) {
      console.error('Error fetching departments:', error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch departments', error: error.message });
    }
  });
  
  // Get department by ID
  app.get('/api/departments/:id', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM departments WHERE department_id = ?', [req.params.id]);
      
      if (rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Department not found' });
      }
      
      res.status(200).json({ status: 'success', data: rows[0] });
    } catch (error) {
      console.error(`Error fetching department ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch department', error: error.message });
    }
  });
  
  // Create a new department
  app.post('/api/departments', async (req, res) => {
    try {
      // Basic validation
      if (!req.body.name) {
        return res.status(400).json({ status: 'error', message: 'Department name is required' });
      }
  
      const result = await pool.query(
        'INSERT INTO departments (name, description, location) VALUES (?, ?, ?)',
        [
          req.body.name,
          req.body.description || null,
          req.body.location || null
        ]
      );
      
      res.status(201).json({ 
        status: 'success', 
        message: 'Department created successfully', 
        data: { department_id: result[0].insertId }
      });
    } catch (error) {
      console.error('Error creating department:', error);
      res.status(500).json({ status: 'error', message: 'Failed to create department', error: error.message });
    }
  });
  
  // Update a department
  app.put('/api/departments/:id', async (req, res) => {
    try {
      // Check if department exists
      const [department] = await pool.query('SELECT * FROM departments WHERE department_id = ?', [req.params.id]);
      if (department.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Department not found' });
      }
      
      // Create dynamic SQL update query
      const updates = [];
      const values = [];
      
      // Only update fields that are provided
      const allowedFields = ['name', 'description', 'location'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      });
      
      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
      }
      
      // Add department_id to values array for WHERE clause
      values.push(req.params.id);
      
      await pool.query(
        `UPDATE departments SET ${updates.join(', ')} WHERE department_id = ?`,
        values
      );
      
      res.status(200).json({ status: 'success', message: 'Department updated successfully' });
    } catch (error) {
      console.error(`Error updating department ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to update department', error: error.message });
    }
  });
  
  // Delete a department
  app.delete('/api/departments/:id', async (req, res) => {
    try {
      // Check if department exists
      const [department] = await pool.query('SELECT * FROM departments WHERE department_id = ?', [req.params.id]);
      if (department.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Department not found' });
      }
      
      // Check if department has staff members
      const [staff] = await pool.query('SELECT * FROM staff WHERE department_id = ?', [req.params.id]);
      if (staff.length > 0) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Cannot delete department with assigned staff members. Reassign staff first.' 
        });
      }
      
      await pool.query('DELETE FROM departments WHERE department_id = ?', [req.params.id]);
      
      res.status(200).json({ status: 'success', message: 'Department deleted successfully' });
    } catch (error) {
      console.error(`Error deleting department ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to delete department', error: error.message });
    }
  });
  
  // ====================== DISEASES ROUTES ======================
  // Get all diseases
  app.get('/api/diseases', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM diseases ORDER BY name');
      res.status(200).json({ status: 'success', data: rows });
    } catch (error) {
      console.error('Error fetching diseases:', error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch diseases', error: error.message });
    }
  });
  
  // Get disease by ID
  app.get('/api/diseases/:id', async (req, res) => {
    try {
      const [rows] = await pool.query('SELECT * FROM diseases WHERE disease_id = ?', [req.params.id]);
      
      if (rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Disease not found' });
      }
      
      res.status(200).json({ status: 'success', data: rows[0] });
    } catch (error) {
      console.error(`Error fetching disease ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch disease', error: error.message });
    }
  });
  
  // Create a new disease
  app.post('/api/diseases', async (req, res) => {
    try {
      // Basic validation
      if (!req.body.name) {
        return res.status(400).json({ status: 'error', message: 'Disease name is required' });
      }
  
      const result = await pool.query(
        'INSERT INTO diseases (name, description, icd_code, category) VALUES (?, ?, ?, ?)',
        [
          req.body.name,
          req.body.description || null,
          req.body.icd_code || null,
          req.body.category || null
        ]
      );
      
      res.status(201).json({ 
        status: 'success', 
        message: 'Disease created successfully', 
        data: { disease_id: result[0].insertId }
      });
    } catch (error) {
      console.error('Error creating disease:', error);
      res.status(500).json({ status: 'error', message: 'Failed to create disease', error: error.message });
    }
  });
  
  // Update a disease
  app.put('/api/diseases/:id', async (req, res) => {
    try {
      // Check if disease exists
      const [disease] = await pool.query('SELECT * FROM diseases WHERE disease_id = ?', [req.params.id]);
      if (disease.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Disease not found' });
      }
      
      // Create dynamic SQL update query
      const updates = [];
      const values = [];
      
      // Only update fields that are provided
      const allowedFields = ['name', 'description', 'icd_code', 'category'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      });
      
      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
      }
      
      // Add disease_id to values array for WHERE clause
      values.push(req.params.id);
      
      await pool.query(
        `UPDATE diseases SET ${updates.join(', ')} WHERE disease_id = ?`,
        values
      );
      
      res.status(200).json({ status: 'success', message: 'Disease updated successfully' });
    } catch (error) {
      console.error(`Error updating disease ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to update disease', error: error.message });
    }
  });
  
  // Delete a disease
  app.delete('/api/diseases/:id', async (req, res) => {
    try {
      // Check if disease exists
      const [disease] = await pool.query('SELECT * FROM diseases WHERE disease_id = ?', [req.params.id]);
      if (disease.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Disease not found' });
      }
      
      // Check if disease is used in diagnoses
      const [diagnoses] = await pool.query('SELECT * FROM diagnoses WHERE disease_id = ?', [req.params.id]);
      if (diagnoses.length > 0) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Cannot delete disease that is used in diagnoses' 
        });
      }
      
      await pool.query('DELETE FROM diseases WHERE disease_id = ?', [req.params.id]);
      
      res.status(200).json({ status: 'success', message: 'Disease deleted successfully' });
    } catch (error) {
      console.error(`Error deleting disease ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to delete disease', error: error.message });
    }
  });
  
  // ====================== DIAGNOSES ROUTES ======================
  // Get diagnoses by visit ID
  app.get('/api/visits/:visitId/diagnoses', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT d.*, 
               dis.name AS disease_name,
               s.first_name AS doctor_first_name,
               s.last_name AS doctor_last_name
        FROM diagnoses d
        JOIN diseases dis ON d.disease_id = dis.disease_id
        JOIN staff s ON d.diagnosing_doctor_id = s.staff_id
        WHERE d.visit_id = ?
        ORDER BY d.diagnosis_date DESC
      `, [req.params.visitId]);
      
      res.status(200).json({ status: 'success', data: rows });
    } catch (error) {
      console.error(`Error fetching diagnoses for visit ${req.params.visitId}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch diagnoses', error: error.message });
    }
  });
  
  // Get diagnosis by ID
  app.get('/api/diagnoses/:id', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT d.*,
               dis.name AS disease_name,
               s.first_name AS doctor_first_name,
               s.last_name AS doctor_last_name
        FROM diagnoses d
        JOIN diseases dis ON d.disease_id = dis.disease_id
        JOIN staff s ON d.diagnosing_doctor_id = s.staff_id
        WHERE d.diagnosis_id = ?
      `, [req.params.id]);
      
      if (rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Diagnosis not found' });
      }
      
      res.status(200).json({ status: 'success', data: rows[0] });
    } catch (error) {
      console.error(`Error fetching diagnosis ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch diagnosis', error: error.message });
    }
  });
  
  // Create a new diagnosis
  app.post('/api/diagnoses', async (req, res) => {
    try {
      // Basic validation
      const requiredFields = ['visit_id', 'disease_id', 'diagnosis_date', 'diagnosing_doctor_id', 'severity', 'status'];
      for (const field of requiredFields) {
        if (!req.body[field]) {
          return res.status(400).json({ status: 'error', message: `Missing required field: ${field}` });
        }
      }
      
      // Validate visit exists
      const [visit] = await pool.query('SELECT * FROM visits WHERE visit_id = ?', [req.body.visit_id]);
      if (visit.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Visit does not exist' });
      }
      
      // Validate disease exists
      const [disease] = await pool.query('SELECT * FROM diseases WHERE disease_id = ?', [req.body.disease_id]);
      if (disease.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Disease does not exist' });
      }
      
      // Validate doctor exists
      const [doctor] = await pool.query('SELECT * FROM staff WHERE staff_id = ? AND role = "Doctor"', [req.body.diagnosing_doctor_id]);
      if (doctor.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Doctor does not exist or staff member is not a doctor' });
      }
      
      const result = await pool.query(
        `INSERT INTO diagnoses (
          visit_id, disease_id, diagnosis_date, diagnosis_notes, 
          diagnosing_doctor_id, severity, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.body.visit_id,
          req.body.disease_id,
          req.body.diagnosis_date,
          req.body.diagnosis_notes || null,
          req.body.diagnosing_doctor_id,
          req.body.severity,
          req.body.status
        ]
      );
      
      res.status(201).json({ 
        status: 'success', 
        message: 'Diagnosis created successfully', 
        data: { diagnosis_id: result[0].insertId }
      });
    } catch (error) {
      console.error('Error creating diagnosis:', error);
      res.status(500).json({ status: 'error', message: 'Failed to create diagnosis', error: error.message });
    }
  });
  
  // Update a diagnosis
  app.put('/api/diagnoses/:id', async (req, res) => {
    try {
      // Check if diagnosis exists
      const [diagnosis] = await pool.query('SELECT * FROM diagnoses WHERE diagnosis_id = ?', [req.params.id]);
      if (diagnosis.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Diagnosis not found' });
      }
      
      // Create dynamic SQL update query
      const updates = [];
      const values = [];
      
      // Only update fields that are provided
      const allowedFields = [
        'disease_id', 'diagnosis_date', 'diagnosis_notes', 
        'diagnosing_doctor_id', 'severity', 'status'
      ];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      });
      
      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
      }
      
      // Validate disease exists if being updated
      if (req.body.disease_id) {
        const [disease] = await pool.query('SELECT * FROM diseases WHERE disease_id = ?', [req.body.disease_id]);
        if (disease.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Disease does not exist' });
        }
      }
      
      // Validate doctor exists if being updated
      if (req.body.diagnosing_doctor_id) {
        const [doctor] = await pool.query('SELECT * FROM staff WHERE staff_id = ? AND role = "Doctor"', [req.body.diagnosing_doctor_id]);
        if (doctor.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Doctor does not exist or staff member is not a doctor' });
        }
      }
      
      // Add diagnosis_id to values array for WHERE clause
      values.push(req.params.id);
      
      await pool.query(
        `UPDATE diagnoses SET ${updates.join(', ')} WHERE diagnosis_id = ?`,
        values
      );
      
      res.status(200).json({ status: 'success', message: 'Diagnosis updated successfully' });
    } catch (error) {
      console.error(`Error updating diagnosis ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to update diagnosis', error: error.message });
    }
  });
  
  // Delete a diagnosis
  app.delete('/api/diagnoses/:id', async (req, res) => {
    try {
      // Check if diagnosis exists
      const [diagnosis] = await pool.query('SELECT * FROM diagnoses WHERE diagnosis_id = ?', [req.params.id]);
      if (diagnosis.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Diagnosis not found' });
      }
      
      await pool.query('DELETE FROM diagnoses WHERE diagnosis_id = ?', [req.params.id]);
      
      res.status(200).json({ status: 'success', message: 'Diagnosis deleted successfully' });
    } catch (error) {
      console.error(`Error deleting diagnosis ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to delete diagnosis', error: error.message });
    }
  });
  
  // ====================== PRESCRIPTIONS ROUTES ======================
  // Get prescriptions by visit ID
  app.get('/api/visits/:visitId/prescriptions', async (req, res) => {
    try {
      const [prescriptions] = await pool.query(`
        SELECT p.*, 
               s.first_name AS doctor_first_name,
               s.last_name AS doctor_last_name
        FROM prescriptions p
        JOIN staff s ON p.prescribed_by_id = s.staff_id
        WHERE p.visit_id = ?
        ORDER BY p.prescription_date DESC
      `, [req.params.visitId]);
      
      // Get medication details for each prescription
      for (const prescription of prescriptions) {
        const [details] = await pool.query(`
          SELECT pd.*, m.name AS medication_name, m.generic_name
          FROM prescription_details pd
          JOIN medications m ON pd.medication_id = m.medication_id
          WHERE pd.prescription_id = ?
        `, [prescription.prescription_id]);
        
        prescription.medications = details;
      }
      
      res.status(200).json({ status: 'success', data: prescriptions });
    } catch (error) {
      console.error(`Error fetching prescriptions for visit ${req.params.visitId}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch prescriptions', error: error.message });
    }
  });
  
  // Get prescription by ID
  app.get('/api/prescriptions/:id', async (req, res) => {
    try {
      const [prescriptions] = await pool.query(`
        SELECT p.*, 
               s.first_name AS doctor_first_name,
               s.last_name AS doctor_last_name
        FROM prescriptions p
        JOIN staff s ON p.prescribed_by_id = s.staff_id
        WHERE p.prescription_id = ?
      `, [req.params.id]);
      
      if (prescriptions.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Prescription not found' });
      }
      
      const prescription = prescriptions[0];
      
      // Get medication details
      const [details] = await pool.query(`
        SELECT pd.*, m.name AS medication_name, m.generic_name
        FROM prescription_details pd
        JOIN medications m ON pd.medication_id = m.medication_id
        WHERE pd.prescription_id = ?
      `, [prescription.prescription_id]);
      
      prescription.medications = details;
      
      res.status(200).json({ status: 'success', data: prescription });
    } catch (error) {
      console.error(`Error fetching prescription ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch prescription', error: error.message });
    }
  });
  
  // Create a new prescription
  app.post('/api/prescriptions', async (req, res) => {
    try {
      // Basic validation
      const requiredFields = ['visit_id', 'prescribed_by_id', 'prescription_date', 'medications'];
      for (const field of requiredFields) {
        if (!req.body[field]) {
          return res.status(400).json({ status: 'error', message: `Missing required field: ${field}` });
        }
      }
      
      if (!Array.isArray(req.body.medications) || req.body.medications.length === 0) {
        return res.status(400).json({ status: 'error', message: 'At least one medication is required' });
      }
      
      // Validate visit exists
      const [visit] = await pool.query('SELECT * FROM visits WHERE visit_id = ?', [req.body.visit_id]);
      if (visit.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Visit does not exist' });
      }
      
      // Validate doctor exists
      const [doctor] = await pool.query('SELECT * FROM staff WHERE staff_id = ? AND (role = "Doctor" OR role = "Pharmacist")', [req.body.prescribed_by_id]);
      if (doctor.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Staff member does not exist or is not authorized to prescribe' });
      }
      
      // Begin transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();
      
      try {
        // Create prescription
        const [prescriptionResult] = await connection.query(
          'INSERT INTO prescriptions (visit_id, prescribed_by_id, prescription_date, notes) VALUES (?, ?, ?, ?)',
          [
            req.body.visit_id,
            req.body.prescribed_by_id,
            req.body.prescription_date,
            req.body.notes || null
          ]
        );
        
        const prescriptionId = prescriptionResult.insertId;
        
        // Add prescription details for each medication
        for (const med of req.body.medications) {
          // Validate medication exists
          const [medication] = await connection.query('SELECT * FROM medications WHERE medication_id = ?', [med.medication_id]);
          if (medication.length === 0) {
            throw new Error(`Medication with ID ${med.medication_id} does not exist`);
          }
          
          if (!med.dosage || !med.frequency || !med.duration || !med.duration_unit || !med.start_date) {
            throw new Error('Medication details incomplete');
          }
          
          await connection.query(
            `INSERT INTO prescription_details (
              prescription_id, medication_id, dosage, frequency, 
              duration, duration_unit, start_date, end_date, special_instructions
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              prescriptionId,
              med.medication_id,
              med.dosage,
              med.frequency,
              med.duration,
              med.duration_unit,
              med.start_date,
              med.end_date || null,
              med.special_instructions || null
            ]
          );
        }
        
        await connection.commit();
        connection.release();
        
        res.status(201).json({ 
          status: 'success', 
          message: 'Prescription created successfully', 
          data: { prescription_id: prescriptionId }
        });
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      console.error('Error creating prescription:', error);
      res.status(500).json({ status: 'error', message: 'Failed to create prescription', error: error.message });
    }
  });
  
  // Update a prescription
  app.put('/api/prescriptions/:id', async (req, res) => {
    try {
      // Check if prescription exists
      const [prescription] = await pool.query('SELECT * FROM prescriptions WHERE prescription_id = ?', [req.params.id]);
      if (prescription.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Prescription not found' });
      }
      
      // Create dynamic SQL update query for prescription
      const updates = [];
      const values = [];
      
      // Only update fields that are provided
      const allowedFields = ['prescribed_by_id', 'prescription_date', 'notes'];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      });
      
      // If medications are provided, handle that separately
      const updateMedications = req.body.medications && Array.isArray(req.body.medications);
      
      if (updates.length === 0 && !updateMedications) {
        return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
      }
      
      // Begin transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();
      
      try {
        // Update prescription if there are basic fields to update
        if (updates.length > 0) {
          // Add prescription_id to values array for WHERE clause
          values.push(req.params.id);
          
          await connection.query(
            `UPDATE prescriptions SET ${updates.join(', ')} WHERE prescription_id = ?`,
            values
          );
        }
        
        // Update medications if provided
        if (updateMedications) {
          // Delete existing prescription details
          await connection.query('DELETE FROM prescription_details WHERE prescription_id = ?', [req.params.id]);
          
          // Add new prescription details for each medication
          for (const med of req.body.medications) {
            // Validate medication exists
            const [medication] = await connection.query('SELECT * FROM medications WHERE medication_id = ?', [med.medication_id]);
            if (medication.length === 0) {
              throw new Error(`Medication with ID ${med.medication_id} does not exist`);
            }
            
            if (!med.dosage || !med.frequency || !med.duration || !med.duration_unit || !med.start_date) {
              throw new Error('Medication details incomplete');
            }
            
            await connection.query(
              `INSERT INTO prescription_details (
                prescription_id, medication_id, dosage, frequency, 
                duration, duration_unit, start_date, end_date, special_instructions
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                req.params.id,
                med.medication_id,
                med.dosage,
                med.frequency,
                med.duration,
                med.duration_unit,
                med.start_date,
                med.end_date || null,
                med.special_instructions || null
              ]
            );
          }
        }
        
        await connection.commit();
        connection.release();
        
        res.status(200).json({ status: 'success', message: 'Prescription updated successfully' });
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      console.error(`Error updating prescription ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to update prescription', error: error.message });
    }
  });
  
  // Delete a prescription
  app.delete('/api/prescriptions/:id', async (req, res) => {
    try {
      // Check if prescription exists
      const [prescription] = await pool.query('SELECT * FROM prescriptions WHERE prescription_id = ?', [req.params.id]);
      if (prescription.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Prescription not found' });
      }
      
      // Begin transaction
      const connection = await pool.getConnection();
      await connection.beginTransaction();
      
      try {
        // Delete prescription details first
        await connection.query('DELETE FROM prescription_details WHERE prescription_id = ?', [req.params.id]);
        
        // Delete prescription
        await connection.query('DELETE FROM prescriptions WHERE prescription_id = ?', [req.params.id]);
        
        await connection.commit();
        connection.release();
        
        res.status(200).json({ status: 'success', message: 'Prescription deleted successfully' });
      } catch (error) {
        await connection.rollback();
        connection.release();
        throw error;
      }
    } catch (error) {
      console.error(`Error deleting prescription ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to delete prescription', error: error.message });
    }
  });
  
  // ====================== LAB TESTS ROUTES ======================
  // Get lab tests by visit ID
  app.get('/api/visits/:visitId/lab-tests', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT l.*, 
               s.first_name AS doctor_first_name,
               s.last_name AS doctor_last_name
        FROM lab_tests l
        JOIN staff s ON l.requested_by_id = s.staff_id
        WHERE l.visit_id = ?
        ORDER BY l.test_date DESC
      `, [req.params.visitId]);
      
      res.status(200).json({ status: 'success', data: rows });
    } catch (error) {
      console.error(`Error fetching lab tests for visit ${req.params.visitId}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch lab tests', error: error.message });
    }
  });
  
  // Get lab test by ID
  app.get('/api/lab-tests/:id', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT l.*, 
               s.first_name AS doctor_first_name,
               s.last_name AS doctor_last_name
        FROM lab_tests l
        JOIN staff s ON l.requested_by_id = s.staff_id
        WHERE l.lab_test_id = ?
      `, [req.params.id]);
      
      if (rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lab test not found' });
      }
      
      res.status(200).json({ status: 'success', data: rows[0] });
    } catch (error) {
      console.error(`Error fetching lab test ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch lab test', error: error.message });
    }
  });
  
  // Create a new lab test
  app.post('/api/lab-tests', async (req, res) => {
    try {
      // Basic validation
      const requiredFields = ['visit_id', 'test_name', 'test_date', 'requested_by_id', 'status'];
      for (const field of requiredFields) {
        if (!req.body[field]) {
          return res.status(400).json({ status: 'error', message: `Missing required field: ${field}` });
        }
      }
      
      // Validate visit exists
      const [visit] = await pool.query('SELECT * FROM visits WHERE visit_id = ?', [req.body.visit_id]);
      if (visit.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Visit does not exist' });
      }
      
      // Validate doctor exists
      const [doctor] = await pool.query('SELECT * FROM staff WHERE staff_id = ? AND role = "Doctor"', [req.body.requested_by_id]);
      if (doctor.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Doctor does not exist or staff member is not a doctor' });
      }

      const result = await pool.query(
        `INSERT INTO lab_tests (
          visit_id, test_name, test_date, requested_by_id, results, 
          result_date, normal_range, interpretation, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.body.visit_id,
          req.body.test_name,
          req.body.test_date,
          req.body.requested_by_id,
          req.body.results || null,
          req.body.result_date || null,
          req.body.normal_range || null,
          req.body.interpretation || null,
          req.body.status
        ]
      );
      
      res.status(201).json({ 
        status: 'success', 
        message: 'Lab test created successfully', 
        data: { lab_test_id: result[0].insertId }
      });
    } catch (error) {
      console.error('Error creating lab test:', error);
      res.status(500).json({ status: 'error', message: 'Failed to create lab test', error: error.message });
    }
  });
  
  // Update a lab test
  app.put('/api/lab-tests/:id', async (req, res) => {
    try {
      // Check if lab test exists
      const [labTest] = await pool.query('SELECT * FROM lab_tests WHERE lab_test_id = ?', [req.params.id]);
      if (labTest.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lab test not found' });
      }
      
      // Create dynamic SQL update query
      const updates = [];
      const values = [];
      
      // Only update fields that are provided
      const allowedFields = [
        'test_name', 'test_date', 'requested_by_id', 'results', 
        'result_date', 'normal_range', 'interpretation', 'status'
      ];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      });
      
      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
      }
      
      // Add lab_test_id to values array for WHERE clause
      values.push(req.params.id);
      
      await pool.query(
        `UPDATE lab_tests SET ${updates.join(', ')} WHERE lab_test_id = ?`,
        values
      );
      
      res.status(200).json({ status: 'success', message: 'Lab test updated successfully' });
    } catch (error) {
      console.error(`Error updating lab test ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to update lab test', error: error.message });
    }
  });
  
  // Delete a lab test
  app.delete('/api/lab-tests/:id', async (req, res) => {
    try {
      // Check if lab test exists
      const [labTest] = await pool.query('SELECT * FROM lab_tests WHERE lab_test_id = ?', [req.params.id]);
      if (labTest.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lab test not found' });
      }
      
      await pool.query('DELETE FROM lab_tests WHERE lab_test_id = ?', [req.params.id]);
      
      res.status(200).json({ status: 'success', message: 'Lab test deleted successfully' });
    } catch (error) {
      console.error(`Error deleting lab test ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to delete lab test', error: error.message });
    }
  });
  
  // ====================== LAB TESTS ROUTES ======================
  // Get lab tests by visit ID
  app.get('/api/visits/:visitId/lab-tests', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT l.*, 
               s.first_name AS doctor_first_name,
               s.last_name AS doctor_last_name
        FROM lab_tests l
        JOIN staff s ON l.requested_by_id = s.staff_id
        WHERE l.visit_id = ?
        ORDER BY l.test_date DESC
      `, [req.params.visitId]);
      
      res.status(200).json({ status: 'success', data: rows });
    } catch (error) {
      console.error(`Error fetching lab tests for visit ${req.params.visitId}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch lab tests', error: error.message });
    }
  });
  
  // Get lab test by ID
  app.get('/api/lab-tests/:id', async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT l.*, 
               s.first_name AS doctor_first_name,
               s.last_name AS doctor_last_name
        FROM lab_tests l
        JOIN staff s ON l.requested_by_id = s.staff_id
        WHERE l.lab_test_id = ?
      `, [req.params.id]);
      
      if (rows.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lab test not found' });
      }
      
      res.status(200).json({ status: 'success', data: rows[0] });
    } catch (error) {
      console.error(`Error fetching lab test ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to fetch lab test', error: error.message });
    }
  });
  
  // Create a new lab test
  app.post('/api/lab-tests', async (req, res) => {
    try {
      // Basic validation
      const requiredFields = ['visit_id', 'test_name', 'test_date', 'requested_by_id', 'status'];
      for (const field of requiredFields) {
        if (!req.body[field]) {
          return res.status(400).json({ status: 'error', message: `Missing required field: ${field}` });
        }
      }
      
      // Validate visit exists
      const [visit] = await pool.query('SELECT * FROM visits WHERE visit_id = ?', [req.body.visit_id]);
      if (visit.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Visit does not exist' });
      }
      
      // Validate doctor exists
      const [doctor] = await pool.query('SELECT * FROM staff WHERE staff_id = ? AND role = "Doctor"', [req.body.requested_by_id]);
      if (doctor.length === 0) {
        return res.status(400).json({ status: 'error', message: 'Doctor does not exist or staff member is not a doctor' });
      }

      const result = await pool.query(
        `INSERT INTO lab_tests (
          visit_id, test_name, test_date, requested_by_id, results, 
          result_date, normal_range, interpretation, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          req.body.visit_id,
          req.body.test_name,
          req.body.test_date,
          req.body.requested_by_id,
          req.body.results || null,
          req.body.result_date || null,
          req.body.normal_range || null,
          req.body.interpretation || null,
          req.body.status
        ]
      );
      
      res.status(201).json({ 
        status: 'success', 
        message: 'Lab test created successfully', 
        data: { lab_test_id: result[0].insertId }
      });
    } catch (error) {
      console.error('Error creating lab test:', error);
      res.status(500).json({ status: 'error', message: 'Failed to create lab test', error: error.message });
    }
  });
  
  // Update a lab test
  app.put('/api/lab-tests/:id', async (req, res) => {
    try {
      // Check if lab test exists
      const [labTest] = await pool.query('SELECT * FROM lab_tests WHERE lab_test_id = ?', [req.params.id]);
      if (labTest.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lab test not found' });
      }
      
      // Create dynamic SQL update query
      const updates = [];
      const values = [];
      
      // Only update fields that are provided
      const allowedFields = [
        'test_name', 'test_date', 'requested_by_id', 'results', 
        'result_date', 'normal_range', 'interpretation', 'status'
      ];
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(req.body[field]);
        }
      });
      
      if (updates.length === 0) {
        return res.status(400).json({ status: 'error', message: 'No valid fields to update' });
      }
      
      // Add lab_test_id to values array for WHERE clause
      values.push(req.params.id);
      
      await pool.query(
        `UPDATE lab_tests SET ${updates.join(', ')} WHERE lab_test_id = ?`,
        values
      );
      
      res.status(200).json({ status: 'success', message: 'Lab test updated successfully' });
    } catch (error) {
      console.error(`Error updating lab test ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to update lab test', error: error.message });
    }
  });
  
  // Delete a lab test
  app.delete('/api/lab-tests/:id', async (req, res) => {
    try {
      // Check if lab test exists
      const [labTest] = await pool.query('SELECT * FROM lab_tests WHERE lab_test_id = ?', [req.params.id]);
      if (labTest.length === 0) {
        return res.status(404).json({ status: 'error', message: 'Lab test not found' });
      }
      
      await pool.query('DELETE FROM lab_tests WHERE lab_test_id = ?', [req.params.id]);
      
      res.status(200).json({ status: 'success', message: 'Lab test deleted successfully' });
    } catch (error) {
      console.error(`Error deleting lab test ${req.params.id}:`, error);
      res.status(500).json({ status: 'error', message: 'Failed to delete lab test', error: error.message });
    }
  });



    // Error handling middleware
    app.use((err, req, res, next) => {
      console.error(err.stack);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    });

    app.use((req, res) => {
      res.status(404).json({
        success: false,
        message: 'Route not found',
        details: {
          method: req.method,
          url: req.originalUrl,
          path: req.path,
          ip: req.ip,
          timestamp: new Date().toISOString()
        }
      });
    });
    
    




  const getLocalIp = () => {
    const interfaces = os.networkInterfaces();
    for (const iface of Object.values(interfaces)) {
        for (const info of iface) {
            if (info.family === 'IPv4' && !info.internal) {
                return info.address; // Return first non-internal IPv4
            }
        }
    }
    return 'localhost'; // Fallback to localhost
};

const localIp = getLocalIp();



  
  app.listen(port,  () => {
    console.log(`Server running at http://${localIp}:${port}/`);
});
  module.exports = app;
  