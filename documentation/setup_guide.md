# 3D Web Gallery: Setup Guide

This document outlines the steps taken to create the 3D Web Gallery application using Three.js and Cannon-es for viewing GLB models with interactive physics-based grabbing in WebXR.

## 1. Project Goal

The aim is to build a 3D Web Gallery experience where users can enter a virtual space, view 3D models loaded from a local directory (`public/3d-models/`), and interact with these models by grabbing, moving, and throwing them using VR controllers. The grabbing mechanic follows the principles detailed in `grabbing_mechanic.md`.

## 2. Prerequisites

*   **Node.js and npm:** Required for package management and running the development server.

## 3. Dependencies

We installed the necessary libraries using npm:

*   **`three`**: The core 3D graphics library.
*   **`@types/three`**: TypeScript definitions for Three.js.
*   **`cannon-es`**: A physics engine for handling collisions, gravity, and forces.
*   **`vite`**: A fast development server and build tool (installed as a dev dependency).

Installation command (reflecting actual steps):

```bash
npm install three cannon-es
npm install --save-dev vite typescript @types/three
```

## 4. Project Structure

The main files and directories involved are:

*   `index.html`: The entry point for the web application.
*   `src/main.ts`: The primary TypeScript file containing all the application logic.
*   `src/3d-model-list.json`: An auto-generated JSON file containing paths to the GLB models found in `public/3d-models/`.
*   `package.json`: Manages project dependencies and scripts (including the model list generation script).
*   `tsconfig.json`: TypeScript configuration for the project.
*   `vite.config.js`: Configuration file for the Vite development server.
*   `public/`: Directory for static assets. Vite copies its contents to the build output root.
*   `public/3d-models/`: Directory containing the actual `.glb` model files.
*   `documentation/`: Contains project documentation (like this file and `grabbing_mechanic.md`).

## 5. HTML Setup (`index.html`)

A basic HTML file was created with:

*   A `meta` viewport tag suitable for responsive design.
*   Basic styling to make the canvas fill the window.
*   A `<script>` tag with `type="module"` to load `src/main.ts`.
*   The VRButton (added dynamically by `main.ts`) will be appended to the body.

## 6. TypeScript Implementation (`src/main.ts`)

This file orchestrates the entire experience:

*   **Core Three.js Setup:** Initializes the `Scene`, `PerspectiveCamera`, `WebGLRenderer`, ambient and directional lighting, and enables shadows.
*   **Physics Setup:** Creates a `CANNON.World` with gravity, defines a physics timestep, and adds a static ground `CANNON.Plane`.
*   **WebXR Integration:**
    *   Enables WebXR on the `WebGLRenderer`.
    *   Adds the `VRButton` to the document for entering VR.
    *   Gets references to the two VR controllers (`renderer.xr.getController(0/1)`).
    *   Adds visual models for the controllers using `XRControllerModelFactory`.
    *   Sets the renderer's animation loop using `renderer.setAnimationLoop(animate)` for VR compatibility.
*   **Model Loading:**
    *   Imports the list of model paths from the auto-generated `src/3d-model-list.json`.
    *   Uses `GLTFLoader` to load all `.glb` files specified in the imported list.
    *   Positions the loaded models in the scene with spacing.
    *   Enables shadows for the models.
*   **Physics Body Creation:**
    *   For each loaded model, calculates its bounding box.
    *   Creates a corresponding `CANNON.Body` with a `CANNON.Box` shape derived from the bounding box dimensions.
    *   Sets the initial position of the physics body to match the visual model.
    *   Adds the body to the `physicsWorld`.
    *   Stores references to the visual meshes (`THREE.Object3D`) and physics bodies (`CANNON.Body`) in arrays (`visualMeshes`, `physicsBodies`).
    *   Uses a `Map` (`physicsMap`) to link the UUID of a Three.js object to its Cannon-es body for easy lookup during grabbing.
*   **Grabbing Mechanics (based on `grabbing_mechanic.md`):**
    *   Raycasting: Sets up a `THREE.Raycaster` originating from the controller's position and pointing forward (`raycaster.far = Infinity`).
    *   Dual Hand Support: Uses `Map`s (`grabbedObjects`, `controllerLastPosition`, `controllerVelocity`) keyed by the controller object (`THREE.Group`) to track the grabbed object/body state and calculate velocity independently for each hand.
    *   `getIntersections` function: Performs the raycast against the `visualMeshes` array (recursively checking children).
    *   Object/Body Lookup: Uses the `physicsMap` (`Map<string, CANNON.Body>`) to find the corresponding `CANNON.Body` for an intersected `THREE.Object3D`'s UUID during `onGrabStart`.
    *   `onGrabStart` function (Controller Event): Handles grabbing logic per controller. Prevents grabbing if the controller already holds an object or if the target object is held by the *other* controller. **Specifically for the left (teleport) controller, grabbing is prevented if teleport aiming (squeeze) is active.**
    *   `onGrabEnd` function (Controller Event): Handles release/throwing logic per controller, applying calculated velocity from the `controllerVelocity` map.
