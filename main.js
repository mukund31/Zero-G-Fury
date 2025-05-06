// === SCENE SETUP ===
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 10000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// === GAME STATE ===
let score = 0;
const scoreDisplay = document.getElementById('score-display');
scoreDisplay.style.fontSize = '24px';

function updateScoreDisplay() {
  scoreDisplay.textContent = `Score: ${score}`; 
  
  // Optional: Add a visual effect when score changes
  scoreDisplay.style.color = '#ffff00';
  setTimeout(() => {
    scoreDisplay.style.color = '';
  }, 300);
}


// === AIMING SYSTEM ===
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2(0, 0);
let mouseMoved = false;

const aimPoint = new THREE.Vector3();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

// Aim line (dotted green line)
const aimLineMaterial = new THREE.LineDashedMaterial({ 
  color: 0x00ff00,
  dashSize: 1,
  gapSize: 0.5,
  linewidth: 2 
});
const aimLineGeometry = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(0,0,0),
  new THREE.Vector3(0,0,-1)
]);
// const aimLine = new THREE.Line(aimLineGeometry, aimLineMaterial);
const aimLine = new THREE.Line(
  aimLineGeometry,
  new THREE.LineDashedMaterial({
    color: 0x00ff00,
    dashSize: 1,
    gapSize: 0.5,
    linewidth: 2
  })
);
aimLine.computeLineDistances();
scene.add(aimLine);

let highlightedAsteroid = null;



// Crosshair marker
const crosshair = new THREE.Mesh(
  new THREE.SphereGeometry(0.1, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffff00 })
);
scene.add(crosshair);

function updateAiming() {
  if (!shuttle) return;

  // Compute forward direction of the shuttle
  const shuttleForward = new THREE.Vector3(0, 0, -1).applyQuaternion(shuttle.quaternion);

  // Set the ray from camera and current mouse position
  raycaster.setFromCamera(mouse, camera);

  // Compute the point 500 units in front of the shuttle
  const start = shuttle.position.clone();
  const end = shuttle.position.clone().add(shuttleForward.clone().multiplyScalar(500));

  // Project the mouse position onto a point at Z = end.z
  const projectedPoint = raycaster.ray.origin.clone().add(
    raycaster.ray.direction.clone().multiplyScalar(
      (end.z - raycaster.ray.origin.z) / raycaster.ray.direction.z
    )
  );

  // Replace only the X and Y of the aimPoint, keep Z = 500 units ahead
  aimPoint.set(projectedPoint.x, projectedPoint.y, end.z);

  // Update aim line
  const points = [start, aimPoint.clone()];
  aimLine.geometry.dispose(); // Clean up old geometry
  aimLine.geometry = new THREE.BufferGeometry().setFromPoints(points);
  aimLine.computeLineDistances();
  aimLine.geometry.attributes.position.needsUpdate = true;
  // aimLine.geometry.needsUpdate = true;

  // Update crosshair
  crosshair.position.copy(aimPoint);
  crosshair.visible = true;
  aimLine.visible = true;

  // Reset previous highlight
  if (highlightedAsteroid?.material?.emissive) {
    highlightedAsteroid.material.emissive.set(0x000000);
    highlightedAsteroid = null;
  }

  // Optional: Highlight asteroids under the mouse
  const intersects = raycaster.intersectObjects(asteroids, true);
  if (intersects.length > 0) {
    const hit = intersects[0].object;
    const parentAsteroid = hit.parent;
    if (parentAsteroid.material?.emissive) {
      parentAsteroid.material.emissive.set(0xff0000);
      highlightedAsteroid = parentAsteroid;
    }
  }
}




document.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  mouseMoved = true;
});

// === MISSILE SYSTEM ===
const missiles = [];
let missileCooldown = false;

function createMissile() {
  const geometry = new THREE.ConeGeometry(0.2, 1, 16);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshPhongMaterial({
    color: 0x3333ff,
    emissive: 0x0000ff,
    emissiveIntensity: 0.5
  });
  const missile = new THREE.Mesh(geometry, material);

  const flameGeometry = new THREE.ConeGeometry(0.15, 0.5, 8);
  flameGeometry.rotateX(Math.PI / 2);
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: 0xffaa00,
    transparent: true,
    opacity: 1
  });
  const flame = new THREE.Mesh(flameGeometry, flameMaterial);
  flame.position.set(0, 0, -0.6);
  missile.add(flame);

  return missile;
}

