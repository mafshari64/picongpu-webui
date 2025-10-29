from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import json
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# --- Updated CORS middleware ---
allowed_origins = os.getenv("REACT_APP_URL", "http://localhost:3000")
allow_list = [o.strip() for o in allowed_origins.split(",")] if "," in allowed_origins else [allowed_origins]

# For initial testing, allow all origins (safe: limit in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_list if allow_list and allow_list != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define the data structure for PICMI input form
class SimulationInput(BaseModel):
    formData: dict
    baseDirectory: str
    simulationName: str

@app.post("/submit-job")
async def submit_job_endpoint(input_data: SimulationInput, request: Request):
    # --- Log incoming request (helpful for debugging) ---
    print(f"submit-job called from {request.client.host}; simulationName: {input_data.simulationName}, baseDirectory: {input_data.baseDirectory}")
    
    try:
        # Validate formData
        if not isinstance(input_data.formData, dict):
            raise ValueError("formData must be a dictionary")

        # Sanitize baseDirectory and simulationName
        base_dir = input_data.baseDirectory.strip().replace('..', '').lstrip('/').lstrip('\\')
        simulation_name = input_data.simulationName.strip().replace(' ', '_').replace('..', '')
        if not simulation_name:
            raise ValueError("Simulation name cannot be empty")

        # Read PROJECT_ROOT from .env
        project_root = os.getenv("PROJECT_ROOT")
        if not project_root:
            raise ValueError("PROJECT_ROOT not defined in .env")
        project_root = os.path.abspath(project_root)
        if not os.path.exists(project_root):
            raise Exception(f"Project root not found at {project_root}")

        # Create unique directory with timestamp
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        data_dir = os.path.join(project_root, base_dir, f"{simulation_name}_{timestamp}")
        os.makedirs(data_dir, exist_ok=True)
        
        # Generate and save JSON file
        input_file_name = os.path.join(data_dir, "pypicongpu.json")
        try:
            with open(input_file_name, "w", encoding='utf-8') as file:
                json.dump(input_data.formData, file, indent=2)
        except Exception as e:
            raise Exception(f"Failed to create JSON file: {str(e)}")

        # Verify file was created
        if not os.path.exists(input_file_name):
            raise Exception(f"JSON file {input_file_name} was not created")

        # Log file creation
        print(f"Created JSON file: {input_file_name}")

        return {
            "status": "JSON file saved",
            "file_path": input_file_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save JSON file: {str(e)}")
