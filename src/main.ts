import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import modelPaths from './3d-model-list.json'; // Import the list of models (renamed)

// --- Core Three.js Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Sky blue background

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 3); // Typical standing height

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(5, 10, 7.5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
scene.add(directionalLight);
// const shadowHelper = new THREE.CameraHelper(directionalLight.shadow.camera);
// scene.add(shadowHelper); // Uncomment to debug shadow camera

// --- Physics Setup ---
const physicsWorld = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
});
const physicsTimeStep = 1 / 60; // 60 FPS

// Ground Plane (Visual)
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x228b22 }); // Forest green
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Ground Plane (Physics)
const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0 }); // Static body
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Match visual rotation
physicsWorld.addBody(groundBody);

// --- WebXR Integration ---
renderer.xr.enabled = true;
document.body.appendChild(VRButton.createButton(renderer));

// Controllers
const controller1 = renderer.xr.getController(0); // Typically Left
scene.add(controller1);
const controller2 = renderer.xr.getController(1); // Typically Right
scene.add(controller2);

const controllerModelFactory = new XRControllerModelFactory();

const controllerGrip1 = renderer.xr.getControllerGrip(0);
controllerGrip1.add(controllerModelFactory.createControllerModel(controllerGrip1));
scene.add(controllerGrip1);

const controllerGrip2 = renderer.xr.getControllerGrip(1);
controllerGrip2.add(controllerModelFactory.createControllerModel(controllerGrip2));
scene.add(controllerGrip2);

// --- Model Loading & Physics Body Creation ---
const loader = new GLTFLoader();
const visualMeshes: THREE.Object3D[] = []; // Array for visual models (top-level groups)
const physicsBodies: CANNON.Body[] = [];   // Array for corresponding physics bodies
const initialTransforms: { position: CANNON.Vec3, quaternion: CANNON.Quaternion }[] = []; // Store initial state
const physicsMap = new Map<string, CANNON.Body>(); // Map THREE object UUID -> CANNON Body

const modelSpacing = 1.5;
const modelsPerRow = 5;
let currentX = -((modelsPerRow - 1) * modelSpacing) / 2;
let currentZ = -2;
let modelsInRow = 0;

// Load paths directly from JSON - browser should resolve relative paths correctly
modelPaths.forEach((relativePath, index) => {
    loader.load(
        relativePath, // Use the path directly from the JSON
        (gltf) => {
            const model = gltf.scene;
            model.castShadow = true;
            model.receiveShadow = true;
            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            // Calculate bounding box for physics shape
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const center = new THREE.Vector3();
            box.getCenter(center); // Center relative to model's origin

            // Adjust model position so its base is near y=0 before placing
            model.position.y -= box.min.y;

            // Position the model in the scene
            model.position.x = currentX;
            model.position.z = currentZ;
            model.position.y += size.y / 2 + 0.1; // Place slightly above ground

            scene.add(model);
            visualMeshes.push(model); // Add top-level group/object

            // Create physics body
            const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));
            const body = new CANNON.Body({
                mass: 1, // Give models some mass
                shape: shape,
                // Adjust physics body center based on visual bounding box center
                position: new CANNON.Vec3(
                    model.position.x + center.x,
                    model.position.y + center.y,
                    model.position.z + center.z
                ),
            });

            physicsWorld.addBody(body);
            physicsBodies.push(body);
            // Store initial transform for resetting
            initialTransforms.push({
                position: body.position.clone(),
                quaternion: body.quaternion.clone()
            });

            // Map the main model object's UUID to the physics body
            physicsMap.set(model.uuid, body);
            // Also map children meshes for raycasting hits
            model.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    physicsMap.set(child.uuid, body);
                }
            });

            // Update positioning for next model
            modelsInRow++;
            if (modelsInRow >= modelsPerRow) {
                modelsInRow = 0;
                currentX = -((modelsPerRow - 1) * modelSpacing) / 2;
                currentZ -= modelSpacing;
            } else {
                currentX += modelSpacing;
            }
        },
        undefined, // Progress callback (optional)
        (error) => {
            // Log the path that failed
            console.error(`Error loading model ${relativePath}:`, error);
        }
    );
});