function shootMissile() {
  if (missileCooldown || !shuttle) return;
  missileCooldown = true;

  if (shootSound.isPlaying) shootSound.stop();
  shootSound.play();

  const missile = createMissile();
  missile.position.copy(shuttle.position);
  
  // Calculate direction toward aim point
  const direction = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, 0, 0)).normalize();
  
  // Set missile orientation
  const targetQuaternion = new THREE.Quaternion();
  targetQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 10), direction);
  missile.quaternion.copy(targetQuaternion);
  
  // Move missile slightly ahead of shuttle to avoid collision
  missile.position.add(direction.clone().multiplyScalar(3));
  
  // Set a fixed, larger velocity value for debugging
  const speed = 500; // Increased speed for visibility
  
  missile.userData = {
    velocity: direction.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile.position.clone() // Store initial position for debugging
  };

  scene.add(missile);
  missiles.push(missile);

  setTimeout(() => missileCooldown = false, 300);
}

function updateMissiles(deltaTime) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const missile = missiles[i];
    
    // Apply velocity with a minimum movement to ensure visibility
    const movement = missile.userData.velocity.clone().multiplyScalar(deltaTime);
    
    missile.position.add(movement);
    
    // Update orientation to match velocity direction
    if (missile.userData.velocity.lengthSq() > 0) {
      missile.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1), 
        missile.userData.velocity.clone().normalize()
      );
    }
    
    missile.userData.lifetime += deltaTime;
    
    // Log distance traveled for debugging
    if (missile.userData.lifetime < 0.5 && missile.userData.lifetime % 0.1 < 0.01) {
      const distanceTraveled = missile.position.distanceTo(missile.userData.initialPosition);
    }
    
    // Increase lifetime before removal for debugging
    if (missile.userData.lifetime > 5 || missile.position.distanceTo(shuttle.position) > 2000) {
      scene.remove(missile);
      missiles.splice(i, 1);
    }
  }
}


// === SHUTTLE ===
let shuttle;
const shuttleSpeed = 2;

function loadShuttle() {
  const loader = new THREE.GLTFLoader();
  loader.load('assets/Models/space_shuttle_buran.glb', (gltf) => {
    shuttle = gltf.scene;
    shuttle.scale.set(1, 1, 1);
    shuttle.position.set(0, 0, 0);
    scene.add(shuttle);

    // Force aim line to update after shuttle is loaded
    updateAiming();

    document.dispatchEvent(new MouseEvent('mousemove', {
      clientX: window.innerWidth / 2,
      clientY: window.innerHeight / 2
    }));
    
  });
}


function updateShuttle() {
  if (!shuttle) return;

  shuttle.translateZ(-shuttleSpeed);

  const offset = new THREE.Vector3(0, 3, 10);
  camera.position.copy(shuttle.position.clone().add(offset));
  camera.lookAt(shuttle.position);
  // loadGoal();

  if (shuttle.position.distanceTo(goal.position) < 60) {
    gameOver(true);
  }

  // updateScoreDisplay();
  starField.position.copy(shuttle.position);

}

// === ASTEROIDS ===
const numAsteroids = 2000;
let asteroids = [];
const asteroidModels = [];

function loadAsteroids() {
  const loader = new THREE.GLTFLoader();
  const asteroidPaths = [
    'assets/Models/asteroid4.glb'
  ];
  let loaded = 0;
  asteroidPaths.forEach((path, index) => {
    loader.load(path, (gltf) => {
      const model = gltf.scene;
      
      // Precompute bounding spheres for all meshes
      model.traverse(child => {
        if (child.isMesh && child.geometry) {
          child.geometry.computeBoundingSphere();
        }
      });
      
      asteroidModels[index] = model;
      loaded++;
      if (loaded === asteroidPaths.length) {
        createAsteroids();
      }
    });
  });
}



function createAsteroids() {
  for (let i = 0; i < numAsteroids; i++) {
    // Create asteroid with improved positioning
    createRandomAsteroid(-500, -5000);
  }
}

