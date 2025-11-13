from __future__ import annotations
from typing import List
from pydantic import BaseModel, Field, field_validator
import json
import os

# Base configuration class with schema export method
class BaseConfig(BaseModel):
    class Config:
        extra = "forbid"
        json_schema_extra = {"additionalProperties": False}

    @classmethod
    def export_schema(cls, path: str, draft: str = "draft-07"):
        schema = cls.model_json_schema()
        schema = _downgrade_json_schema(schema, draft)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(schema, f, indent=2)
        print(f"✅ JSON Schema ({draft}) exported to: {path}")

def _downgrade_json_schema(schema: dict, draft: str):
    if draft == "draft-07":
        schema["$schema"] = "http://json-schema.org/draft-07/schema#"
        if "$defs" in schema:
            schema["definitions"] = schema.pop("$defs")
        def replace_refs(obj):
            if isinstance(obj, dict):
                for k, v in list(obj.items()):
                    if k == "$ref" and isinstance(v, str):
                        obj[k] = v.replace("#/$defs/", "#/definitions/")
                    else:
                        replace_refs(v)
            elif isinstance(obj, list):
                for i in obj:
                    replace_refs(i)
        replace_refs(schema)
    return schema

# Species Configuration
class SpeciesConfig(BaseConfig):
    particle_type: str = Field(
        default="electron",
        title="Particle Type",
        description="Particle type (see openPMD standard)",
        json_schema_extra={"enum": ["electron", "H", "He", "Cu", "other"]}
    )
    name: str = Field(
        default="electron",
        title="Name",
        description="Species name"
    )
    charge_state: int | None = Field(
        default=None,
        title="Charge State",
        description="Charge state for ions (required if ENABLE_IONIZATION=True)",
        json_schema_extra={"visible_if": {"ENABLE_IONIZATION": True, "particle_type": {"not": "electron"}}}
    )
    picongpu_fixed_charge: bool | None = Field(
        default=None,
        title="Fix Charge for PIConGPU",
        description="Fix charge for PIConGPU (required if ENABLE_IONIZATION=False and ENABLE_IONS=True)",
        json_schema_extra={"visible_if": {"ENABLE_IONIZATION": False, "ENABLE_IONS": True, "particle_type": {"not": "electron"}}}
    )

    @field_validator("charge_state")
    @classmethod
    def validate_charge_state(cls, v, info):
        enable_ionization = info.data.get("ENABLE_IONIZATION", False)
        particle_type = info.data.get("particle_type", "electron")
        if enable_ionization and particle_type != "electron":
            if v is None:
                return 0  # Default to 0 for ions
            return v
        if v is not None and particle_type == "electron":
            raise ValueError("charge_state must be None for electron species")
        return v

    @field_validator("picongpu_fixed_charge")
    @classmethod
    def validate_fixed_charge(cls, v, info):
        enable_ionization = info.data.get("ENABLE_IONIZATION", False)
        enable_ions = info.data.get("ENABLE_IONS", False)
        particle_type = info.data.get("particle_type", "electron")
        if not enable_ionization and enable_ions and particle_type != "electron":
            if v is None:
                return True  # Default to True for ions
            return v
        if v is not None and (enable_ionization or particle_type == "electron"):
            raise ValueError("picongpu_fixed_charge must be None when ENABLE_IONIZATION=True or for electron species")
        return v

    class Config:
        json_schema_extra = {
            "required": ["particle_type", "name"]
        }

# Ionization Model Configuration
class IonizationModelConfig(BaseConfig):
    model_type: str = Field(
        default="ADK",
        title="Model Type",
        description="Ionization model type",
        json_schema_extra={"enum": ["ADK", "BSI"]}
    )
    variant: str = Field(
        default="LinearPolarization",
        title="Variant",
        description="Model variant",
        json_schema_extra={"enum": ["LinearPolarization", "CircularPolarization"]}
    )
    ion_species: str = Field(
        default="hydrogen",
        title="Ion Species",
        description="Ion species name"
    )
    bsi_extensions: List[str] = Field(
        default=["EffectiveZ"],
        title="BSI Extensions",
        description="BSI extensions (used for BSI model)",
        json_schema_extra={"enum": ["EffectiveZ"]}
    )

    class Config:
        json_schema_extra = {
            "required": ["model_type", "variant", "ion_species", "bsi_extensions"],
            "visible_if": {"ENABLE_IONIZATION": True}
        }

