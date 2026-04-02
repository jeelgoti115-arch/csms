# Car Service Management System (CSMS) - Project Report

## Project Overview

The CSMS implements a complete Car Service Management System with a Node.js backend and a static frontend. The backend uses Express and MongoDB via Mongoose to provide REST APIs for authentication, vehicle workflow, contact messages, appointments, services, and user management. The frontend delivers static pages, role-specific dashboards, and dynamic client-side logic in `frontend/js/app.js`.

This report documents every file in the `csms` workspace and describes its purpose, technology, and how it fits into the application.

---

## Workspace Structure

- `backend/`
  - `package.json`
  - `package-lock.json`
  - `README.md`
  - `server.js`
  - `scripts/checkMongo.js`
  - `models/`
    - `index.js`
    - `appointment.js`
    - `contact.js`
    - `service.js`
    - `session.js`
    - `user.js`
    - `vehicle.js`
- `frontend/`
  - `index.html`
  - `about.html`
  - `features.html`
  - `contact.html`
  - `logreg.html`
  - `admin.html`
  - `advisor.html`
  - `receptionist.html`
  - `technician.html`
  - `qc.html`
  - `guard.html`
  - `css/`
    - `index.css`
    - `features.css`
    - `contact.css`
    - `about.css`
  - `images/`
    - `favicon.ico`
  - `js/`
    - `app.js`
  - `uploads/`
    - `avatars/`
- `report.md`

---

## Backend Files

### `backend/package.json`

- Defines the Node.js backend package.
- Dependencies:
  - `express` for the web server.
  - `mongoose` for MongoDB object modeling.
  - `body-parser` for JSON request payload handling.
  - `cors` for cross-origin access.
  - `dotenv` for environment variables.
  - `multer` for file upload handling.
- Dev dependency:
  - `nodemon` for development auto-restart.
- Scripts:
  - `start`: `node server.js`
  - `dev`: `nodemon server.js`

### `backend/README.md`

- Provides a quick start guide for the backend.
- Lists core API endpoints including services and appointments.
- Notes: the README refers to SQLite and Sequelize in the text, but the actual backend code uses MongoDB and Mongoose.

### `backend/server.js`

This file is the main Express application and contains the full backend logic:

- Loads environment variables with `dotenv`.
- Imports the database models from `backend/models`.
- Configures middleware:
  - `cors()` to allow cross-origin requests.
  - `express.json()` and `express.urlencoded()` for large JSON payloads.
- Serves the static frontend from `../frontend`.
- Ensures `frontend/uploads/avatars` exists for avatar uploads.
- Configures `multer` for avatar uploads with image validation and a 1MB file size limit.

#### Authentication and Session Handling

- `generateToken()` uses `crypto.randomBytes` for secure token generation.
- `authMiddleware()` validates the `x-session-token` header or `token` query parameter.
  - It checks MongoDB `Session` records and verifies `expiresAt`.
  - It populates `req.user` from the referenced `User`.

#### API Endpoints

- `/api/services`
  - GET: returns all service records.
  - POST: creates a service record (admin only).
  - DELETE: removes a service record (admin only).

- `/api/users`
  - GET: lists users (authenticated access).
  - GET `/:id`: returns a single user (admin only).
  - POST: creates a user account (admin only) with optional avatar upload.
  - PUT `/:id`: updates a user (admin only), handles email uniqueness.
  - DELETE `/:id`: deletes a user (admin only), protects admin from deleting self.

- `/api/data`
  - Returns aggregated objects: all users, grouped users by role, vehicles, contacts.

- `/api/login`
  - Authenticates a user by email/password.
  - Returns user info minus password and generates a session token valid for 7 days.

- `/api/me`
  - Returns the currently logged-in user based on session token.

- `/api/logout`
  - Deletes the active session and invalidates the token.

- `/api/vehicles`
  - GET: role-aware vehicle retrieval.
    - `guard` sees vehicles created by them.
    - `advisor` sees vehicles assigned to them.
    - `technician` sees vehicles assigned to their technician identity.
    - `qc` sees QC-related workflow states.
    - `admin` and `receptionist` see all vehicles.
  - POST: creates a new vehicle record.
    - Allowed for `admin` and `guard` roles.
    - Stores status, service/inspection states, history and ownership metadata.
  - PUT `/:id`: updates vehicle fields and appends history entries.
  - DELETE `/:id`: deletes a vehicle (admin only).