function createNewAsteroid() {
  // If shuttle exists, position asteroids relative to it
  // Otherwise, position them at a default distance
  const referenceZ = shuttle ? shuttle.position.z - 1000 : -1000;
  createRandomAsteroid(referenceZ - 500, referenceZ - 5000);
}

function createRandomAsteroid(minZ, maxZ) {
  const asteroid = asteroidModels[Math.floor(Math.random() * asteroidModels.length)].clone();
  
  // Use a more distributed positioning approach
  // Avoid clustering by using a minimum distance from center
  const minDistanceFromCenter = 200; // Minimum distance from center axis
  const maxDistance = 2500; // Maximum distance from center
  
  // Generate X and Y with minimum distance from center
  let x, y;
  do {
    x = (Math.random() - 0.5) * 2 * maxDistance;
    y = (Math.random() - 0.5) * 2 * maxDistance;
  } while (Math.sqrt(x*x + y*y) < minDistanceFromCenter);
  
  // Generate Z between min and max
  const z = minZ - Math.random() * (maxZ - minZ);
  
  asteroid.position.set(x, y, z);
  
  // Randomize scale with more variation
  asteroid.scale.setScalar(0.7 + Math.random() * 1.3);
  
  // Randomize rotation on all axes
  asteroid.rotation.set(
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2,
    Math.random() * Math.PI * 2
  );
  
  // Add velocity with more variation
  asteroid.velocity = new THREE.Vector3(
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.1 - 0.05 // Some asteroids move forward, some backward
  );
  
  scene.add(asteroid);
  asteroids.push(asteroid);
  
  return asteroid;
}


function updateAsteroids(deltaTime) {
  const shuttleZ = shuttle ? shuttle.position.z : 0;
  
  asteroids.forEach((asteroid, index) => {
    // Apply velocity
    asteroid.position.add(asteroid.velocity);
    
    // Add slight rotation for more dynamic movement
    asteroid.rotation.x += deltaTime * 0.1 * (Math.random() - 0.5);
    asteroid.rotation.y += deltaTime * 0.1 * (Math.random() - 0.5);
    
    // Keep asteroids within reasonable X/Y bounds
    if (Math.abs(asteroid.position.x) > 3000) {
      asteroid.position.x *= 0.95;
      asteroid.velocity.x *= -0.8;
    }
    
    if (Math.abs(asteroid.position.y) > 3000) {
      asteroid.position.y *= 0.95;
      asteroid.velocity.y *= -0.8;
    }
    
    // Recycle asteroids that are too far behind or ahead
    if (asteroid.position.z > shuttleZ + 500 || asteroid.position.z < shuttleZ - 6000) {
      // Remove this asteroid
      scene.remove(asteroid);
      asteroids.splice(index, 1);
      
      // Create a new one to replace it
      createRandomAsteroid(shuttleZ - 1000, shuttleZ - 5000);
    }
  });
  
  // Occasionally add some variation to velocities
  if (Math.random() < 0.01) {
    asteroids.forEach(asteroid => {
      asteroid.velocity.x += (Math.random() - 0.5) * 0.05;
      asteroid.velocity.y += (Math.random() - 0.5) * 0.05;
    });
  }
}




// === GOAL ===

