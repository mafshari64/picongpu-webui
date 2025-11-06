#   python picmi_generator.py

from workflow import generate_picmi_script_from_json
from pathlib import Path

json_file = Path(r"P:\afshari\PROPSALS\HZDR_Project\react\picongpu_react\simulations\lwfa_20251030_152140\picmi.json")
output_dir = Path(r"P:\afshari\PROPSALS\HZDR_Project\react\picongpu_react\simulations")

picmi_script_path = generate_picmi_script_from_json(str(json_file), str(output_dir))
print("Generated PICMI script at:", picmi_script_path)
