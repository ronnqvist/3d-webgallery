# Agent Workflow: Adding 3D Models via Blender-MCP

This document outlines the workflow for using an AI agent (like Cline, Roo Code, Cursor, etc.) equipped with the `blender-mcp` tool to generate new 3D models from text prompts and add them almost instantly to the 3D Web Gallery project (`3d-webgallery`). This enables a rapid, iterative cycle where users can prompt for objects and see them appear in their VR headset moments later after a simple browser refresh.

## Goal

This workflow enables an AI agent to seamlessly integrate AI-generated 3D models into the live WebXR gallery:
1.  Generate a `.glb` 3D model based on a user's prompt using `blender-mcp`.
2.  Automatically save the generated model into the project's `public/3d-models/` directory.
3.  Restart the project's development server (`npm run dev`) to include the new model in the gallery list.
4.  Allow a user viewing the gallery in a WebXR device (connected to the dev server) to **see the newly prompted model appear** simply by refreshing their browser, ready for interaction.

## Prerequisites

*   **Software:**
    *   **[Blender](https://www.blender.org/):** The 3D modeling software must be installed.
    *   **[Node.js & npm](https://nodejs.org/):** Required for running the project and installing dependencies.
    *   **(Optional) AI Agent Environment:**
        *   **[VS Code](https://code.visualstudio.com/):** Recommended editor.
        *   **[Roo Code (Cline fork)](https://github.com/RooVetGit/Roo-Code):** The VS Code extension used in examples (or a similar AI agent).
*   **MCP Server Setup:**
    1.  **Install [`blender-mcp`](https://github.com/ahujasid/blender-mcp):** Follow the installation instructions in its repository (likely involves installing the Blender addon and the server CLI, e.g., via `pipx` or `uvx`).
    2.  **Configure Blender Addon:**
        *   Open Blender.
        *   Ensure the "Blender MCP" addon is enabled (Edit > Preferences > Add-ons).
        *   Open the Blender MCP panel (typically in the 3D Viewport sidebar, press 'N', find the "BlenderMCP" tab).
        *   Check "Use assets from Poly Haven".
        *   Check "Use Hyper3D Rodin 3D model generation".
        *   Select `hyper3d.ai` from the "Rodin Model" dropdown.
        *   Click "Set Free Trial API Key" (or enter your own API key if you have one).
    3.  **Start External Server:** *After* configuring the addon in Blender, open a separate terminal and run the command to start the server (e.g., `uvx blender-mcp`). Leave this terminal running.
    4.  **Agent Usage:** Ensure the AI agent uses the correct server name `github.com/ahujasid/blender-mcp` when calling tools.
*   **Project Setup:**
    *   The `3d-webgallery` project code must be available in the agent's working directory.
    *   Project dependencies must be installed (`npm install`). Running `npm install` again is recommended after switching OS environments or if encountering issues.

## Workflow Steps for the Agent

1.  **Check Hyper3D Status (Optional but Recommended):**
    *   Use `blender-mcp` -> `get_hyper3d_status` to confirm the mode (e.g., `MAIN_SITE` or `FAL_AI`) as it affects subsequent polling and import steps.
2.  **Stop Existing Server (If Necessary):**
    *   Check if the `npm run dev` process for this project is already running in a terminal.
    *   If it is, it **must be stopped** before proceeding. The agent should attempt to stop it or request the user to stop it manually (e.g., using Ctrl+C in the relevant terminal). *Note: Reliably stopping specific background processes via `execute_command` can be complex.*
3.  **Generate 3D Model:**
    *   Use the appropriate `blender-mcp` tool (e.g., `generate_hyper3d_model_via_text` or `generate_hyper3d_model_via_images`).
    *   **Store the `task_uuid` and `subscription_key` (for MAIN_SITE mode) or `request_id` (for FAL_AI mode) returned by the tool.**
    *   *Example (Text Prompt, MAIN_SITE mode):*
        ```xml
        <use_mcp_tool>
          <server_name>github.com/ahujasid/blender-mcp</server_name>
          <tool_name>generate_hyper3d_model_via_text</tool_name>
          <arguments>
          {
            "text_prompt": "a vintage wooden radio"
          }
          </arguments>
        </use_mcp_tool>
        ```
4.  **Poll for Completion:**
    *   Repeatedly call `blender-mcp` -> `poll_rodin_job_status` using the stored `subscription_key` or `request_id`.
    *   Wait until the status indicates completion (e.g., all statuses are "Done" for MAIN_SITE, or status is "COMPLETED" for FAL_AI). Add a short delay (e.g., 5-10 seconds) between polls.
    *   *Example (MAIN_SITE mode):*
        ```xml
        <use_mcp_tool>
          <server_name>github.com/ahujasid/blender-mcp</server_name>
          <tool_name>poll_rodin_job_status</tool_name>
          <arguments>
          {
            "subscription_key": "YOUR_STORED_SUBSCRIPTION_KEY"
          }
          </arguments>
        </use_mcp_tool>
        ```
5.  **Import Model (into Blender):**
    *   Use `blender-mcp` -> `import_generated_asset`. Provide a unique `name` for the object in Blender (e.g., "vintage_radio") and the `task_uuid` (for MAIN_SITE) or `request_id` (for FAL_AI).
    *   **Note:** This step might occasionally fail on the first try (as seen in testing). If it fails with an error like `'NoneType' object has no attribute 'name'`, retry the import once.
    *   *Example (MAIN_SITE mode):*
        ```xml
        <use_mcp_tool>
          <server_name>github.com/ahujasid/blender-mcp</server_name>
          <tool_name>import_generated_asset</tool_name>
          <arguments>
          {
            "name": "vintage_radio",
            "task_uuid": "YOUR_STORED_TASK_UUID"
          }
          </arguments>
        </use_mcp_tool>
        ```
6.  **Export Model (from Blender to Project Directory):**
    *   This is a **critical step** to get the model file into the web application's directory.
    *   Use `blender-mcp` -> `execute_blender_code` with a Python script.
    *   The script must:
        *   Select the object imported in the previous step (using the `name` provided, e.g., "vintage_radio").
        *   Call Blender's GLTF exporter (`bpy.ops.export_scene.gltf`).
        *   Specify the **absolute `filepath`** pointing to the `public/3d-models/` directory within the project, using the desired filename (e.g., `c:/Users/simon/projects/webxr/3d-webgallery/public/3d-models/vintage_radio.glb`). **Crucially, testing shows Blender requires an absolute path here to avoid permission errors.**
        *   Set `export_format='GLB'` and `use_selection=True`.
    *   *Example Python Script (pass as string in `code` argument - Ensure `export_dir` is an absolute path):*
        ```python
        import bpy
        import os

        # --- Parameters (Agent must ensure export_dir is an absolute path) ---
        object_name = "vintage_radio" # The name given during import_generated_asset
        export_dir = "c:/Users/simon/projects/webxr/3d-webgallery/public/3d-models/" # MUST be an absolute path to the target directory
        export_filename = object_name + ".glb"
        # --- End Parameters ---

        # Use forward slashes for path consistency in Blender Python
        export_path = os.path.join(export_dir, export_filename).replace("\\\\", "/")

        result_message = ""

        # Check if object exists
        if object_name in bpy.data.objects:
            # Deselect all objects first (check if context allows)
            if bpy.context.mode == 'OBJECT':
                if bpy.ops.object.select_all.poll():
                    bpy.ops.object.select_all(action='DESELECT')
            elif bpy.context.mode != 'OBJECT':
                 bpy.ops.object.mode_set(mode='OBJECT')
                 if bpy.ops.object.select_all.poll():
                    bpy.ops.object.select_all(action='DESELECT')

            # Select the target object
            obj_to_export = bpy.data.objects[object_name]
            bpy.context.view_layer.objects.active = obj_to_export
            obj_to_export.select_set(True)

            # Export the selected object as GLB
            try:
                bpy.ops.export_scene.gltf(
                    filepath=export_path,
                    export_format='GLB',
                    use_selection=True,
                    export_apply=False, # Adjust as needed
                    export_cameras=False,
                    export_lights=False
                )
                result_message = f"Successfully exported '{object_name}' to '{export_path}'"
            except Exception as e:
                result_message = f"Error during export of '{object_name}': {str(e)}"
        else:
            result_message = f"Error: Object '{object_name}' not found in Blender scene for export."

        # Print the result message so it's returned by the tool
        print(result_message)
        ```
    *   *Example Tool Use:*
        ```xml
        <use_mcp_tool>
          <server_name>github.com/ahujasid/blender-mcp</server_name>
          <tool_name>execute_blender_code</tool_name>
          <arguments>
          {
            "code": "PASTE_PYTHON_SCRIPT_STRING_HERE"
          }
          </arguments>
        </use_mcp_tool>
        ```
7.  **Restart Development Server:**
    *   Execute the `npm run dev` command within the project's root directory. This command runs `generate-models` (updating `src/3d-model-list.json`) and then starts the Vite server.
    *   *Command:*
        ```xml
        <execute_command>
          <command>npm run dev</command>
          <requires_approval>false</requires_approval>
        </execute_command>
        ```
    *   **Troubleshooting:** If `npm run dev` fails to find `vite` (as seen during testing, possibly due to environment path issues after OS switch), try running the steps separately:
        1.  Run `npm run generate-models` first.
        2.  Then run `node_modules/.bin/vite` directly.
8.  **Inform User & Celebrate!** 🎉
    *   Notify the user that the model (`<new_model_name>.glb`) has been generated, exported, and added to the project.
    *   Confirm that the development server has been restarted (or started).
    *   Instruct the user to **refresh their VR browser tab** connected to the development server URL. Their newly prompted creation should now be visible in the gallery! (Note: The Vite dev server is configured with cache-disabling headers in `vite.config.js` to help ensure the refresh loads the latest assets).

## Using the Custom Roo Code Mode (`.roomodes`)

This project includes a `.roomodes` file defining a custom mode named `Blender2webXR` specifically for this workflow.

**To use it:**
1.  Ensure you are using a compatible version of Roo Code (Cline fork).
2.  Open the `3d-webgallery` project in VS Code.
3.  Select the `Blender2webXR` mode from the mode selection dropdown in the Roo Code chat interface.

This mode pre-configures the agent with the necessary role definition and workflow instructions.

**Note on the Custom Mode:**
*   **Absolute Paths:** The current definition in `.roomodes` uses absolute paths (e.g., for the project location and export directory). If your project is located elsewhere, you may need to edit the `.roomodes` file directly to update these paths.
*   **Write Permissions:** As defined, the `blender2webxr` mode does not grant the agent write permissions. If the agent needs to modify files (e.g., update this documentation), you will need to temporarily switch to a mode with write permissions (like the default 'Code' mode).

## Suggested System Prompt (Manual Configuration)

If not using the custom mode, you can use the following system prompt:

```
You are an AI assistant integrated with the '3d-webgallery' project. Your current working directory is the root of this project. Your task is to generate 3D models using the connected 'blender-mcp' server (`github.com/ahujasid/blender-mcp`) and add them to the gallery for live viewing. Ensure the blender-mcp server process (e.g., `uvx blender-mcp`) is running before starting.

**Workflow:**
1.  **(Optional) Check Hyper3D Status:** Use `get_hyper3d_status`.
2.  **(Optional) Stop Server:** If `npm run dev` is running, ask user to stop it or attempt to stop it.
3.  **Generate Model:** Use 'blender-mcp' tools (`generate_hyper3d_model_via_text`, etc.). Store `task_uuid` and `subscription_key`/`request_id`.
4.  **Poll Status:** Use `poll_rodin_job_status` with stored key/id until completion.
5.  **Import Model:** Use `import_generated_asset` with stored `task_uuid`/`request_id` and give the object a unique name (e.g., based on the prompt). Retry once if it fails initially.
6.  **Export Model:** CRITICAL - Use `execute_blender_code`. Before calling the tool, construct the Python script string:
    *   Start with the provided Python script template.
    *   **Set `export_dir` to the ABSOLUTE path** to the `public/3d-models` directory within this project (e.g., `c:/Users/simon/projects/webxr/3d-webgallery/public/3d-models/`). Relative paths will likely cause permission errors in Blender.
    *   Set the `object_name` variable in the script to the unique name used in the import step.
    *   Set the `export_filename` variable (e.g., `object_name + ".glb"`).
    *   Pass the complete, updated Python script string as the `code` argument to `execute_blender_code`.
7.  **Restart Server:** CRITICAL - Execute 'npm run dev' in the project root directory using `execute_command`. If this fails to find 'vite', try running `npm run generate-models` then `node_modules/.bin/vite`.
8.  **Inform User:** Tell the user the model is added, the server is running, and they need to refresh their browser.

**Important Notes:**
*   The **Export Model** step using `execute_blender_code` is essential to save the model file where the web app can find it.
*   The **Restart Server** step (`npm run dev` or equivalent) is essential to update the web app's model list.
*   Handle potential failures (like the import needing a retry) gracefully.
*   Assume Hyper3D and Poly Haven are enabled in the Blender MCP addon as per the prerequisites; do not ask the user to confirm these settings.
```

## Limitations

*   **Server Restart Required:** The development server **must be restarted** after adding and exporting a new model file for it to appear in the gallery.
*   **Export Script Path:** The Python export script **must use an absolute path** for the output directory (`export_dir`) to avoid permission errors, as confirmed in testing.
*   **Server Start Command:** The standard `npm run dev` command might fail if environment paths are not configured correctly (e.g., after switching from WSL to Windows). Using `node_modules/.bin/vite` directly might be necessary as a workaround.
*   **Managing Running Processes:** Stopping an already running `npm run dev` process via agent commands can be unreliable.
*   **Custom Mode Limitations:** The provided `blender2webxr` custom mode in `.roomodes` currently uses hardcoded absolute paths and lacks write permissions. Adjust the `.roomodes` file if your project path differs or if write access is needed within the mode.
