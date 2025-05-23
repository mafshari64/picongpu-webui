PIConGPU React Web Interface
This project is a web interface for configuring and submitting PIConGPU simulations. It uses a React frontend and FastAPI backend to generate simulation input files locally, with plans for supercomputer integration. Below is an overview of key files and their purpose.
Project Structure
picongpu_react/
├── Backend/
│   ├── app.py
│   ├── .env
├── src/
│   ├── components/
│   │   ├── PICMIInputForm.js
│   ├── store/
│   │   ├── index.js
│   │   ├── slices/
├── public/
│   ├── picmi_schema.json
├── package.json
├── .gitignore

Key Files and Directories

Backend/: Contains FastAPI backend files.
app.py: FastAPI server that handles form data and saves pypicongpu.json locally.
.env: Stores config variables like PROJECT_ROOT and REACT_APP_URL.


src/: Contains React frontend source code.
components/PICMIInputForm.js: Renders dynamic input form using picmi_schema.json and sends data to backend.
store/: Manages Redux state (assumed).
index.js: Configures Redux store for global state.
slices/: Defines Redux reducers and actions for form state.




public/: Contains static assets.
picmi_schema.json: JSON schema for PIConGPU inputs, drives form fields.


package.json: Lists dependencies (react, axios, redux) and scripts.
.gitignore: Excludes node_modules, .env, and build artifacts from Git.

Why We Use Key Components

Redux: Centralizes complex form state for easier management and debugging.
picmi_schema.json: Enables dynamic form fields without hardcoding, adaptable to schema changes.
PICMIInputForm.js: Provides user-friendly interface for simulation inputs and backend communication.
app.py: Saves JSON locally, ready for future supercomputer integration.
.env: Avoids hardcoding paths/URLs, improving portability.

