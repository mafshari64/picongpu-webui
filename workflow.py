
import json
from pathlib import Path
import numpy as np
import datetime

def generate_picmi_script_from_json(json_file: str, output_dir: str):
    """
    Convert pypicongpu.json into a full PICMI input script.

    :param json_file: Path to pypicongpu.json
    :param output_dir: Where to write the PICMI script
    :return: Path to generated PICMI Python script
    """
    json_path = Path(json_file)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    picmi_script_path = output_dir / "input_picmi.py"

    with open(json_path, "r") as f:
        data = json.load(f)

    # Extract JSON parameters
    ENABLE_IONS = data.get("ENABLE_IONS", True)
    ENABLE_IONIZATION = data.get("ENABLE_IONIZATION", True)
    ADD_CUSTOM_INPUT = data.get("ADD_CUSTOM_INPUT", True)
    OUTPUT_DIRECTORY_PATH = data.get("OUTPUT_DIRECTORY_PATH", "sim_output")

    numberCells = np.array(data.get("numberCells"))
    cellSize = np.array(data.get("cellSize", [0.1772e-6, 0.4430e-7, 0.1772e-6]))

    grid_data = data["grid"]
    picongpu_n_gpus = eval(grid_data.get("picongpu_n_gpus"))
    lower_bound = eval(grid_data.get("lower_bound", "[0,0,0]"))
    upper_bound = eval(grid_data.get("upper_bound", str((numberCells * cellSize).tolist())))

    # Begin writing PICMI Python file
    with open(picmi_script_path, "w") as f:
        f.write('from picongpu import picmi, pypicongpu\n')
        f.write('import numpy as np\n')
        f.write('import datetime\n\n')

        f.write(f"ENABLE_IONS = {ENABLE_IONS}\n")
        f.write(f"ENABLE_IONIZATION = {ENABLE_IONIZATION}\n")
        f.write(f"ADD_CUSTOM_INPUT = {ADD_CUSTOM_INPUT}\n")
        f.write(f'OUTPUT_DIRECTORY_PATH = "{OUTPUT_DIRECTORY_PATH}"\n\n')

        f.write(f"numberCells = np.array({numberCells.tolist()})\n")
        f.write(f"cellSize = np.array({cellSize.tolist()})\n\n")

        f.write("grid = picmi.Cartesian3DGrid(\n")
        f.write(f"    picongpu_n_gpus={picongpu_n_gpus},\n")
        f.write(f"    number_of_cells=numberCells.tolist(),\n")
        f.write(f"    lower_bound={lower_bound},\n")
        f.write(f"    upper_bound={upper_bound},\n")
        f.write('    lower_boundary_conditions=["open","open","open"],\n')
        f.write('    upper_boundary_conditions=["open","open","open"],\n')
        f.write(")\n\n")

        # Gaussian profile example
        gaussian = data.get("gaussianProfile", {})
        f.write(f"gaussianProfile = picmi.distribution.GaussianDistribution(\n")
        f.write(f"    density={gaussian.get('density',1e25)},\n")
        f.write(f"    center_front={gaussian.get('center_front',8e-5)},\n")
        f.write(f"    sigma_front={gaussian.get('sigma_front',8e-5)},\n")
        f.write(f"    center_rear={gaussian.get('center_rear',1e-4)},\n")
        f.write(f"    sigma_rear={gaussian.get('sigma_rear',8e-5)},\n")
        f.write(f"    factor={gaussian.get('factor',-1)},\n")
        f.write(f"    power={gaussian.get('power',4)},\n")
        f.write(f"    vacuum_front={gaussian.get('vacuum_cells_front',50)}*cellSize[1],\n")
        f.write(")\n\n")

        # Solver
        f.write('solver = picmi.ElectromagneticSolver(grid=grid, method="Yee")\n\n')

        # Laser
        laser = data.get("laser", {})
        f.write('laser = picmi.GaussianLaser(\n')
        f.write(f"    wavelength={laser.get('wavelength',0.8e-6)},\n")
        f.write(f"    waist={laser.get('waist',4.25e-6)},\n")
        f.write(f"    duration={laser.get('duration',5e-15)},\n")
        f.write(f"    propagation_direction={eval(laser.get('propagation_direction','[0,1,0]'))},\n")
        f.write(f"    polarization_direction={eval(laser.get('polarization_direction','[1,0,0]'))},\n")
        f.write(f"    a0={laser.get('a0',8.0)},\n")
        f.write(')\n\n')

        # Species
        f.write("random_layout = picmi.PseudoRandomLayout(n_macroparticles_per_cell=2)\n")
        f.write("species_list = []\n")
        if ENABLE_IONIZATION:
            f.write("# Ionization species initialization\n")
        else:
            f.write("electrons = picmi.Species(particle_type='electron', name='electron', initial_distribution=gaussianProfile)\n")
            f.write("species_list.append((electrons, random_layout))\n")
            if ENABLE_IONS:
                f.write("hydrogen = picmi.Species(particle_type='H', name='hydrogen', picongpu_fixed_charge=True, initial_distribution=gaussianProfile)\n")
                f.write("species_list.append((hydrogen, random_layout))\n")

        # Simulation object
        f.write("\nsim = picmi.Simulation(solver=solver, max_steps=4000, time_step_size=1.39e-16)\n")
        f.write("for species, layout in species_list:\n")
        f.write("    sim.add_species(species, layout=layout)\n\n")
        f.write("sim.add_laser(laser, None)\n\n")

        f.write("if __name__ == '__main__':\n")
        f.write("    sim.write_input_file(OUTPUT_DIRECTORY_PATH)\n")

    return picmi_script_path
