"""Generate the code reference pages."""
import json
import subprocess

import mkdocs_gen_files
from pathlib import Path


# Configuration
SCRIPT_DIR = Path(__file__).parent

    
def list_to_dict(items):
    """Convert recursive list of objects/strings to pure dict."""
    result_dict = {}
    for item in items:
        if isinstance(item, str):
            result_dict[""] = item
        elif isinstance(item, dict):
            for key, value in item.items():
                if isinstance(value, list):
                    result_dict[key] = list_to_dict(value)
                else:
                    result_dict[key] = value
    return result_dict

def dict_to_list(data):
    """Convert pure dict back to recursive list of objects/strings."""
    result_list = []
    for key, value in data.items():
        if key == "":
            result_list.append(value)
        elif isinstance(value, dict):
            result_list.append({key: dict_to_list(value)})
        else:
            result_list.append({key: value})
    return result_list

def main():
    """Main entry point for parallel document generation."""
    data = subprocess.run(
        "bun run src/mcp.ts list-remote-mcps --json",
        capture_output=True,
        text=True,
        shell=True,
        cwd=SCRIPT_DIR.parent.parent,
    )
    try:
        remotes = json.loads(data.stdout)
    except Exception as e:
        print(f"Failed to parse remote MCP list JSON: {e}")
        print(f"STDOUT: {data.stderr}")
        return
    
    
    result = json.loads(subprocess.run(
        "bun run run_handlebars.ts ../templates/remote.md.hbs".split(),
        input=json.dumps(remotes),
        capture_output=True,
        text=True,
        cwd=SCRIPT_DIR,
        timeout=30
    ).stdout)
    nav = mkdocs_gen_files.config.nav
    nav_map = list_to_dict(nav)
    for remote in result:
        category = remote.get('category', 'uncategorized')
        name = remote['id']
        doc_path = Path("reference") / Path("remotes") / category / f"{name}.md"
        with mkdocs_gen_files.open(doc_path, mode='w') as fd:
            fd.write(remote['docContent'])
        print(f"Generated {doc_path}")
        mkdocs_gen_files.set_edit_path(doc_path, Path("src") / doc_path)
        # Update nav
        cat_str = category.as_posix() if isinstance(category, Path) else str(category)
        nav_current = nav_map["Reference"]["Remote MCPs"]
        for part in cat_str.split('/'):
            nav_current = nav_current.setdefault(part, {})
        nav_current[f"{name}"] = f"{doc_path.as_posix()}"
        
    mkdocs_gen_files.config.nav = dict_to_list(nav_map)


main()

