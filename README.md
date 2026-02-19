# Twinhill Payroll Management System

A secure, enterprise-grade payroll platform designed to streamline document management, employee administration, and issue resolution. This application features a modern UI built with React and Tailwind CSS, backed by Firebase for real-time data and authentication.

It leverages **Artificial Intelligence (Google Gemini API)** to automatically analyze uploaded PDF pay stubs, extracting critical details such as net pay, pay periods, and employee names to reduce manual data entry.

## ✨ Key Features

*   **Role-Based Access Control (RBAC):** Distinct dashboards and permission levels for **Admins** and **Employees**.
*   **AI-Powered Document Processing:** Automatically parses PDF payroll documents to extract financial data using computer vision and LLMs.
*   **Real-time Dashboard:** Visual statistics for payroll distribution, document status, and user metrics.
*   **Secure Authentication:** Integrated Email/Password and Google Sign-In via Firebase Auth.
*   **User Management:** Admins can promote/demote users and view detailed staff lists.
*   **Support Ticketing System:** Dedicated module for employees to raise concerns and for admins to resolve them.
*   **Responsive Design:** Fully responsive interface optimized for desktop and tablet usage.

## 🛠️ Tech Stack

*   **Frontend:** React 19, TypeScript, Tailwind CSS
*   **Backend / Database:** Firebase (Firestore, Authentication)
*   **AI / ML:** Google GenAI SDK (Gemini 2.5 Flash)
*   **Icons:** Lucide React
*   **Build Tool:** Vite

## 🚀 Getting Started

Follow these instructions to set up the project locally.

### Prerequisites

*   Node.js (v18 or higher)
*   npm or yarn
*   A Firebase project
*   A Google AI API Key (for Gemini)

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/twinhill-payroll.git
    cd twinhill-payroll
    ```

2.  **Install dependencies**
    ```bash
    npm install
    ```

3.  **Environment Configuration**
    Create a `.env` file in the root directory to store your API keys. This is required for the AI document analysis feature.
    
    ```env
    # .env
    API_KEY=your_google_gemini_api_key_here
    ```

### 🔥 Firebase Configuration

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Create a new project.
3.  **Authentication:** Enable **Email/Password** and **Google** providers in the Authentication menu.
4.  **Firestore:** Create a Firestore database.
5.  **Copy Config:** Go to Project Settings > General > Your Apps, select "Web", and copy the configuration object.
6.  Update `src/utils/firebase.ts` with your specific configuration:

    ```typescript
    // src/utils/firebase.ts
    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "your-project.firebaseapp.com",
      projectId: "your-project-id",
      storageBucket: "your-project.firebasestorage.app",
      messagingSenderId: "your-sender-id",
      appId: "your-app-id"
    };
    ```

### 🔒 Security Rules

To ensure the application functions correctly, update your Firestore Security Rules in the Firebase Console. The following rules allow Admins to manage all users while restricting Employees to their own data.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Helper function to check if user is admin
    function isAdmin() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'Admin';
    }

    match /users/{userId} {
      // Owner can read/write their own doc. Admin can read/write any.
      allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      
      match /{allPaths=**} {
        allow read, write: if request.auth != null && (request.auth.uid == userId || isAdmin());
      }
    }
    
    match /audit_logs/{logId} {
      // Only Admins can read logs. Anyone authenticated can write (to log actions).
      allow read: if request.auth != null && isAdmin();
      allow write: if request.auth != null;
    }
  }
}
```

### Running the App

```bash
npm run dev
```

Open your browser and navigate to `http://localhost:5173` (or the port shown in your terminal).

## 📖 Usage Guide

### First-Time Login
*   **Admin Access:** The first user to sign up with an email containing the word `admin` (e.g., `admin@twinhill.com`) is automatically assigned the **Admin** role.
*   **Employee Access:** All other sign-ups default to the **Employee** role.

### Admin Capabilities
1.  **Upload Documents:** Navigate to "Upload Documents". Drag and drop a PDF pay stub. The AI will analyze it. Confirm the extracted details and assign it to an employee.
2.  **Manage Users:** View all registered users. Toggle the "Shield" icon to promote an Employee to Admin or revoke Admin rights.
3.  **Resolve Concerns:** View tickets submitted by employees and mark them as resolved.

### Employee Capabilities
1.  **View Dashboard:** See personal document statistics.
2.  **My Documents:** View and filter personal pay stubs and tax documents.
3.  **Support:** Submit concerns regarding payroll or HR issues.

## 📄 License

This project is licensed under the MIT License.