# 3D Web Gallery

This project is a 3D Web Gallery application allowing users to view and interact with 3D models (`.glb` files) in a WebXR virtual reality environment. It uses Three.js for rendering, Cannon-es for physics simulation, and Vite for the development server.

Users can enter a VR space, see models loaded from a specified list, point at them with VR controllers, grab them from any distance, move them around, and throw them using physics.

## Features

*   Loads GLB models specified in `src/3d-model-list.json` (auto-generated from `public/3d-models/`).
*   WebXR support via Three.js `VRButton`.
*   Physics simulation using Cannon-es (gravity, collisions).
*   Raycaster-based grabbing from controllers (unlimited distance).
*   Kinematic grabbing (object follows controller precisely when held).
*   Physics-based throwing (object inherits controller velocity on release).
*   Dual-wielding: Grab and hold a separate object in each hand.
*   Basic ground plane and lighting.
*   Desktop Controls: WASD for movement, Mouse for looking (via Pointer Lock).
*   VR Controls: Teleportation via left controller (squeeze to aim, trigger to teleport).

## Running the Project

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Start Development Server:**
    ```bash
    npm run dev
    ```
3.  **Access:** Open the URL provided by Vite (e.g., `http://localhost:5173` or your ngrok/tunnel URL) in a WebXR-compatible browser (like Meta Quest Browser).
4.  **Enter VR:** Click the "Enter VR" button displayed on the page.

**Note on Vite Configuration:** The `vite.config.js` file is configured with `allowedHosts: ['.ngrok-free.app']` to allow access via ngrok tunnels during development. You may need to adjust this setting if accessing the development server directly or using a different tunneling service.

## Controls

*   **Desktop:**
    *   Click screen: Lock mouse pointer for looking.
    *   Mouse: Look around.
    *   WASD Keys: Move forward/left/backward/right.
    *   ESC Key: Unlock mouse pointer.
*   **VR:**
    *   Right Controller Trigger: Point and press to grab objects.
    *   Left Controller Squeeze: Hold to show teleport target marker.
    *   Left Controller Trigger (while squeezing and marker is green): Teleport to the marker location.
    *   Release Right Trigger: Throw held object.

## Building for Production (Static Hosting)

To create a version of the application that can be hosted on any static file server (like GitHub Pages, Netlify, Vercel, AWS S3, etc.) without needing Node.js running:

1.  **Run the build command:**
    ```bash
    npm run build
    ```
2.  This command will create a `dist` directory in your project root.
3.  **Deploy:** Upload the *entire contents* of the `dist` directory to your static hosting provider.

The `dist` directory contains the optimized HTML, JavaScript, and any assets (like the 3D models located in `public/3d-models/` during development) needed to run the application.

## Managing Models

To change the 3D models displayed in the experience:

1.  Place your `.glb` model files inside the `public/3d-models/` directory.
2.  Run `npm run dev` or `npm run build`. The `src/3d-model-list.json` file will be automatically updated by the `scripts/generate-model-list.js` script based on the `.glb` files found in `public/3d-models/`.
3.  **Do not edit `src/3d-model-list.json` manually**, as your changes will be overwritten.

The application reads the auto-generated `src/3d-model-list.json` on startup and attempts to load, position, and create physics bodies for each listed model.