// --- Grabbing Mechanics ---
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

// Use Maps to track grabbed object/body per controller
const grabbedObjects = new Map<THREE.Group, { object: THREE.Object3D, body: CANNON.Body }>();
const controllerLastPosition = new Map<THREE.Group, THREE.Vector3>();
const controllerVelocity = new Map<THREE.Group, THREE.Vector3>();

function getIntersections(controller: THREE.Group): THREE.Intersection[] {
    tempMatrix.identity().extractRotation(controller.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    raycaster.far = Infinity; // Grab from any distance

    // Check against the visual meshes array
    return raycaster.intersectObjects(visualMeshes, true); // Recursive check
}

let isTeleportAiming = false; // Flag for left controller teleport aim

function onGrabStart(this: THREE.Group) { // 'this' is the controller
    const controller = this;

    // Prevent grabbing with left controller if teleport aiming is active
    if (controller === controller1 && isTeleportAiming) {
        return;
    }

    // Prevent grabbing if controller already holds an object
    if (grabbedObjects.has(controller)) {
        return;
    }

    const intersections = getIntersections(controller);

    if (intersections.length > 0) {
        let intersectedObject = intersections[0].object;

        // Find the top-level grabbable object and its physics body
        let targetObject: THREE.Object3D | null = null;
        let targetBody: CANNON.Body | null = null;

        while (intersectedObject) {
            targetBody = physicsMap.get(intersectedObject.uuid) ?? null;
            if (targetBody) {
                // Find the corresponding visual mesh in our main array
                targetObject = visualMeshes.find(mesh => mesh.uuid === intersectedObject.uuid || mesh.children.some(child => child.uuid === intersectedObject.uuid)) ?? null;
                 if (targetObject) break; // Found the body and the top-level visual object
            }
             // If body not found for this object, or visual mesh not found, try parent
            if (!intersectedObject.parent) break; // Stop if no parent
            intersectedObject = intersectedObject.parent;
        }


        // Check if another controller is already holding this body
        let alreadyHeld = false;
        for (const [, grabbed] of grabbedObjects) {
            if (grabbed.body === targetBody) {
                alreadyHeld = true;
                break;
            }
        }

        if (targetObject && targetBody && !alreadyHeld) {
            // Store grabbed state for this controller
            grabbedObjects.set(controller, { object: targetObject, body: targetBody });

            // Physics: Make kinematic
            targetBody.type = CANNON.Body.KINEMATIC;
            targetBody.velocity.setZero();
            targetBody.angularVelocity.setZero();

            // Visual: Attach to controller
            controller.attach(targetObject);

            // Store initial position for velocity calculation
            controllerLastPosition.set(controller, controller.position.clone());
            controllerVelocity.set(controller, new THREE.Vector3()); // Initialize velocity
        }
    }
}

function onGrabEnd(this: THREE.Group) { // 'this' is the controller
    const controller = this;
    const grabbed = grabbedObjects.get(controller);

    if (grabbed) {
        const { object: grabbedObject, body: grabbedBody } = grabbed;

        // Visual: Detach from controller, add back to scene
        scene.attach(grabbedObject); // Preserves world transform

        // Physics: Make dynamic again
        grabbedBody.type = CANNON.Body.DYNAMIC;
        grabbedBody.wakeUp();

        // Apply controller velocity for throwing
        const velocity = controllerVelocity.get(controller);
        if (velocity) {
            grabbedBody.velocity.copy(velocity as unknown as CANNON.Vec3);
            // Optional: Add angular velocity if needed
        }

        // Clean up state for this controller
        grabbedObjects.delete(controller);
        controllerLastPosition.delete(controller);
        controllerVelocity.delete(controller);
    }
}

// --- Locomotion ---

// Desktop Controls
const pointerLockControls = new PointerLockControls(camera, document.body);
scene.add(pointerLockControls.getObject()); // Add camera rig to scene

const moveState = { forward: 0, backward: 0, left: 0, right: 0 };
const moveSpeed = 5; // meters per second

// Add check for pointer lock status inside handlers
function onKeyDown(event: KeyboardEvent) {
    if (!pointerLockControls.isLocked) return;
    switch (event.code) {
        // Inverted W/S and Up/Down
        case 'KeyW': case 'ArrowUp': moveState.backward = 1; break;
        case 'KeyS': case 'ArrowDown': moveState.forward = 1; break;
        case 'KeyA': case 'ArrowLeft': moveState.left = 1; break;
        case 'KeyD': case 'ArrowRight': moveState.right = 1; break;
    }
}

// Add check for pointer lock status inside handlers
function onKeyUp(event: KeyboardEvent) {
    if (!pointerLockControls.isLocked) return;
    switch (event.code) {
        // Inverted W/S and Up/Down
        case 'KeyW': case 'ArrowUp': moveState.backward = 0; break;
        case 'KeyS': case 'ArrowDown': moveState.forward = 0; break;
        case 'KeyA': case 'ArrowLeft': moveState.left = 0; break;
        case 'KeyD': case 'ArrowRight': moveState.right = 0; break;
    }
}

// Define the click listener function
const desktopClickListener = () => {
    if (!renderer.xr.isPresenting) {
        pointerLockControls.lock();
    }
};
// Add the listener initially
document.addEventListener('click', desktopClickListener);
// Removed extra }); here

// Add key listeners permanently
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);