- `/api/migrate-vehicles`
  - Allows migration of vehicle data from legacy local storage.
  - Converts legacy field names into the current schema.

- `/api/contacts`
  - POST: stores an inbound contact message.
  - GET: returns all contact messages.
  - PUT `/:id`: updates a contact record.
  - DELETE `/:id`: deletes a contact record.

- `/api/appointments`
  - POST: creates an appointment record.
  - GET: returns appointments with populated `userId` and `serviceId` references.

- `/api/admin/reset`
  - Clears vehicle and contact data.
  - Only accessible by admin.

#### Error Handling

- Global error middleware handles:
  - file upload size limit errors.
  - JSON payload size errors.
  - invalid JSON syntax.
- Error responses return structured JSON with `error` messages.

#### Initialization and Seeding

- The app delays initialization by 2 seconds using `setTimeout(initializeDB, 2000)`.
- `initializeDB()` performs startup housekeeping:
  - Drops old legacy MongoDB indexes if present.
  - Seeds built-in services if none exist.
  - Seeds a default admin user if missing.
  - Seeds sample vehicle and sample contact data if empty.
- Finally, starts the server on `PORT` or `3000`.

### `backend/scripts/checkMongo.js`

- Connects to MongoDB using `MONGO_URL` or default `mongodb://127.0.0.1:27017/csms`.
- Logs record counts for `User`, `Vehicle`, `Service`, and `Contact` collections.
- Prints example sample records.
- Useful for basic database connectivity validation.

### `backend/models/index.js`

- Connects to MongoDB using `MONGO_URL` or `mongodb://localhost:27017/jeel`.
- Exports the model objects:
  - `User`
  - `Service`
  - `Appointment`
  - `Vehicle`
  - `Contact`
  - `Session`

### `backend/models/user.js`

- Defines the `User` schema.
- Fields:
  - `name`, `email`, `password`
  - `role` with enum values: `customer`, `technician`, `advisor`, `receptionist`, `admin`, `qc`, `guard`
  - `status` with `active` / `inactive`
  - optional `phone`, `specialization`, `avatar`
  - session metadata fields that are not directly used by server-side login flow.

### `backend/models/service.js`

- Defines a simple service offering schema.
- Fields: `title`, `description`.
- Used by the `/api/services` route and appointment population.

### `backend/models/appointment.js`

- Appointment schema fields:
  - `date`
  - `notes`
  - `userId` reference to `User`
  - `serviceId` reference to `Service`
- Includes automatic timestamps.

### `backend/models/vehicle.js`

This schema is the most complex and models the vehicle service workflow.

- Required fields: `plate`, `owner`.
- Optional fields: `ownerEmail`, `mobileNumber`, `make`, `model`, `year`, `color`.
- Workflow metadata:
  - `assignedAdvisor`
  - `qcAssignedTo`, `qcAssignedToName`, `qcAssignedToEmail`, `qcAssignedToId`
  - `serviceStatus` enums covering multiple stages.
  - `inspectionStatus` and `inspectionReport`.
  - `serviceDescription`, `jobs`, `jobsAssigned`, `qcStatus`, `qcNotes`, `qcPriority`, and cost/time tracking.
  - `status` with values `entered` or `exit`.
- `history`: array of change records with timestamps, actor, note, and field-level changes.

### `backend/models/contact.js`

- Captures inbound contact messages.
- Fields: `name`, `email`, `phone`, `problemType`, `description`, `status`, `adminResponse`.
- Useful for customer support and admin response workflows.

### `backend/models/session.js`

- Stores authenticated session tokens.
- Fields:
  - `userId` reference to `User`
  - `token` unique session token
  - `expiresAt` with TTL index to expire sessions automatically.

---

## Frontend Files

### `frontend/index.html`

- Landing page and public homepage.
- Includes navigation links to About, Features, Contact, and login.
- Contains hero section and feature cards.
- Uses `css/index.css` for styling.

### `frontend/about.html`

- Static about page describing the platform.
- Includes content sections and visual styling.
- Uses the same page layout style as the rest of the site.

### `frontend/features.html`

- Static feature details page.
- Enumerates platform capabilities.
- Uses feature-focused presentation.

### `frontend/contact.html`

- Static contact page.
- Contains contact form elements and contact information.
- Uses `css/contact.css` styling.
- Likely posts messages to `/api/contacts` via client-side JavaScript.

