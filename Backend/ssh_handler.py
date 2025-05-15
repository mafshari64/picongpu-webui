import paramiko
import os

# Supercomputer details
SSH_HOST = "hemera.example.com"
SSH_USER = "your_username"
SSH_KEY = "/path/to/your/private_key"
REMOTE_WORKDIR = "/path/on/hemera"

def ssh_connect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(SSH_HOST, username=SSH_USER, key_filename=SSH_KEY)
    return ssh

def upload_files(local_file_path):
    ssh = ssh_connect()
    sftp = ssh.open_sftp()
    remote_file_path = os.path.join(REMOTE_WORKDIR, os.path.basename(local_file_path))
    sftp.put(local_file_path, remote_file_path)
    sftp.close()
    ssh.close()

def submit_job():
    ssh = ssh_connect()
    stdin, stdout, stderr = ssh.exec_command(f"cd {REMOTE_WORKDIR} && sbatch job_script.slurm")
    job_id = stdout.read().decode().strip().split()[-1]
    ssh.close()
    return job_id

def fetch_results(job_id):
    ssh = ssh_connect()
    remote_results = os.path.join(REMOTE_WORKDIR, f"results_{job_id}.txt")
    local_results = f"data/results_{job_id}.txt"
    sftp = ssh.open_sftp()
    sftp.get(remote_results, local_results)
    sftp.close()
    ssh.close()
    with open(local_results, "r") as file:
        return file.read()