// Remove listener management from lock/unlock handlers
pointerLockControls.addEventListener('lock', () => {
    console.log('Pointer locked');
});

pointerLockControls.addEventListener('unlock', () => {
    console.log('Pointer unlocked');
    // Reset movement state on unlock
    moveState.forward = moveState.backward = moveState.left = moveState.right = 0;
});


// VR Teleportation (Left Controller: controller1)
const teleportTargetGeometry = new THREE.RingGeometry(0.15, 0.2, 32);
teleportTargetGeometry.rotateX(-Math.PI / 2); // Align with ground
const teleportTargetMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
const teleportTargetMesh = new THREE.Mesh(teleportTargetGeometry, teleportTargetMaterial);
teleportTargetMesh.visible = false;
scene.add(teleportTargetMesh);

let teleportTargetPosition: THREE.Vector3 | null = null;

function updateTeleportTarget() {
    if (!isTeleportAiming) {
        teleportTargetMesh.visible = false;
        teleportTargetPosition = null;
        return;
    }

    tempMatrix.identity().extractRotation(controller1.matrixWorld);
    raycaster.ray.origin.setFromMatrixPosition(controller1.matrixWorld);
    raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
    raycaster.far = 10; // Max teleport distance

    const intersects = raycaster.intersectObject(groundMesh); // Only intersect with ground

    if (intersects.length > 0) {
        teleportTargetPosition = intersects[0].point;
        teleportTargetMesh.position.copy(teleportTargetPosition).add(new THREE.Vector3(0, 0.01, 0)); // Slightly above ground
        teleportTargetMesh.visible = true;
        (teleportTargetMesh.material as THREE.MeshBasicMaterial).color.set(0x00ff00); // Green = valid
    } else {
        teleportTargetMesh.visible = false;
        teleportTargetPosition = null;
        // Optional: Show invalid target indicator (e.g., red ring at max distance)
    }
}

function onTeleportAimStart() { // Squeeze Start (Left Controller)
    isTeleportAiming = true;
}

function onTeleportAimEnd() { // Squeeze End (Left Controller)
    isTeleportAiming = false;
    teleportTargetMesh.visible = false;
    teleportTargetPosition = null;
}

