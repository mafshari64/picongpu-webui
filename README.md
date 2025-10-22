# PIConGPU WebUI

**Interactive Web Interface for PIConGPU Simulation Setup and Configuration**

PIConGPU React Web Interface
This project is a web interface for configuring and submitting [PIConGPU](https://github.com/ComputationalRadiationPhysics/picongpu) simulations.  
PIConGPU WebUI provides an easy-to-use, browser-based interface to define, validate, and generate simulation inputs for PIConGPU.  
It allows users to dynamically configure simulation parameters (laser, plasma, and diagnostic) using an interactive React frontend and a FastAPI backend.

---

### 🚀 Key Features

- **Dynamic Input Forms** – Automatically generated UI fields based on PICMI schema  
- **Schema Validation** – Ensures all parameters are physically and syntactically correct  
- **FastAPI Backend** – Converts user input into valid PICMI python file.  
- **JSON Export** – Generates input files ready for PIConGPU runs  
- **Modular Design** – Easily extendable for new physics modules and diagnostics  

---

### 🧩 Architecture Overview

| Component | Description |
|------------|--------------|
| **React Frontend** | User interface for parameter input and validation |
| **FastAPI Backend** | Receives input data, processes with PyPIConGPU, and generates config files |
| **Nginx** | Serves static React files and proxies API requests to FastAPI |
| **VM / HPC Backend** | Executes PIConGPU simulations or prepares input JSON files |

---
 Below is an overview of Project Structure:

```
picongpu_react/

├── FastAPI Backend/
│   ├── app.py
│   ├── .env
│   ├── ssh_handler.py
├── src/
│   ├── components/
│   │   ├── PICMIInputForm.js
│   ├── redux/
│   │   ├── schemaSlice.js
│   │   ├── store.js
│   ├── index.js
│   ├── index.css
│   ├── App.js
├── public/
│   ├── picmi_schema.json
├── package.json
├── .gitignore
```

Key Files and Directories

FastAPI Backend/: 
app.py: FastAPI server that handles form data and saves metadata(pypicongpu.json) locally.
.env: Stores config variables and sensitive info (SUPERCOMPUTER_HOST, USER, KEY_PATH).
ssh_handler.py handles:
    -SSH connection to a supercomputer via Paramiko.
    -Uploading files (upload_files).
    -Reading SLURM config (slurm_config.txt) to dynamically generate job scripts.
    -Submitting jobs (submit_job) and fetching results (fetch_results).

FastAPI backend is ready to:
    -Accept POST requests from React.
    -Save JSON input files to PROJECT_ROOT.
    -Validate directories and file creation.
    -Includes CORS middleware, reading .env variables, and logging.


src/: Contains React frontend source code.
PICMIInputForm.js: Renders dynamic input form using picmi_schema.json and sends data to backend.
schemaSlice.js: manages the schema data (picmi_schema.json).
store.js: configures Redux with the slice.
index.js: Wraps <App /> in Redux <Provider> so the store is accessible globally.
index.css: handles general styles; .error class for error messages.
App.js:
    -Fetches the JSON schema (/picmi_schema.json) from public/ on mount.
    -Stores schema in local state (useState) for now.
    -Passes schema as a prop to PICMIInputForm.



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

