# Hospital Management System (HMS)

## 🏥 Overview
The **Hospital Management System (HMS)** is a web-based application designed to streamline hospital operations, including patient management, doctor scheduling, appointments, billing, and inventory management. Built with **Node.js**, it ensures a scalable, secure, and efficient backend.

## 📌 Features
- **Patient Management**: Register, update, and manage patient records.
- **Doctor Scheduling**: Assign and track doctor availability.
- **Appointment Booking**: Patients can book appointments with doctors.
- **Billing & Payments**: Generate invoices and process payments.
- **Inventory Management**: Manage medical supplies and stock.
- **Authentication & Authorization**: Secure login for admin, doctors, and patients.
- **Reports & Analytics**: Generate reports on hospital operations.

## 🛠 Tech Stack
- **Backend**: Node.js, Express.js
- **Database**: MongoDB / MySQL
- **Authentication**: JWT (JSON Web Tokens)


## 🚀 Installation
### **Prerequisites**
- Install **Node.js** and **npm**
- Install **MongoDB** or **MySQL** (Choose your preferred database)

### **Steps to Run**
```sh
# Clone the repository
git clone https://github.com/kimemia21/hosi.git

# Navigate to the project directory
cd hospital-management-system

# Install dependencies
npm install

# Configure environment variables (Rename .env.example to .env and update values)
cp .env.example .env

# Start the server
npm start
```

## 🌍 API Endpoints
| Method | Endpoint             | Description                        |
|--------|----------------------|------------------------------------|
| GET    | /api/patients        | Get all patients                  |
| POST   | /api/patients        | Register a new patient            |
| GET    | /api/doctors         | Get all doctors                   |
| POST   | /api/appointments    | Book an appointment               |
| POST   | /api/auth/register   | Register a user                   |
| POST   | /api/auth/login      | Login a user                      |

## 🛡 Security
- **Authentication**: JWT for secure API access.
- **Data Validation**: Express Validator for input sanitization.
- **Encryption**: Passwords hashed with bcrypt.

## 📝 License
This project is licensed under the **MIT License**.

## 🙌 Contributors
- **Your Name** - [GitHub](https://github.com/kimemia21)

## 📧 Contact
For any inquiries, reach out at **thukukimemiadavid@gmail.com**.

---

Made with ❤️ by mems

