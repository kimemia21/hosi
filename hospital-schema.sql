
CREATE TABLE patients (
    patient_id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE NOT NULL,
    gender ENUM('Male', 'Female', 'Other') NOT NULL,
    blood_type ENUM('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'),
    address VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20) NOT NULL,
    country VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100),
    emergency_contact_name VARCHAR(200),
    emergency_contact_phone VARCHAR(20),
    emergency_contact_relation VARCHAR(100),
    insurance_provider VARCHAR(100),
    insurance_policy_number VARCHAR(100),
    allergies TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Staff Table
CREATE TABLE staff (
    staff_id INT PRIMARY KEY AUTO_INCREMENT,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role ENUM('Doctor', 'Nurse', 'Pharmacist', 'Lab Technician', 'Admin', 'Other') NOT NULL,
    department_id INT,
    specialization VARCHAR(100),
    license_number VARCHAR(50),
    phone VARCHAR(20) NOT NULL,
    email VARCHAR(100) NOT NULL,
    hire_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Departments Table
CREATE TABLE departments (
    department_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    location VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add foreign key to staff table
ALTER TABLE staff
ADD CONSTRAINT fk_staff_department
FOREIGN KEY (department_id) REFERENCES departments(department_id);

-- Diseases/Conditions Table
CREATE TABLE diseases (
    disease_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    icd_code VARCHAR(20),
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Medications Table
CREATE TABLE medications (
    medication_id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(200) NOT NULL,
    generic_name VARCHAR(200),
    description TEXT,
    dosage_form VARCHAR(100),
    strength VARCHAR(100),
    manufacturer VARCHAR(200),
    unit_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Visits Table
CREATE TABLE visits (
    visit_id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    visit_date DATETIME NOT NULL,
    visit_type ENUM('Emergency', 'Outpatient', 'Inpatient', 'Follow-up', 'Consultation') NOT NULL,
    primary_complaint TEXT NOT NULL,
    initial_diagnosis TEXT,
    final_diagnosis TEXT,
    attending_doctor_id INT NOT NULL,
    vital_signs TEXT,
    visit_notes TEXT,
    discharge_date DATETIME,
    discharge_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id),
    FOREIGN KEY (attending_doctor_id) REFERENCES staff(staff_id)
);

-- Diagnoses Table (links visits to diseases)
CREATE TABLE diagnoses (
    diagnosis_id INT PRIMARY KEY AUTO_INCREMENT,
    visit_id INT NOT NULL,
    disease_id INT NOT NULL,
    diagnosis_date DATETIME NOT NULL,
    diagnosis_notes TEXT,
    diagnosing_doctor_id INT NOT NULL,
    severity ENUM('Mild', 'Moderate', 'Severe', 'Critical') NOT NULL,
    status ENUM('Suspected', 'Confirmed', 'Ruled Out', 'Resolved') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(visit_id),
    FOREIGN KEY (disease_id) REFERENCES diseases(disease_id),
    FOREIGN KEY (diagnosing_doctor_id) REFERENCES staff(staff_id)
);

-- Prescriptions Table
CREATE TABLE prescriptions (
    prescription_id INT PRIMARY KEY AUTO_INCREMENT,
    visit_id INT NOT NULL,
    prescribed_by_id INT NOT NULL,
    prescription_date DATETIME NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(visit_id),
    FOREIGN KEY (prescribed_by_id) REFERENCES staff(staff_id)
);

-- Prescription Details Table
CREATE TABLE prescription_details (
    prescription_detail_id INT PRIMARY KEY AUTO_INCREMENT,
    prescription_id INT NOT NULL,
    medication_id INT NOT NULL,
    dosage VARCHAR(100) NOT NULL,
    frequency VARCHAR(100) NOT NULL,
    duration INT NOT NULL,
    duration_unit ENUM('Days', 'Weeks', 'Months') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    special_instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(prescription_id),
    FOREIGN KEY (medication_id) REFERENCES medications(medication_id)
);

-- Billing Table
CREATE TABLE billing (
    bill_id INT PRIMARY KEY AUTO_INCREMENT,
    visit_id INT NOT NULL,
    bill_date DATETIME NOT NULL,
    total_amount DECIMAL(10, 2) NOT NULL,
    paid_amount DECIMAL(10, 2) DEFAULT 0,
    payment_status ENUM('Unpaid', 'Partial', 'Paid', 'Insurance Pending', 'Insurance Denied') NOT NULL,
    payment_method ENUM('Cash', 'Credit Card', 'Insurance', 'Bank Transfer', 'Other') DEFAULT NULL,
    insurance_claim_id VARCHAR(100),
    insurance_coverage_amount DECIMAL(10, 2) DEFAULT 0,
    patient_responsibility DECIMAL(10, 2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(visit_id)
);

-- Billing Items Table
CREATE TABLE billing_items (
    billing_item_id INT PRIMARY KEY AUTO_INCREMENT,
    bill_id INT NOT NULL,
    item_type ENUM('Consultation', 'Medication', 'Lab Test', 'Procedure', 'Room Charge', 'Other') NOT NULL,
    item_description VARCHAR(255) NOT NULL,
    quantity INT NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    total_price DECIMAL(10, 2) NOT NULL,
    medication_id INT,  -- NULL if not a medication
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (bill_id) REFERENCES billing(bill_id),
    FOREIGN KEY (medication_id) REFERENCES medications(medication_id)
);

-- Lab Tests Table
CREATE TABLE lab_tests (
    lab_test_id INT PRIMARY KEY AUTO_INCREMENT,
    visit_id INT NOT NULL,
    test_name VARCHAR(200) NOT NULL,
    test_date DATETIME NOT NULL,
    requested_by_id INT NOT NULL,
    results TEXT,
    result_date DATETIME,
    normal_range VARCHAR(200),
    interpretation TEXT,
    status ENUM('Requested', 'In Progress', 'Completed', 'Canceled') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (visit_id) REFERENCES visits(visit_id),
    FOREIGN KEY (requested_by_id) REFERENCES staff(staff_id)
);

-- Medical History Table
CREATE TABLE medical_history (
    history_id INT PRIMARY KEY AUTO_INCREMENT,
    patient_id INT NOT NULL,
    condition_name VARCHAR(200) NOT NULL,
    diagnosis_date DATE,
    treatment_summary TEXT,
    is_current BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(patient_id)
);

-- Audit Log Table
CREATE TABLE audit_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,  -- ID of the staff member who made the change
    action_type ENUM('Create', 'Read', 'Update', 'Delete') NOT NULL,
    table_name VARCHAR(100) NOT NULL,
    record_id INT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES staff(staff_id)
);

-- Indexes for better performance
CREATE INDEX idx_patient_name ON patients(last_name, first_name);
CREATE INDEX idx_staff_name ON staff(last_name, first_name);
CREATE INDEX idx_visit_date ON visits(visit_date);
CREATE INDEX idx_diagnosis_visit ON diagnoses(visit_id);
CREATE INDEX idx_prescription_visit ON prescriptions(visit_id);
CREATE INDEX idx_bill_visit ON billing(visit_id);
CREATE INDEX idx_medication_name ON medications(name);