### `frontend/logreg.html`

- Login and registration page.
- Includes forms for login and registration.
- Uses inline CSS styles directly in the page.
- Client logic in `js/app.js` handles login and disables registration by returning a disabled result.

### `frontend/admin.html`

- Admin dashboard page.
- Displays user and vehicle summaries.
- Gives administrator the ability to reset data.
- Shows contact messages and response actions.
- Uses inline CSS and page-specific elements.

### `frontend/advisor.html`

- Advisor role dashboard.
- Displays vehicles assigned to advisors and allows sending vehicles to technicians or QC.
- Uses inline CSS styles.

### `frontend/receptionist.html`

- Receptionist dashboard.
- Displays vehicles through workflow states and can assign or deliver vehicles.
- Includes vehicle history toggles.

### `frontend/technician.html`

- Technician dashboard.
- Lists assigned vehicles and marks service completion.
- Focused on `with_technician` workflow state.

### `frontend/qc.html`

- Quality control dashboard.
- Lists vehicles in QC.
- Mark cars ready for delivery.

### `frontend/guard.html`

- Guard dashboard.
- Captures new vehicle entry records.
- Guards can add vehicle plate and owner details.

### `frontend/css/index.css`

- Provides styles for the public landing page.
- Includes hero layout, nav menu, buttons, responsive design, and animations.
- Likely used by `index.html`.

### `frontend/css/features.css`

- Style sheet for the features page.
- Controls layout, cards, typography, and responsive behavior.

### `frontend/css/contact.css`

- Style sheet for the contact page.
- Defines form styling and contact section visuals.

### `frontend/css/about.css`

- Style sheet for the about page.
- Defines section spacing, typography, and layout.

### `frontend/js/app.js`

This is the frontend application logic and contains the actual interactive behavior for the entire site.

#### Session Management

- Uses `sessionStorage` to store:
  - `vs_session_token`
  - `vs_current_user`
- Includes migration logic from legacy keys such as `vsms_session_token`, `vsms_current_user`, and `vs_current`.
- Provides helper functions:
  - `getToken()`
  - `setToken()`
  - `clearToken()`
  - `currentUser()`
  - `setCurrent()`
  - `clearCurrent()`

#### API Request Handling

- Defines `apiCall(url, opts)` to include the session token header.
- Uses `fetch()` for HTTP requests to backend API endpoints.

#### Notification System

- Creates an in-page notification element `vs-notify`.
- Uses `notify(msg, type, timeout)` to show success, error, info, or warning messages.

#### Authentication Flow

- `login(email, password)` calls `/api/login`.
- Stores token and user info on success.
- `register(...)` returns a disabled result because public registration is disabled.
- `renderAuth()` updates UI links and login/register form behavior.
- `logout()` invalidates the session on the backend and clears storage.

#### Role-based Navigation

- `renderAuth()` builds role-specific dashboard links.
- Uses role mapping:
  - `guard` -> `guard.html`
  - `receptionist` -> `receptionist.html`
  - `advisor` -> `advisor.html`
  - `technician` -> `technician.html`
  - `qc` -> `qc.html`
  - `admin` -> `admin.html`

#### Vehicle Workflow Functions

- `addVehicle(plate, owner, by)` posts to `/api/vehicles`.
- `updateVehicle(id, changes, actor, note)` updates vehicles and logs history.
- `renderGuard()` collects new vehicle entries.
- `renderReceptionist()` lists vehicles and enables assignment or delivery.
- `renderAdvisor()` handles advisor actions to send vehicles to technicians or QC.
- `renderTechnician()` lets technicians mark service done.
- `renderQC()` allows quality control approval.

#### Admin Controls

- `renderAdmin()` displays users, vehicles, and admin reset button.
- `renderAdminContactMessages()` renders contact messages, including view and response actions.
- Supports admin contact updates via `/api/contacts/:id`.
- `viewContactMessage(msgId)` prompts for an admin response and updates the contact record.

#### General Helpers

- `el(selector)` and `elAll(selector)` for DOM selection.
- `requireRole(roleList)` enforces page access by current user role.
- `renderIndex()` handles landing page vehicle entry flow.
- `handlePending()` processes pending plate entries after login.

#### Startup Behavior

