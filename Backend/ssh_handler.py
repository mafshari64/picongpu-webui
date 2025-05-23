import paramiko
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()
SUPERCOMPUTER_HOST = os.getenv("SUPERCOMPUTER_HOST")
SUPERCOMPUTER_USER = os.getenv("SUPERCOMPUTER_USER")
SUPERCOMPUTER_KEY_PATH = os.getenv("SUPERCOMPUTER_KEY_PATH")
SUPERCOMPUTER_WORKDIR = f"/scratch/{SUPERCOMPUTER_USER}/picongpu" if SUPERCOMPUTER_USER else None

def read_slurm_config():
    """Read SLURM configuration from slurm_config.txt."""
    config = {}
    try:
        with open("slurm_config.txt", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    key, value = line.split("=", 1)
                    config[key.strip()] = value.strip()
        return config
    except FileNotFoundError:
        raise Exception("slurm_config.txt not found in Backend directory.")
    except Exception as e:
        raise Exception(f"Failed to read slurm_config.txt: {str(e)}")

def ssh_connect():
    """Connect to the supercomputer via SSH."""
    if not all([SUPERCOMPUTER_HOST, SUPERCOMPUTER_USER, SUPERCOMPUTER_KEY_PATH]):
        raise ValueError("Missing supercomputer configuration (HOST, USER, or KEY_PATH).")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(SUPERCOMPUTER_HOST, username=SUPERCOMPUTER_USER, key_filename=SUPERCOMPUTER_KEY_PATH)
        return ssh
    except Exception as e:
        raise Exception(f"SSH connection failed: {str(e)}")

def upload_files(local_file_path):
    """Upload input file to the supercomputer."""
    if not os.path.exists(local_file_path):
        raise FileNotFoundError(f"Local file {local_file_path} not found.")
    ssh = ssh_connect()
    try:
        sftp = ssh.open_sftp()
        remote_file_path = os.path.join(SUPERCOMPUTER_WORKDIR, os.path.basename(local_file_path))
        sftp.put(local_file_path, remote_file_path)
        sftp.close()
        return remote_file_path
    except Exception as e:
        raise Exception(f"File upload failed: {str(e)}")
    finally:
        ssh.close()

def submit_job(remote_file_path, simulation_name):
    """Submit a SLURM job on the supercomputer."""
    ssh = ssh_connect()
    try:
        # Read SLURM configuration
        config = read_slurm_config()
        
        # Create simulation folder in SCRATCH
        scratch = config.get('SCRATCH', '/tmp')
        simulation_folder = config.get('SIMULATION_FOLDER', simulation_name).replace('%SIMULATION_NAME%', simulation_name)
        remote_sim_path = os.path.join(scratch, simulation_folder)
        ssh.exec_command(f"mkdir -p {remote_sim_path}")
        
        # Copy input file to simulation folder
        remote_input_path = os.path.join(remote_sim_path, os.path.basename(remote_file_path))
        ssh.exec_command(f"cp {remote_file_path} {remote_input_path}")

        # Generate SLURM script
        slurm_script = "#!/bin/bash\n"
        slurm_script += f"#SBATCH --job-name={config.get('JOB_NAME', 'picongpu_simulation')}\n"
        if config.get('NODES'):
            slurm_script += f"#SBATCH --nodes={config['NODES']}\n"
        if config.get('NTASKS_PER_NODE'):
            slurm_script += f"#SBATCH --ntasks-per-node={config['NTASKS_PER_NODE']}\n"
        if config.get('CPUS_PER_TASK'):
            slurm_script += f"#SBATCH --cpus-per-task={config['CPUS_PER_TASK']}\n"
        if config.get('GRES'):
            slurm_script += f"#SBATCH --gres={config['GRES']}\n"
        if config.get('TIME'):
            slurm_script += f"#SBATCH --time={config['TIME']}\n"
        if config.get('PARTITION'):
            slurm_script += f"#SBATCH --partition={config['PARTITION']}\n"
        if config.get('MEM'):
            slurm_script += f"#SBATCH --mem={config['MEM']}\n"
        slurm_script += f"#SBATCH --output={config.get('OUTPUT_FILE', '%WORKDIR%/output_%JOBID%.out').replace('%WORKDIR%', SUPERCOMPUTER_WORKDIR).replace('%JOBID%', '%j')}\n"
        slurm_script += f"#SBATCH --error={config.get('ERROR_FILE', '%WORKDIR%/error_%JOBID%.err').replace('%WORKDIR%', SUPERCOMPUTER_WORKDIR).replace('%JOBID%', '%j')}\n"
        slurm_script += "\n"

        # User settings
        slurm_script += f"export MY_MAILNOTIFY={config.get('MY_MAILNOTIFY', 'ALL')}\n"
        slurm_script += f"export MY_MAIL={config.get('MY_MAIL', 'user@example.com')}\n"
        slurm_script += f"export MY_NAME=\"{SUPERCOMPUTER_USER} <$MY_MAIL>\"\n"
        slurm_script += f"export EDITOR={config.get('EDITOR', 'nano')}\n"
        slurm_script += f"export PICSRC={config.get('PICSRC', '/home/%USER%/picongpu').replace('%USER%', SUPERCOMPUTER_USER)}\n"
        slurm_script += f"export SCRATCH={config.get('SCRATCH', '/tmp')}\n"
        slurm_script += "\n"

        # Module purge and load
        slurm_script += "module purge\n"
        if config.get('MODULES'):
            for module in config['MODULES'].split():
                slurm_script += f"module load {module}\n"
        slurm_script += "\n"

        # Environment setup
        slurm_script += f"export PIC_BACKEND={config.get('PIC_BACKEND', 'cuda:70')}\n"
        slurm_script += f"export PIC_SYSTEM_TEMPLATE_PATH={config.get('PIC_SYSTEM_TEMPLATE_PATH', 'etc/picongpu')}\n"
        slurm_script += f"export PATH={config.get('PATH_EXTRAS', '%PICSRC%/bin:%PICSRC%/src/tools/bin').replace('%PICSRC%', config.get('PICSRC', '/home/%USER%/picongpu').replace('%USER%', SUPERCOMPUTER_USER))}:$PATH\n"
        slurm_script += f"export PYTHONPATH={config.get('PYTHONPATH_EXTRAS', '%PICSRC%/lib/python').replace('%PICSRC%', config.get('PICSRC', '/home/%USER%/picongpu').replace('%USER%', SUPERCOMPUTER_USER))}:$PYTHONPATH\n"
        slurm_script += "\n"

        # Execution command
        slurm_script += config.get('EXEC_COMMAND', 'tbg -f -s -t -c etc/picongpu/N.cfg %SCRATCH%/%SIMULATION_FOLDER%').replace(
            '%SCRATCH%', config.get('SCRATCH', '/tmp')
        ).replace(
            '%SIMULATION_FOLDER%', simulation_folder
        ).replace(
            '%PICSRC%', config.get('PICSRC', '/home/%USER%/picongpu').replace('%USER%', SUPERCOMPUTER_USER)
        ) + "\n"

        # Upload SLURM script
        slurm_file = os.path.join(SUPERCOMPUTER_WORKDIR, "job_script.slurm")
        sftp = ssh.open_sftp()
        with sftp.file(slurm_file, "w") as f:
            f.write(slurm_script)
        sftp.close()

        # Submit the job
        submit_cmd = config.get('SUBMIT', 'sbatch')
        stdin, stdout, stderr = ssh.exec_command(f"cd {SUPERCOMPUTER_WORKDIR} && {submit_cmd} job_script.slurm")
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()
        if error:
            raise Exception(f"Job submission failed: {error}")
        job_id = output.split()[-1]  # Extract job ID from "Submitted batch job <ID>"
        return job_id
    except Exception as e:
        raise Exception(f"Job submission failed: {str(e)}")
    finally:
        ssh.close()

def fetch_results(job_id):
    """Fetch simulation results from the supercomputer."""
    ssh = ssh_connect()
    try:
        sftp = ssh.open_sftp()
        remote_results_dir = os.path.join(SUPERCOMPUTER_WORKDIR, f"results_{job_id}")
        local_results_dir = f"data/results_{job_id}"
        os.makedirs(local_results_dir, exist_ok=True)

        # Fetch all files in results directory
        files = sftp.listdir(remote_results_dir)
        results = {}
        for file in files:
            remote_file = os.path.join(remote_results_dir, file)
            local_file = os.path.join(local_results_dir, file)
            sftp.get(remote_file, local_file)
            try:
                with open(local_file, "r") as f:
                    results[file] = f.read()
            except:
                results[file] = "Binary file (e.g., HDF5)"
        sftp.close()
        return results
    except Exception as e:
        raise Exception(f"Failed to fetch results: {str(e)}")
    finally:
        ssh.close()