let goal;
function loadGoal() {
  // Remove any existing goal
  if (goal) scene.remove(goal);
  
  // Create Earth container
  goal = new THREE.Object3D();
  goal.position.set(0, 0, -10000);
  
  // Create Earth sphere
  const earthGeometry = new THREE.SphereGeometry(50, 64, 64);
  
  // Load Earth textures
  const textureLoader = new THREE.TextureLoader();
  
  // Load Earth color map (diffuse texture)
  const earthTexture = textureLoader.load(
    'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg', 
    () => {}
  );
  
  // Create Earth material with the texture
  const earthMaterial = new THREE.MeshPhongMaterial({
    map: earthTexture,
    shininess: 5
  });
  
  // Create Earth mesh
  const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial);
  goal.add(earthMesh);
  
  // Add clouds layer (optional)
  const cloudsGeometry = new THREE.SphereGeometry(51, 64, 64);
  const cloudsTexture = textureLoader.load(
    'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
    () => {}
  );
  
  const cloudsMaterial = new THREE.MeshPhongMaterial({
    map: cloudsTexture,
    transparent: true,
    opacity: 0.8
  });
  
  const cloudsMesh = new THREE.Mesh(cloudsGeometry, cloudsMaterial);
  goal.add(cloudsMesh);
  
  // Add Earth to scene
  scene.add(goal);
  
  // Add dedicated light for Earth
  const earthLight = new THREE.DirectionalLight(0xffffff, 1.5);
  earthLight.position.set(500, 300, -500);
  earthLight.target = goal;
  scene.add(earthLight);
  
  // Add rotation animation
  goal.userData.rotationSpeed = 0.005;
  
  // Add update function to animate Earth
  const originalUpdateShuttle = updateShuttle;
  updateShuttle = function() {
    originalUpdateShuttle();
    
    // Rotate Earth
    if (goal && goal.userData && goal.userData.rotationSpeed) {
      goal.rotation.y += goal.userData.rotationSpeed;
    }
  };
  
  return goal;
}



function detectCollisions() {
  if (!shuttle) return;

  // Check shuttle collisions with asteroids
  for (let i = 0; i < asteroids.length; i++) {
    const ast = asteroids[i];
    if (shuttle.position.distanceTo(ast.position) < ast.scale.x * 2 + 2) {
      gameOver(false);
      return; // Exit early if game over
    }
  }

  // Track which objects to remove
  const missilesToRemove = [];
  const asteroidsToRemove = [];
  let scoreChanged = false;

  // Check all missile-asteroid collisions using center-to-center distance
  for (let m = 0; m < missiles.length; m++) {
    const missile = missiles[m];
    
    // Skip if this missile is already marked for removal
    if (missilesToRemove.includes(m)) continue;
    
    for (let a = 0; a < asteroids.length; a++) {
      const asteroid = asteroids[a];
      
      // Skip if this asteroid is already marked for removal
      if (asteroidsToRemove.includes(a)) continue;
      
      // Simple center-to-center distance check with a generous radius
      // Increase the collision radius to make hits more forgiving
      const collisionRadius = asteroid.scale.x * 20; // More generous radius
      const distance = missile.position.distanceTo(asteroid.position);
      
      if (distance < collisionRadius) {
        // Mark objects for removal
        missilesToRemove.push(m);
        asteroidsToRemove.push(a);

        if (explosionSound.isPlaying) explosionSound.stop();
        explosionSound.play();
        
        // Increment score
        score++;
        scoreChanged = true;
        
        // Create explosion effect at asteroid position
        createExplosion(asteroid.position.clone());
        
        // Break inner loop - one missile hits one asteroid
        break;
      }
    }
  }
  
  // Remove missiles (in reverse order to maintain correct indices)
  for (let i = missilesToRemove.length - 1; i >= 0; i--) {
    const index = missilesToRemove[i];
    scene.remove(missiles[index]);
    missiles.splice(index, 1);
  }
  
  // Remove asteroids (in reverse order)
  for (let i = asteroidsToRemove.length - 1; i >= 0; i--) {
    const index = asteroidsToRemove[i];
    scene.remove(asteroids[index]);
    asteroids.splice(index, 1);
    
    // Create a new asteroid to replace the destroyed one
    createNewAsteroid();
  }
  
  // Update score display if needed
  if (scoreChanged) {
    updateScoreDisplay();
  }
}