- Adds a DOMContentLoaded listener to call:
  - `renderAuth()`
  - `renderIndex()`
  - `handlePending()`
  - `renderGuard()`
  - `renderReceptionist()`
  - `renderAdvisor()`
  - `renderTechnician()`
  - `renderQC()`
  - `renderAdmin()`

This means `app.js` drives behavior across many static pages by checking whether the relevant DOM elements exist.

---

## Technologies Used

- Backend:
  - Node.js
  - Express
  - MongoDB
  - Mongoose
  - Multer
  - dotenv
  - cors
- Frontend:
  - HTML
  - CSS
  - JavaScript (vanilla)
  - Fetch API
  - sessionStorage
  - DOM manipulation
- General topics:
  - REST API design
  - Role-based access control
  - Authentication and session token management
  - File upload handling
  - Data modeling for users, vehicles, services, appointments, contacts, sessions
  - Vehicle service workflow and status transitions
  - Static site serving from Express

----------------------

## Functional Flow Summary

1. Public landing pages are served from `frontend/` by `backend/server.js`.
2. A default admin user is created automatically if missing.
3. Users log in through `frontend/logreg.html`.
4. Backend authenticates via `/api/login` and stores session tokens in MongoDB `Session`.
5. The frontend stores authenticated user state in `sessionStorage`.
6. Users navigate to role-specific dashboards based on their role.
7. Vehicle processing flows across several roles:
   - Guard enters vehicles.
   - Receptionist manages workflow states.
   - Advisor assigns to technician or QC.
   - Technician completes service.
   - Quality Control approves ready-for-delivery vehicles.
8. Admin can manage users, vehicles, contact messages, and reset data.
9. Contacts and appointments are stored in MongoDB and exposed through API endpoints.

---

## Notes and Observations

- `backend/README.md` contains an outdated description referring to SQLite and Sequelize; the actual code uses MongoDB.
- Public registration is disabled in `frontend/js/app.js`.
- The `server.js` backend includes both public and authenticated endpoints, plus admin-only actions.
- The frontend uses a single shared script `app.js` to handle multiple pages with feature detection.
- The project does not include a top-level `README.md` at the repository root.

---

## How to Run the Project

1. Open a terminal in `backend/`.
2. Run `npm install`.
3. Start MongoDB locally or set `MONGO_URL` in `backend/.env`.
4. Run `npm start` or `npm run dev`.
5. Open the browser at `http://localhost:3000`.

If MongoDB is not running, the backend cannot connect, and the app will fail to initialize.

---

## File-by-File Functionality Reference

- `backend/package.json`: dependency management and start scripts.
- `backend/README.md`: backend setup notes.
- `backend/server.js`: core Express server and API implementation.
- `backend/scripts/checkMongo.js`: MongoDB connectivity and collection sample data check.
- `backend/models/index.js`: database connection and model exports.
- `backend/models/user.js`: user schema and role definitions.
- `backend/models/service.js`: service catalog schema.
- `backend/models/appointment.js`: appointment booking schema.
- `backend/models/vehicle.js`: vehicle workflow schema and history.
- `backend/models/contact.js`: customer message schema.
- `backend/models/session.js`: session token storage.
- `frontend/index.html`: homepage and marketing section.
- `frontend/about.html`: about page.
- `frontend/features.html`: features description.
- `frontend/contact.html`: contact page.
- `frontend/logreg.html`: login and registration page.
- `frontend/admin.html`: admin dashboard.
- `frontend/advisor.html`: advisor dashboard.
- `frontend/receptionist.html`: receptionist dashboard.
- `frontend/technician.html`: technician dashboard.
- `frontend/qc.html`: quality control dashboard.
- `frontend/guard.html`: guard vehicle entry page.
- `frontend/css/index.css`: public page styling.
- `frontend/css/features.css`: features page styling.
- `frontend/css/contact.css`: contact page styling.
- `frontend/css/about.css`: about page styling.
- `frontend/js/app.js`: frontend application logic, auth, role-based UI, API integration.
- `frontend/uploads/avatars/`: uploaded avatar storage.

---

## Conclusion

This repository implements a full-stack car service management application with role-based workflows, secure session handling, vehicle lifecycle management, contact message handling, and an admin control panel. The backend is built with Node.js, Express, and MongoDB, while the frontend uses static HTML/CSS and a single shared JavaScript application file (`frontend/js/app.js`) to manage interactive behavior.
