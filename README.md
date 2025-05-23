PIConGPU React Web Interface
This project is a web interface for configuring and submitting PIConGPU simulations. It uses a React frontend and FastAPI backend to generate simulation input files locally, with plans for supercomputer integration. Below is an overview of key files and their purpose.
Project Structure
picongpu_react/
├── **Backend/**
│   ├── **app.py** - FastAPI backend handling API requests. Receives form data from the frontend, saves it as `pypicongpu.json` in a specified directory (e.g., `src/components/outputs/`), using `PROJECT_ROOT` from `.env` for flexibility.
│   ├── **.env** - Stores configuration variables like `PROJECT_ROOT` (e.g., `P:/afshari/PROPSALS/HZDR_Project/react/picongpu_react`) and `REACT_APP_URL` to avoid hardcoding paths and URLs.
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
- **app.py**: Handles backend logic, saving `pypicongpu.json` locally for testing, with a structure ready for future supercomputer job submission.
- **.env**: Centralizes configuration (e.g., project paths) to avoid hardcoding, improving portability across systems.

## Running the Application Locally
To view the input form (`PICMIInputForm.js`) locally:
1. Clone the repository: `git clone <your-repo-url>`
2. Install dependencies:
   ```bash
   cd picongpu_react
   npm install
   cd Backend
   pip install fastapi uvicorn pydantic python-dotenv


Start the backend:cd Backend
uvicorn app:app --host 0.0.0.0 --port 8000


Start the frontend:cd ..
npm start


Open http://localhost:3000 in your browser to access the input form.

The form saves pypicongpu.json to <PROJECT_ROOT>/<baseDirectory>/<simulationName>_<timestamp>/ (e.g., src/components/outputs/lwfa-rdf_20250523_1450/).
Hosting the Application (Optional)
To share the input form online:

Deploy the frontend to a platform like Vercel, Netlify, or an HZDR server. Update REACT_APP_URL in .env and the API endpoint in PICMIInputForm.js (e.g., axios.post('https://your-backend.com/submit-job')).
Host the backend on a server with a public URL (e.g., AWS, Heroku, or HZDR infrastructure).
Update this README with the public URL (e.g., https://picongpu-web.hzdr.de) once deployed.

Contact the project maintainer for access to a hosted version (if available).
Notes

Supercomputer integration (e.g., SLURM submission) is planned but currently deferred.
Share generated JSON in #PICReactSims for feedback.
Check the Git repository for the latest updates: <your-repo-url>.

