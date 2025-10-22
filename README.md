PIConGPU React Web Interface
This project is a web interface for configuring and submitting PIConGPU simulations. It uses a React frontend and FastAPI backend to generate simulation input files locally, with plans for supercomputer integration. Below is an overview of key files and their purpose.
Project Structure:

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

