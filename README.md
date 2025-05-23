PIConGPU React Web Interface
This project is a web interface for configuring and submitting PIConGPU simulations. It uses a React frontend and FastAPI backend to generate simulation input files locally, with plans for supercomputer integration. Below is an overview of key files and their purpose.


picongpu_react/
├── **Backend/**
│   ├── **app.py** - FastAPI backend handling API requests. Receives form data from the frontend, saves it as `.json` in a specified directory, using `PROJECT_ROOT` from `.env` for flexibility.
│   ├── **.env** - Stores configuration variables like `PROJECT_ROOT` and `REACT_APP_URL` to avoid hardcoding paths and URLs.
├── **src/**
│   ├── **components/**
│   │   ├── **PICMIInputForm.js** - Core React component for the simulation input form. Uses `picmi_schema.json` to dynamically generate fields, validates inputs, and sends data (`formData`, `baseDirectory`, `simulationName`) to `/submit-job` via **axios**.
│   ├── **store/** (assumed)
│   │   ├── **index.js** - Configures the **Redux** store to manage global state (e.g., form data, submission status) across components, ensuring predictable state updates.
│   │   ├── **slices/** - Contains **Redux** slices (e.g., `formSlice.js`) defining reducers and actions for form state management.
├── **public/**
│   ├── **picmi_schema.json** - JSON schema defining the structure of PIConGPU simulation inputs. Drives dynamic form rendering in **PICMIInputForm.js**, ensuring fields match PIConGPU requirements.
├── **package.json** - Lists project dependencies (`react`, `axios`, `redux`, etc.) and scripts (`start`, `build`).
├── **.gitignore** - Excludes `node_modules`, `.env`, and build artifacts from Git.

## Why We Use Key Components
- **Redux**: Manages complex form state (e.g., nested simulation parameters) centrally, making it easier to share data between components and debug state changes.
- **picmi_schema.json**: Defines the PIConGPU input structure, enabling dynamic form generation without hardcoding fields, ensuring flexibility for schema updates.
- **PICMIInputForm.js**: Provides a user-friendly interface for inputting simulation parameters, validates data against the schema, and communicates with the backend to save JSON files.
- **app.py**: Handles backend logic, saving `.json` locally for testing, with a structure ready for future supercomputer job submission.
- **.env**: Centralizes configuration (e.g., project paths) to avoid hardcoding, improving portability across systems.
