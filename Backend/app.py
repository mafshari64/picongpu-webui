# Backend/app.py - CLEAN VERSION (replace your entire app.py)
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ValidationError
from jinja2 import Template
from frontend_schema_gen import SimulationConfig  # FIXED: was 'models'
import os
import json
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI()

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("REACT_APP_URL", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define the data structure for the existing /submit-job endpoint
class SimulationInput(BaseModel):
    formData: dict
    baseDirectory: str
    simulationName: str

# Function to generate PICMI script using Jinja2
def generate_picmi_script(config: SimulationConfig) -> str:
    template_path = os.path.join(os.path.dirname(__file__), "templates/picmi_template.py.j2")
    if not os.path.exists(template_path):
        raise FileNotFoundError(f"Template not found: {template_path}")
    with open(template_path, "r") as f:
        template = Template(f.read())
    return template.render(cfg=config)

# Existing /submit-job endpoint (KEEP AS IS)
@app.post("/submit-job")
async def submit_job_endpoint(input_data: SimulationInput):
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
        input_file_name = os.path.join(data_dir, "picmi.json")
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

# SINGLE /generate-picmi endpoint (REMOVED DUPLICATE)
@app.post("/generate-picmi")
async def generate_picmi(config: SimulationConfig):
    try:
        print(f"✅ Generating PICMI script for: {config.OUTPUT_DIRECTORY_PATH}")  # Debug log
        script_content = generate_picmi_script(config)
        output_path = f"{config.OUTPUT_DIRECTORY_PATH}/picmi_script.py"
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(script_content)
        print(f"✅ PICMI script saved to: {output_path}")  # Success log
        return {"status": "Success", "file_path": output_path}
    except ValidationError as e:
        print(f"❌ Validation error: {e}")
        raise HTTPException(status_code=422, detail=e.errors())
    except FileNotFoundError as e:
        print(f"❌ Template error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        print(f"❌ Error generating script: {e}")
        raise HTTPException(status_code=500, detail=str(e))