# Diagnostics Configuration
class DiagnosticsConfig(BaseConfig):
    type: str = Field(
        default="PhaseSpace",
        title="Diagnostic Type",
        description="Type of diagnostic",
        json_schema_extra={"enum": ["PhaseSpace", "EnergyHistogram", "MacroParticleCount", "Png", "Checkpoint", "OpenPMD"]}
    )
    species_name: str = Field(
        default="electron",
        title="Species Name",
        description="Species to diagnose"
    )
    period: str = Field(
        default="[::100, 50:72:7, 17]",
        title="Period",
        description="Time step specification, e.g., '[::100, 50:72:7, 17]' for PhaseSpace"
    )
    spatial_coordinate: str = Field(
        default="y",
        title="Spatial Coordinate",
        description="Spatial coordinate for PhaseSpace",
        json_schema_extra={"enum": ["x", "y", "z"]}
    )
    momentum_coordinate: str = Field(
        default="py",
        title="Momentum Coordinate",
        description="Momentum coordinate for PhaseSpace",
        json_schema_extra={"enum": ["px", "py", "pz"]}
    )
    min_momentum: float = Field(
        default=-1.0,
        title="Minimum Momentum",
        description="Minimum momentum for PhaseSpace"
    )
    max_momentum: float = Field(
        default=1.0,
        title="Maximum Momentum",
        description="Maximum momentum for PhaseSpace"
    )
    bin_count: int = Field(
        default=1024,
        title="Bin Count",
        description="Number of bins for EnergyHistogram",
        ge=1
    )
    min_energy: float = Field(
        default=0.0,
        title="Minimum Energy",
        description="Minimum energy for EnergyHistogram",
        ge=0
    )
    max_energy: float = Field(
        default=1000.0,
        title="Maximum Energy",
        description="Maximum energy for EnergyHistogram",
        gt=0
    )

    class Config:
        json_schema_extra = {
            "required": [
                "type",
                "species_name",
                "period",
                "spatial_coordinate",
                "momentum_coordinate",
                "min_momentum",
                "max_momentum",
                "bin_count",
                "min_energy",
                "max_energy"
            ]
        }

# Custom Input Configuration
class CustomInputConfig(BaseConfig):
    minimum_weight: float = Field(
        default=10.0,
        title="Minimum Weight",
        description="Minimum particle weight",
        ge=0
    )

    class Config:
        json_schema_extra = {
            "required": ["minimum_weight"]
        }