*   **Locomotion:**
    *   **Desktop:** Implements `PointerLockControls` for mouse look. Keyboard listeners (`keydown`/`keyup`) for WASD movement are added permanently. The event handlers (`onKeyDown`, `onKeyUp`) check `pointerLockControls.isLocked` internally before applying movement. The click listener to initiate pointer lock is disabled when entering VR and re-enabled on exit.
    *   **VR Teleportation:**
        *   Uses the left controller (`controller1`) for aiming.
        *   Shows a target marker (`RingGeometry`) on the ground when the `squeeze` button is held.
        *   Raycasts from the controller to find valid ground intersection points.
        *   Teleports the user (by adjusting the `XRReferenceSpace` using matrix calculations) when the `select` (trigger) button is pressed **while the teleport marker is visible (squeeze is held).**
*   **Event Listeners (`setupControllerListeners` function):**
    *   Consolidates adding/removing listeners for both grabbing and teleportation.
    *   Called on `sessionstart` and listeners removed on `sessionend`.
    *   Attaches `selectstart`/`selectend` for grabbing to both controllers.
    *   Attaches `squeezestart`/`squeezeend` for teleport aiming to the left controller.
    *   Attaches `selectstart` (trigger) for teleport confirmation to the left controller (conditional logic within handlers prevents conflict with grabbing).
*   **Animation Loop (`animate` function):**
    *   Steps the `physicsWorld`.
    *   **Physics Synchronization:** Iterates through `physicsBodies` and `visualMeshes`. If a visual mesh's corresponding physics body is *not* currently held (checked by iterating through `grabbedObjects`), its position and quaternion are updated to match its physics body.
    *   **Kinematic Synchronization:** Iterates through the `grabbedObjects` map. For each held object whose body is `KINEMATIC`, the physics body's position and quaternion are manually updated to match the world transform of the *controller* holding it.
    *   **Velocity Calculation:** Iterates through the `grabbedObjects` map, calculating each controller's velocity between frames using the `controllerLastPosition` map and storing it in the `controllerVelocity` map.
    *   Renders the `scene` using the `camera`.

## 7. Vite Configuration (`vite.config.js`)

A `vite.config.js` file was created to configure the Vite development server:

*   `server.host: true`: Allows Vite to listen on all network interfaces.
*   `server.hmr.clientPort: 443`: Helps Hot Module Replacement (HMR) work correctly when accessed via HTTPS tunnels.
*   `server.allowedHosts: ['.ngrok-free.app']`: Allows access from any host ending in `.ngrok-free.app`, specifically configured to work easily with ngrok tunnels during development.

## 8. Running the Project (Development)

1.  **Install Dependencies:** `npm install`
2.  **Start Development Server:** `npm run dev`
3.  **Access:** Open the URL provided by Vite (e.g., `http://localhost:5173` or your ngrok URL) in a WebXR-compatible browser.
4.  **Enter VR:** Click the "Enter VR" button.

## 9. Building for Production (Static Deployment)

The development server (`npm run dev`) is great for coding, but for deployment to a web host that only serves static files, you need to create a production build.

1.  **Ensure Models are in `public/3d-models/`:** As described in "Managing Models", make sure all desired models are placed here.
2.  **Run the Build Script:**
    ```bash
    npm run build
    ```
    This command uses Vite to:
    *   Compile TypeScript to optimized JavaScript.
    *   Bundle all necessary code.
    *   Copy the contents of the `public` directory (including `public/3d-models/`) into the output directory.
    *   Place the final static files into a `dist` directory at the project root.
3.  **Deploy:** Upload the *entire contents* of the `dist` directory to your static web hosting provider (e.g., GitHub Pages, Netlify, Vercel, AWS S3, standard web server, etc.). The application can then be accessed via the `index.html` file within that hosted directory.

## Managing Models

1.  Place your `.glb` model files inside the `public/3d-models/` directory.
2.  Run `npm run dev` or `npm run build`. The `scripts/generate-model-list.js` script (invoked by the `dev` and `build` npm scripts) will automatically scan `public/3d-models/` and update `src/3d-model-list.json`.
3.  **Do not edit `src/3d-model-list.json` manually.**

The application (`src/main.ts`) reads the auto-generated `src/3d-model-list.json` and attempts to load, position, and create physics bodies for each listed model.