function createExplosion(position) {
  // Create a simple particle system for the explosion
  const particleCount = 20;
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const velocities = [];
  
  for (let i = 0; i < particleCount; i++) {
    // Start all particles at the center
    vertices.push(0, 0, 0);
    
    // Random velocity direction
    const vx = (Math.random() - 0.5) * 2;
    const vy = (Math.random() - 0.5) * 2;
    const vz = (Math.random() - 0.5) * 2;
    
    // Normalize and scale
    const length = Math.sqrt(vx*vx + vy*vy + vz*vz);
    velocities.push({
      x: (vx/length) * (0.5 + Math.random() * 1.5),
      y: (vy/length) * (0.5 + Math.random() * 1.5),
      z: (vz/length) * (0.5 + Math.random() * 1.5)
    });
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  // Create different colored particles for more visual interest
  const materials = [
    new THREE.PointsMaterial({ color: 0xff4500, size: 0.7, transparent: true }), // Orange-red
    new THREE.PointsMaterial({ color: 0xffaa00, size: 0.5, transparent: true }), // Yellow-orange
    new THREE.PointsMaterial({ color: 0xaaaaaa, size: 0.3, transparent: true })  // Gray (smoke)
  ];
  
  const particles = [];
  
  // Create multiple particle systems with different colors
  materials.forEach(material => {
    const points = new THREE.Points(geometry.clone(), material);
    points.position.copy(position);
    scene.add(points);
    particles.push({
      points: points,
      material: material,
      velocities: [...velocities] // Clone the velocities array
    });
  });
  
  // Animate the explosion
  const startTime = Date.now();
  const duration = 1500; // 1.5 seconds
  
  function animateExplosion() {
    const elapsed = Date.now() - startTime;
    const progress = elapsed / duration;
    
    if (progress >= 1) {
      // Remove all particle systems when animation is complete
      particles.forEach(p => scene.remove(p.points));
      return;
    }
    
    // Update each particle system
    particles.forEach((particleSystem, systemIndex) => {
      const positions = particleSystem.points.geometry.attributes.position.array;
      
      // Update each particle position based on its velocity and time
      for (let i = 0; i < particleCount; i++) {
        const velocity = particleSystem.velocities[i];
        const idx = i * 3;
        
        positions[idx] += velocity.x * (systemIndex * 0.2 + 0.8);
        positions[idx+1] += velocity.y * (systemIndex * 0.2 + 0.8);
        positions[idx+2] += velocity.z * (systemIndex * 0.2 + 0.8);
      }
      
      particleSystem.points.geometry.attributes.position.needsUpdate = true;
      
      // Fade out based on progress
      particleSystem.material.opacity = 1 - progress;
      
      // Increase size slightly as explosion expands
      particleSystem.points.material.size *= 1.01;
    });
    
    requestAnimationFrame(animateExplosion);
  }
  
  animateExplosion();
}

function showScorePopup() {
  // Create or update a DOM element to show the score
  const popup = document.getElementById('score-popup') || document.createElement('div');
  popup.id = 'score-popup';
  popup.textContent = `Score: ${score}`;
  popup.style.position = 'absolute';
  popup.style.top = '100px';
  popup.style.left = '50%';
  popup.style.transform = 'translateX(-50%)';
  popup.style.color = '#ffff00';
  popup.style.fontSize = '24px';
  popup.style.fontWeight = 'bold';
  popup.style.textShadow = '0 0 5px #000';
  
  if (!document.getElementById('score-popup')) {
    document.body.appendChild(popup);
  }
  
  // Animate
  popup.style.animation = 'none';
  void popup.offsetWidth; // Trigger reflow
  popup.style.animation = 'scorePopup 1s forwards';
  
  // Add this CSS if not already present
  if (!document.getElementById('score-popup-style')) {
    const style = document.createElement('style');
    style.id = 'score-popup-style';
    style.textContent = `
      @keyframes scorePopup {
        0% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, -50px); }
      }
    `;
    document.head.appendChild(style);
  }
}


function gameOver(success) {
  gameActive = false;
  gamePaused = false;

  hidePauseMenu();

  // First, check if there's already a popup and remove it
  const existingPopup = document.querySelector('.game-over-popup');
  if (existingPopup) {
    document.body.removeChild(existingPopup);
  }

  // Create popup container
  const popup = document.createElement('div');
  popup.className = 'game-over-popup'; // Add a class for easy selection
  popup.style.position = 'absolute';
  popup.style.top = '50%';
  popup.style.left = '50%';
  popup.style.transform = 'translate(-50%, -50%) scale(0.9)';
  popup.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
  popup.style.color = 'white';
  popup.style.padding = '30px';
  popup.style.borderRadius = '10px';
  popup.style.boxShadow = '0 0 20px rgba(0, 0, 255, 0.5)';
  popup.style.textAlign = 'center';
  popup.style.zIndex = '1000';
  popup.style.minWidth = '300px';
  popup.style.fontFamily = 'Arial, sans-serif';
  popup.style.opacity = '0';
  popup.style.transition = 'all 0.5s ease-out';
  
  // Add title
  const title = document.createElement('h2');
  title.textContent = success ? '🎉 Mission Complete!' : '💥 Mission Failed!';
  title.style.color = success ? '#4CAF50' : '#F44336';
  title.style.marginTop = '0';
  title.className = 'pulse';
  popup.appendChild(title);
  
  // Add score
  const scoreElement = document.createElement('h3');
  scoreElement.textContent = `Final Score: ${score}`;
  scoreElement.style.fontSize = '24px';
  scoreElement.style.margin = '20px 0';
  popup.appendChild(scoreElement);
  
  
  // Add replay button
  const replayButton = document.createElement('button');
  replayButton.textContent = 'Play Again';
  replayButton.style.backgroundColor = '#4CAF50';
  replayButton.style.color = 'white';
  replayButton.style.border = 'none';
  replayButton.style.padding = '10px 20px';
  replayButton.style.fontSize = '16px';
  replayButton.style.borderRadius = '5px';
  replayButton.style.cursor = 'pointer';
  replayButton.style.marginTop = '20px';
  replayButton.style.transition = 'background-color 0.3s';
  
  replayButton.addEventListener('mouseover', () => {
    replayButton.style.backgroundColor = '#45a049';
  });
  
  replayButton.addEventListener('mouseout', () => {
    replayButton.style.backgroundColor = '#4CAF50';
  });
  
  // Use a flag to prevent multiple clicks
  let buttonClicked = false;
  
  replayButton.addEventListener('click', () => {
    // Prevent multiple clicks
    if (buttonClicked) return;
    buttonClicked = true;
    
    // Disable the button visually
    replayButton.style.backgroundColor = '#888';
    replayButton.style.cursor = 'default';
    replayButton.textContent = 'Restarting...';
    
    // Fade out animation
    popup.style.opacity = '0';
    popup.style.transform = 'translate(-50%, -50%) scale(0.8)';
    
    // Remove popup and reset game after animation completes
    setTimeout(() => {
      // Check if popup is still in the DOM before trying to remove it
      if (document.body.contains(popup)) {
        document.body.removeChild(popup);
      }
      
      resetGame();
      
      // Resume game loop
      if (!animationRunning) {
        animationRunning = true;
        requestAnimationFrame(animate);
      }
    }, 500); // Match the transition duration
  });
  
  popup.appendChild(replayButton);
  
  // Add to document
  document.body.appendChild(popup);
  
  // Trigger entrance animation
  setTimeout(() => {
    popup.style.opacity = '1';
    popup.style.transform = 'translate(-50%, -50%) scale(1)';
  }, 10);
  
  // Pause the game loop
  animationRunning = false;
}

// Add this to your GAME STATE section
let gamePaused = false;
let gameActive = true;

// Add these functions for pause functionality
function togglePause() {
  if (!gameActive) return; // Don't pause if game is over
  
  gamePaused = !gamePaused;
  
  if (gamePaused) {
    showPauseMenu();
  } else {
    hidePauseMenu();
  }
}

function hidePauseMenu() {
  const pauseMenu = document.getElementById('pause-menu');
  if (pauseMenu) {
    document.body.removeChild(pauseMenu);
  }
  gamePaused = false;
}

function showPauseMenu() {
  // Create pause menu
  const pauseMenu = document.createElement('div');
  pauseMenu.id = 'pause-menu';
  pauseMenu.className = 'pause-menu fade-in';
  
  pauseMenu.innerHTML = `
    <h2>GAME PAUSED</h2>
    <button id="resume-button">RESUME</button>
    <button id="restart-button-pause">RESTART</button>
  `;
  
  document.body.appendChild(pauseMenu);
  
  // Add event listeners
  document.getElementById('resume-button').addEventListener('click', togglePause);
  document.getElementById('restart-button-pause').addEventListener('click', () => {
    hidePauseMenu();
    resetGame();
  });
}



function resetGame() {
  // Reset score
  score = 0;
  gameActive = true;
  gamePaused = false;
  updateScoreDisplay();
  
  // Reset shuttle position
  if (shuttle) {
    shuttle.position.set(0, 0, 0);
    shuttle.rotation.set(0, 0, 0);
  }
  
  // Clear all missiles
  missiles.forEach(m => scene.remove(m));
  missiles.length = 0;
  
  // Clear all asteroids
  asteroids.forEach(ast => scene.remove(ast));
  asteroids.length = 0;
  
  // Create new asteroids
  createAsteroids();
  
  // Reset aim line and crosshair
  aimLine.visible = false;
  crosshair.visible = false;
  
  // Reset missile cooldown
  missileCooldown = false;
  
  // Reset mouse moved flag
  mouseMoved = true;

  hidePauseMenu();
  
  // Force an initial aiming update
  setTimeout(() => {
    updateAiming();
  }, 100);
}


// === LIGHTING ===
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 7);
scene.add(light);
scene.add(new THREE.AmbientLight(0x404040));