# Main Simulation Configuration
class SimulationConfig(BaseConfig):
    """Laser-Plasma Acceleration Metadata"""
    # General
    ENABLE_IONS: bool = Field(
        default=True,
        title="Enable Ions",
        description="Enable ion species"
    )
    ENABLE_IONIZATION: bool = Field(
        default=True,
        title="Enable Ionization",
        description="Enable ionization processes"
    )
    ADD_CUSTOM_INPUT: bool = Field(
        default=True,
        title="Add Custom Input",
        description="Add custom user input blocks"
    )
    OUTPUT_DIRECTORY_PATH: str = Field(
        default="lwfa",
        title="Output Directory Path",
        description="Output directory name"
    )
    n_macroparticles_per_cell: int = Field(
        default=2,
        title="Number of Macroparticles per Cell",
        description="Number of macroparticles per cell for PseudoRandomLayout",
        ge=1
    )
    picongpu_n_gpus: List[int] = Field(
        default_factory=lambda: [2, 4, 1],
        title="Number of GPUs per Dimension",
        description="Number of GPUs in each dimension [x, y, z]",
        json_schema_extra={"default": [2, 4, 1]}
    )
    pulse_init: float = Field(
        default=15.0,
        title="Pulse Initialization Factor",
        description="Factor for laser centroid position",
        gt=0
    )
    max_steps: int = Field(
        default=4000,
        title="Maximum Steps",
        description="Maximum simulation steps",
        ge=1
    )
    time_step_size: float = Field(
        default=1.39e-16,
        title="Time Step Size",
        description="Simulation time step size (s)",
        gt=0
    )
    moving_window_move_point: float = Field(
        default=0.9,
        title="Moving Window Move Point",
        description="Moving window trigger point",
        ge=0,
        le=1
    )
    walltime_hours: float = Field(
        default=2.0,
        title="Walltime (Hours)",
        description="Simulation walltime in hours",
        gt=0
    )

    # Grid
    number_of_cells: List[int] = Field(
        default_factory=lambda: [192, 2048, 192],
        title="Number of Cells",
        description="Number of cells in each dimension [x, y, z]",
        json_schema_extra={"default": [192, 2048, 192]}
    )
    cell_size: List[float] = Field(
        default_factory=lambda: [0.1772e-6, 0.4430e-7, 0.1772e-6],
        title="Cell Size",
        description="Cell size in each dimension [x, y, z] (m)",
        json_schema_extra={"default": [0.1772e-6, 0.4430e-7, 0.1772e-6]}
    )
    lower_bound: List[float] = Field(
        default_factory=lambda: [0.0, 0.0, 0.0],
        title="Lower Bound",
        description="Lower bound in each dimension [x, y, z] (m)",
        json_schema_extra={"default": [0.0, 0.0, 0.0]}
    )
    upper_bound: List[float] = Field(
        default_factory=lambda: [192 * 0.1772e-6, 2048 * 0.4430e-7, 192 * 0.1772e-6],
        title="Upper Bound",
        description="Upper bound in each dimension [x, y, z] (m)",
        json_schema_extra={"default": [192 * 0.1772e-6, 2048 * 0.4430e-7, 192 * 0.1772e-6]}
    )
    lower_boundary_conditions: List[str] = Field(
        default_factory=lambda: ["open"] * 3,
        title="Lower Boundary Conditions",
        description="Boundary conditions for lower bounds [x, y, z]",
        json_schema_extra={"default": ["open", "open", "open"], "enum": ["open", "periodic", "reflective"]}
    )
    upper_boundary_conditions: List[str] = Field(
        default_factory=lambda: ["open"] * 3,
        title="Upper Boundary Conditions",
        description="Boundary conditions for upper bounds [x, y, z]",
        json_schema_extra={"default": ["open", "open", "open"], "enum": ["open", "periodic", "reflective"]}
    )

    # Solver
    solver_method: str = Field(
        default="Yee",
        title="Solver Method",
        json_schema_extra={"enum": ["Yee", "Lehe"]}
    )

    # Gaussian Profile
    density: float = Field(
        default=1e25,
        title="Density",
        gt=0
    )
    center_front: float = Field(
        default=8e-5,
        title="Center Front",
        gt=0
    )
    sigma_front: float = Field(
        default=8e-5,
        title="Sigma Front",
        gt=0
    )
    center_rear: float = Field(
        default=1e-4,
        title="Center Rear",
        gt=0
    )
    sigma_rear: float = Field(
        default=8e-5,
        title="Sigma Rear",
        gt=0
    )
    factor: float = Field(
        default=-1.0,
        title="Factor"
    )
    power: float = Field(
        default=4.0,
        title="Power"
    )
    vacuum_cells_front: int = Field(
        default=50,
        title="Vacuum Cells Front",
        ge=0
    )

    # Laser
    wavelength: float = Field(
        default=0.8e-6,
        title="Wavelength",
        gt=0
    )
    waist: float = Field(
        default=5.0e-6 / 1.17741,
        title="Waist",
        gt=0
    )
    duration: float = Field(
        default=5e-15,
        title="Duration",
        gt=0
    )
    propagation_direction: List[float] = Field(
        default_factory=lambda: [0.0, 1.0, 0.0],
        title="Propagation Direction",
        description="Laser propagation direction [x, y, z]",
        json_schema_extra={"default": [0.0, 1.0, 0.0]}
    )
    polarization_direction: List[float] = Field(
        default_factory=lambda: [1.0, 0.0, 0.0],
        title="Polarization Direction",
        description="Laser polarization direction [x, y, z]",
        json_schema_extra={"default": [1.0, 0.0, 0.0]}
    )
    focal_position: List[float] = Field(
        default_factory=lambda: [192 * 0.1772e-6 / 2, 4.62e-5, 192 * 0.1772e-6 / 2],
        title="Focal Position",
        description="Laser focal position [x, y, z] (m)",
        json_schema_extra={"default": [192 * 0.1772e-6 / 2, 4.62e-5, 192 * 0.1772e-6 / 2]}
    )
    centroid_position: List[float] = Field(
        default_factory=lambda: [192 * 0.1772e-6 / 2, -0.5 * 15.0 * 5.0e-15 * 3e8, 192 * 0.1772e-6 / 2],
        title="Centroid Position",
        description="Laser centroid position [x, y, z] (m)",
        json_schema_extra={"default": [192 * 0.1772e-6 / 2, -0.5 * 15.0 * 5.0e-15 * 3e8, 192 * 0.1772e-6 / 2]}
    )
    phase: float = Field(
        default=0.0,
        title="Phase",
        ge=0
    )
    polarization_type: str = Field(
        default="LINEAR",
        title="Polarization Type",
        json_schema_extra={"enum": ["CIRCULAR", "LINEAR"]}
    )

    a0: float = Field(
        default=1.0,
        title="Normalized Vector Potential",
        description="Laser normalized vector potential",
        gt=0
    )
    
    # Species, Ionization, Diagnostics, Custom Input
    species: List[SpeciesConfig] = Field(
        default_factory=lambda: [SpeciesConfig()],
        title="Species"
    )
    ionization_models: List[IonizationModelConfig] = Field(
        default_factory=lambda: [],
        title="Ionization Models"
    )
    diagnostics: List[DiagnosticsConfig] = Field(
        default_factory=lambda: [DiagnosticsConfig()],
        title="Diagnostics"
    )
    custom_user_input: CustomInputConfig = Field(
        default_factory=CustomInputConfig,
        title="Custom User Input"
    )

    @field_validator("ionization_models")
    @classmethod
    def validate_ionization_models(cls, v, info):
        if info.data.get("ENABLE_IONIZATION", False) and not v:
            raise ValueError("Ionization models are required when ENABLE_IONIZATION=True")
        return v

    @field_validator("species")
    @classmethod
    def validate_species(cls, v, info):
        if info.data.get("ENABLE_IONIZATION", False) and not info.data.get("ENABLE_IONS", False):
            raise ValueError("Ions species required for ionization")
        electron_count = sum(1 for s in v if s.particle_type == "electron")
        if electron_count != 1:
            raise ValueError("Exactly one electron species must be defined")
        return v

    class Config:
        json_schema_extra = {
            "required": [
                "ENABLE_IONS",
                "ENABLE_IONIZATION",
                "ADD_CUSTOM_INPUT",
                "OUTPUT_DIRECTORY_PATH",
                "n_macroparticles_per_cell",
                "picongpu_n_gpus",
                "pulse_init",
                "max_steps",
                "time_step_size",
                "moving_window_move_point",
                "walltime_hours",
                "number_of_cells",
                "cell_size",
                "lower_bound",
                "upper_bound",
                "lower_boundary_conditions",
                "upper_boundary_conditions",
                "solver_method",
                "density",
                "center_front",
                "sigma_front",
                "center_rear",
                "sigma_rear",
                "factor",
                "power",
                "vacuum_cells_front",
                "wavelength",
                "waist",
                "duration",
                "propagation_direction",
                "polarization_direction",
                "focal_position",
                "centroid_position",
                "a0",
                "phase",
                "polarization_type",
                "species",
                "ionization_models",
                "diagnostics",
                "custom_user_input"
            ]
        }

# Example usage
if __name__ == "__main__":
    schema_path = r"P:\afshari\PROPSALS\HZDR_Project\react\picongpu_react\public\picmi_schema.json"
    SimulationConfig.export_schema(schema_path, draft="draft-07")