function onTeleportSelect() { // Select Start (Trigger - Left Controller)
    if (isTeleportAiming && teleportTargetPosition) {
        const xrRefSpace = renderer.xr.getReferenceSpace();
        if (!xrRefSpace) return;

        // Calculate offset needed to move the camera rig center to the target
        const headPosition = new THREE.Vector3();
        camera.getWorldPosition(headPosition); // Get current head position in world space

        // We want the *center* of the playspace (camera rig origin) to move.
        // Get the camera rig's current position
        const rigPosition = pointerLockControls.getObject().position;

        // Calculate the offset from the rig center to the head
        const headOffset = new THREE.Vector3().subVectors(headPosition, rigPosition);
        headOffset.y = 0; // Ignore vertical offset for teleportation

        // Target position for the *rig* is the teleport point minus the head offset
        const targetRigPosition = new THREE.Vector3().subVectors(teleportTargetPosition, headOffset);

        // Calculate the translation needed
        const offset = new THREE.Vector3().subVectors(targetRigPosition, rigPosition);

        // Create a transform matrix for the offset
        const offsetMatrix = new THREE.Matrix4().makeTranslation(offset.x, offset.y, offset.z);

        // Apply the offset to the reference space
        const newRefSpace = xrRefSpace.getOffsetReferenceSpace(new XRRigidTransform(offset));
        renderer.xr.setReferenceSpace(newRefSpace);

        // Hide marker after teleport
        isTeleportAiming = false;
        teleportTargetMesh.visible = false;
        teleportTargetPosition = null;
    }
    // Note: No 'else' needed here. If not aiming or no valid target, trigger does nothing for teleport.
    // Grabbing logic is handled separately in onGrabStart, which checks isTeleportAiming.
}

// --- Reset Function ---
function resetObjects() {
    console.log("Resetting object positions...");
    physicsBodies.forEach((body, index) => {
        if (initialTransforms[index]) {
            const { position, quaternion } = initialTransforms[index];
            body.position.copy(position);
            body.quaternion.copy(quaternion);
            body.velocity.setZero();
            body.angularVelocity.setZero();
            body.wakeUp(); // Ensure physics engine updates the body state
        }
    });
    // Also clear any grabbed objects state
    grabbedObjects.forEach((grabbed, controller) => {
         scene.attach(grabbed.object); // Detach from controller
         grabbed.body.type = CANNON.Body.DYNAMIC; // Ensure it's dynamic
    });
    grabbedObjects.clear();
    controllerLastPosition.clear();
    controllerVelocity.clear();
}


// --- Event Listener Setup ---
function setupControllerListeners() {
    // Grabbing (Both Controllers)
    controller1.addEventListener('selectstart', onGrabStart);
    controller1.addEventListener('selectend', onGrabEnd);
    controller2.addEventListener('selectstart', onGrabStart);
    controller2.addEventListener('selectend', onGrabEnd);

    // Teleport Aiming (Left Controller Squeeze)
    controller1.addEventListener('squeezestart', onTeleportAimStart);
    controller1.addEventListener('squeezeend', onTeleportAimEnd);

    // Teleport Confirmation (Left Controller Trigger)
    controller1.addEventListener('selectstart', onTeleportSelect); // Add listener

    // Reset Objects (Right Controller Squeeze)
    controller2.addEventListener('squeezestart', resetObjects);
}

function removeControllerListeners() {
    controller1.removeEventListener('selectstart', onGrabStart);
    controller1.removeEventListener('selectend', onGrabEnd);
    controller2.removeEventListener('selectstart', onGrabStart);
    controller2.removeEventListener('selectend', onGrabEnd);

    controller1.removeEventListener('squeezestart', onTeleportAimStart);
    controller1.removeEventListener('squeezeend', onTeleportAimEnd);
    controller1.removeEventListener('selectstart', onTeleportSelect);

    // Reset Objects
    controller2.removeEventListener('squeezestart', resetObjects);
}

renderer.xr.addEventListener('sessionstart', () => {
    console.log('XR Session Started');
    setupControllerListeners();
    // Disable pointer lock controls when entering VR
    if (pointerLockControls.isLocked) {
        pointerLockControls.unlock(); // This also removes key listeners
    }
    // Remove the named listener
    document.removeEventListener('click', desktopClickListener);
});