// === STARS ===
const starsGeometry = new THREE.BufferGeometry();
const starsMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 });
const starsVertices = [];

for (let i = 0; i < 5000; i++) {
  starsVertices.push(
    (Math.random() - 0.5) * 5000,
    (Math.random() - 0.5) * 5000,
    (Math.random() - 0.5) * 5000
  );
}

starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));

const stars = new THREE.Points(starsGeometry, starsMaterial);

// Wrap in a container so we can move it relative to the shuttle
const starField = new THREE.Object3D();
starField.add(stars);
scene.add(starField);

// === EVENT LISTENERS ===
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') shootMissile();
  if (e.key === 'Escape' || e.key === 'p') togglePause();
});

document.addEventListener('click', (e) => {
  shootMissile();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === MAIN LOOP ===
const clock = new THREE.Clock();

let animationRunning = true;

function animate() {
  const deltaTime = clock.getDelta();
  if (animationRunning) {
    requestAnimationFrame(animate);
  }

  if(!gamePaused) {
    updateShuttle();
    updateAsteroids(deltaTime);
    updateMissiles(deltaTime);
  
    updateAiming();
    detectCollisions();
  }
  renderer.render(scene, camera);
  if(shuttle)
    updateDistanceProgress(shuttle.position.z*-1);
}

// === INITIALIZE GAME ===
loadGoal();
loadShuttle();
loadAsteroids();
animate();

// Add this near the beginning of your code, perhaps after the scene setup
function addStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }
    
    .pulse {
      animation: pulse 1.5s infinite;
    }
    
  `;
  document.head.appendChild(style);
}

// Call this function during initialization
addStyles();

// const maxDistance = 10000; // Adjust to match your level's total distance
let currentDistance = 0;

function updateDistanceProgress(distance) {
  const percent = (distance / 10000) * 100;
  document.getElementById('progress-bar').style.width = `${Math.min(percent, 100)}%`;
}


// === AUDIO SETUP ===
const listener = new THREE.AudioListener();
camera.add(listener);

const audioLoader = new THREE.AudioLoader();

// Global sounds
const backgroundMusic = new THREE.Audio(listener);
const shootSound = new THREE.Audio(listener);
const explosionSound = new THREE.Audio(listener);

// Load background music
audioLoader.load('assets/Sounds/spaceSound1.mp3', function(buffer) {
  backgroundMusic.setBuffer(buffer);
  backgroundMusic.setLoop(true);
  backgroundMusic.setVolume(0.3);
  backgroundMusic.play();
  console.log("Background music playing.");

  // fadeAudio(musicGainNode.gain, 0, 1, 2);
});


// Load shooting sound
audioLoader.load('assets/Sounds/shootMissile.mp3', function(buffer) {
  shootSound.setBuffer(buffer);
  shootSound.setVolume(1);
});

// Load explosion sound
audioLoader.load('assets/Sounds/asteroidExplosion.mp3', function(buffer) {
  explosionSound.setBuffer(buffer);
  explosionSound.setVolume(1);
});


// Mobile pause button functionality
document.addEventListener('DOMContentLoaded', () => {
  const pauseButton = document.querySelector('.pause-btn');
  if (pauseButton) {
      pauseButton.addEventListener('click', () => {
          togglePause();
          
          // Toggle the paused class for the button appearance
          pauseButton.classList.toggle('paused', gamePaused);
      });
  }
});