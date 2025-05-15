from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from ssh_handler import upload_files, submit_job, fetch_results

app = FastAPI()

# Define the data structure for the input form
class SimulationInput(BaseModel):
    parameter_1: str
    parameter_2: int
    parameter_3: float  # Add fields matching your React form

@app.post("/submit-job")
async def submit_job_endpoint(input_data: SimulationInput):
    try:
        # Generate input files
        input_file_path = f"data/input_{input_data.parameter_1}.json"
        with open(input_file_path, "w") as file:
            file.write(input_data.json())

        # Transfer files and submit the job
        upload_files(input_file_path)
        job_id = submit_job()

        return {"status": "Job submitted", "job_id": job_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/fetch-results/{job_id}")
async def fetch_results_endpoint(job_id: str):
    try:
        results = fetch_results(job_id)
        return {"status": "Success", "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