renderer.xr.addEventListener('sessionend', () => {
    console.log('XR Session Ended');
    removeControllerListeners();
    // Clean up any remaining grabbed state
    grabbedObjects.clear();
    controllerLastPosition.clear();
    controllerVelocity.clear();
    isTeleportAiming = false;
    teleportTargetMesh.visible = false;
    // Re-enable pointer lock controls for desktop by adding the named listener back
    document.addEventListener('click', desktopClickListener);
});


// --- Animation Loop ---
const clock = new THREE.Clock();

// Remove unused 'frame' parameter
function animate(timestamp: number) {
    const deltaTime = clock.getDelta();

    // --- Physics Update ---
    physicsWorld.step(physicsTimeStep, deltaTime);

    // --- Desktop Movement ---
    if (pointerLockControls.isLocked) {
        const speed = moveSpeed * deltaTime;
        const moveDirection = new THREE.Vector3();

        if (moveState.forward) moveDirection.z -= 1;
        if (moveState.backward) moveDirection.z += 1;
        if (moveState.left) moveDirection.x -= 1;
        if (moveState.right) moveDirection.x += 1;

        moveDirection.normalize(); // Ensure consistent speed diagonally

        pointerLockControls.moveRight(moveDirection.x * speed);
        pointerLockControls.moveForward(moveDirection.z * speed);

        // Optional: Add gravity or collision detection for desktop mode if needed
        // pointerLockControls.getObject().position.y -= 9.8 * deltaTime * deltaTime; // Basic gravity
        // if (pointerLockControls.getObject().position.y < 1.6) {
        //     pointerLockControls.getObject().position.y = 1.6;
        // }
    }

    // --- VR Updates ---
    if (renderer.xr.isPresenting) {
        updateTeleportTarget(); // Update teleport marker visibility and position

        // Update controller velocities and kinematic body positions
        grabbedObjects.forEach((grabbed, controller) => {
            const { body: grabbedBody } = grabbed;
            const lastPos = controllerLastPosition.get(controller);
            const currentVel = controllerVelocity.get(controller);

            if (lastPos && currentVel) {
                // Calculate velocity
                currentVel.copy(controller.position).sub(lastPos).divideScalar(deltaTime);
                lastPos.copy(controller.position); // Update last position

                // Sync kinematic body to controller world transform
                if (grabbedBody.type === CANNON.Body.KINEMATIC) {
                    const worldPos = new THREE.Vector3();
                    const worldQuat = new THREE.Quaternion();
                    // IMPORTANT: Use the controller itself, not the grabbed object,
                    // as the object is parented and its world transform depends on the controller.
                    controller.getWorldPosition(worldPos);
                    controller.getWorldQuaternion(worldQuat);

                    grabbedBody.position.copy(worldPos as unknown as CANNON.Vec3);
                    grabbedBody.quaternion.copy(worldQuat as unknown as CANNON.Quaternion);
                }
            }
        });
    } else {
        // Reset velocities if not in VR or nothing grabbed
         controllerVelocity.forEach(v => v.set(0, 0, 0));
    }


    // --- Physics Synchronization (Visual = Physics) ---
    // Update non-grabbed visual meshes to match physics bodies
    for (let i = 0; i < physicsBodies.length; i++) {
        const body = physicsBodies[i];
        const mesh = visualMeshes[i];

        // Check if this body is currently held by ANY controller
        let isHeld = false;
        for (const [, grabbed] of grabbedObjects) {
            if (grabbed.body === body) {
                isHeld = true;
                break;
            }
        }

        // Only sync if the body is dynamic (or sleeping) AND not currently held
        if (!isHeld && body.type !== CANNON.Body.KINEMATIC) {
            mesh.position.copy(body.position as unknown as THREE.Vector3);
            mesh.quaternion.copy(body.quaternion as unknown as THREE.Quaternion);
        }
    }

    // --- Rendering ---
    renderer.render(scene, camera);
}

// Start the animation loop (required for WebXR)
renderer.setAnimationLoop(animate);

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

console.log("Application initialized. Click 'Enter VR' or click screen for desktop controls.");
