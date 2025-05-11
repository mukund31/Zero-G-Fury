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
  const scoreValue = document.querySelector('.score-value');
  if (scoreValue) {
      scoreValue.textContent = score;
      
      // Add animation class
      scoreValue.classList.add('score-change');
      
      // Remove animation class after animation completes
      setTimeout(() => {
          scoreValue.classList.remove('score-change');
      }, 300);
  }
  
  // Update distance display separately
  const distanceDisplay = document.getElementById('distance-display');
  if (distanceDisplay && shuttle && goal) {
      distanceDisplay.textContent = `Distance: ${Math.abs(shuttle.position.z - goal.position.z).toFixed(0)}`;
  }
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


// === UFO ENEMY SYSTEM ===
let ufos = [];
let ufoSpawnInterval = 7000; // Spawn a UFO every 7 seconds
let lastUfoSpawnTime = 0;
let ufoModel = null;
// const ufoProjectiles = [];
let ufoRadiationRate = 3000; // UFO fires every 3 seconds
const radiationRange = 50; // Range of radiation effect
let radiationDamage = 10; // Percentage of health damage

// Shuttle health system
let shuttleHealth = 100;
let shuttleMaxHealth = 100;
let shuttleInvulnerable = false;
const shuttleInvulnerabilityTime = 1000; // 1 second of invulnerability after being hit

// Crosshair marker
const crosshair = new THREE.Mesh(
  new THREE.SphereGeometry(0.1, 8, 8),
  new THREE.MeshBasicMaterial({ color: 0xffff00 })
);
scene.add(crosshair);

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


// === POWER-UP SYSTEM ===
const powerUps = [];
const powerUpTypes = {
  HEALTH: 'health',
  SHIELD: 'shield'
};

// Power-up settings
let powerUpSettings = {
  spawnRate: 15000, // milliseconds between spawn attempts
  lastSpawnTime: performance.now(), // Last time a power-up was spawned
  spawnChance: 0.9, // 70% chance to spawn when timer triggers
  maxPowerUps: 1, // Maximum number of power-ups active at once
  shieldDuration: 8000, // Shield lasts 10 seconds
  healthBoost: 25 // Health boost amount (percentage)
};

// Shield state
let shieldActive = false;
let shieldEndTime = 0;
let shieldMesh = null;

// GOAl
let goal;

// === INVENTORY SYSTEM ===
let inventory = {
  health: 0,
  shield: 0,
  maxItems: 3 // Maximum number of each item type
};

// UI elements for inventory
let inventoryDisplay = null;

// Add this to your GAME STATE section
let gamePaused = true;
let gameActive = false;
let gameInitialized = false;

const clock = new THREE.Clock();

let animationRunning = true;

// === SHUTTLE ===
let shuttle;
const shuttleSpeed = 2;

// === DIFFICULTY SETTINGS ===
const difficultySettings = {
  current: 'medium', // Default difficulty
  
  easy: {
    powerUpSpawnRate: 12000,
    powerUpSpawnChance: 0.8,
    shieldDuration: 8000,
    healthBoost: 25,
    maxInventoryCap: 3,
    ufoRadiationRate: 5000,
    ufoSpawnInterval: 7000
  },
  medium: {
    powerUpSpawnRate: 13000,
    powerUpSpawnChance: 0.7,
    shieldDuration: 6000,
    healthBoost: 20,
    maxInventoryCap: 2,
    ufoRadiationRate: 4000,
    ufoSpawnInterval: 6000
  },
  hard: {
    powerUpSpawnRate: 15000,
    powerUpSpawnChance: 0.6,
    shieldDuration: 5500,
    healthBoost: 20,
    maxInventoryCap: 1,
    ufoRadiationRate: 2500,
    ufoSpawnInterval: 4000
  }
};

initGame();

document.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  mouseMoved = true;
});

// Add pause functionality with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    shootMissile();
  } else if (e.key === 'h' || e.key === 'H') {
    useHealthBooster();
  } else if (e.key === 's' || e.key === 'S') {
    useShieldBooster();
  } else if (e.key === 'Escape' || e.key === 'P' || e.key === 'p') {
    // Toggle pause menu
    if (gamePaused && document.getElementById('pause-menu')) {
      // If game is paused and menu is showing, resume
      document.body.removeChild(document.getElementById('pause-menu'));
      gamePaused = false;
    } else if (!gamePaused) {
      // If game is running, pause and show menu
      showPauseMenu();
    }
  }
});

document.addEventListener('mousedown', (e) => {
  if (!isFiring && !gamePaused && gameActive) {
    isFiring = true;
    shootMissile(); // Fire immediately
    fireInterval = setInterval(shootMissile, 200); // Adjust interval as needed
  }
});

document.addEventListener('mouseup', () => {
  isFiring = false;
  clearInterval(fireInterval);
});

document.addEventListener('mouseleave', () => {
  isFiring = false;
  clearInterval(fireInterval);
});


// Mobile pause button functionality
document.addEventListener('DOMContentLoaded', () => {
  const pauseButton = document.querySelector('.pause-btn');
  if (pauseButton) {
      pauseButton.addEventListener('click', () => {
          togglePause();
          pauseButton.classList.toggle('paused', gamePaused);
          // Toggle the paused class for the button appearance
          
      });
  }
});

// Show the difficulty selection screen
function showDifficultyScreen() {
  const difficultyScreen = document.getElementById('difficulty-screen');
  if (!difficultyScreen) return;
  
  // Make sure the screen is visible
  difficultyScreen.style.display = 'flex';
  
  // Add event listeners to buttons
  document.getElementById('easy-btn').addEventListener('click', () => {
    selectDifficulty('easy');
    const pauseButton = document.querySelector('.pause-btn');
    pauseButton.classList.toggle('paused', gamePaused);
  });
  
  document.getElementById('medium-btn').addEventListener('click', () => {
    selectDifficulty('medium');
    const pauseButton = document.querySelector('.pause-btn');
    pauseButton.classList.toggle('paused', gamePaused);
  });
  
  document.getElementById('hard-btn').addEventListener('click', () => {
    selectDifficulty('hard');
    const pauseButton = document.querySelector('.pause-btn');
    pauseButton.classList.toggle('paused', gamePaused);
  });
  
  // Pause the game if it's running
  gamePaused = true;
}

// Select a difficulty and start the game
function selectDifficulty(difficulty) {
  // Hide the difficulty screen
  const difficultyScreen = document.getElementById('difficulty-screen');
  if (difficultyScreen) {
    difficultyScreen.style.display = 'none';
  }
  
  // Set the current difficulty
  difficultySettings.current = difficulty;
  
  // Apply difficulty settings
  applyDifficultySettings();
  
  // Start or resume the game
  gamePaused = false;
  
  // Show a message about the selected difficulty
  let message, color;
  switch(difficulty) {
    case 'easy':
      message = 'Easy Mode: Good luck!';
      color = '#88ff88';
      break;
    case 'medium':
      message = 'Medium Mode: Stay alert, pilot!';
      color = '#ffcc66';
      break;
    case 'hard':
      message = 'Hard Mode: Brace yourself—only legends survive!';
      color = '#ff6666';
      break;
  }
  
  showMessage(message, color, 3000);

  
  // Initialize game if it hasn't been initialized yet
  if (!gameInitialized) {
    initGame();
  }
  resetGame();
}

// Apply the current difficulty settings to the game
function applyDifficultySettings() {
  const settings = difficultySettings[difficultySettings.current];
  
  // Update power-up settings
  powerUpSettings.spawnRate = settings.powerUpSpawnRate;
  powerUpSettings.spawnChance = settings.powerUpSpawnChance;
  powerUpSettings.shieldDuration = settings.shieldDuration;
  powerUpSettings.healthBoost = settings.healthBoost;
  inventory.maxItems = settings.maxInventoryCap;
  ufoRadiationRate = settings.ufoRadiationRate;
  ufoSpawnInterval = settings.ufoSpawnInterval;
  

  // updateDifficultyIndicator();
  
}

// Add this to the end of your script to show the difficulty screen on load
window.addEventListener('load', () => {
  // Start by showing the difficulty selection screen
  showDifficultyScreen();
});

// Create a visual effect when using a health booster
function createHealthUseEffect() {
  if (!shuttle) return;
  
  // Create healing particles
  const particleCount = 30;
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  
  for (let i = 0; i < particleCount; i++) {
    vertices.push(
      (Math.random() - 0.5) * 5, // x
      (Math.random() - 0.5) * 5, // y
      (Math.random() - 0.5) * 5  // z
    );
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  const material = new THREE.PointsMaterial({
    color: 0xff5555,
    size: 0.5,
    transparent: true,
    opacity: 1
  });
  
  const particles = new THREE.Points(geometry, material);
  shuttle.add(particles);
  
  // Add a healing light
  const light = new THREE.PointLight(0xff5555, 5, 10);
  shuttle.add(light);
  
  // Animate particles
  const startTime = performance.now();
  const duration = 1000; // 1 second
  
  function animateHealEffect() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Scale particles outward
    particles.scale.set(1 + progress * 2, 1 + progress * 2, 1 + progress * 2);
    
    // Fade out
    particles.material.opacity = 1 - progress;
    
    // Fade out light
    light.intensity = 5 * (1 - progress);
    
    if (progress < 1) {
      requestAnimationFrame(animateHealEffect);
    } else {
      shuttle.remove(particles);
      shuttle.remove(light);
      geometry.dispose();
      material.dispose();
    }
  }
  
  requestAnimationFrame(animateHealEffect);
}


// Load power-up models
function loadPowerUpModels() {
  const loader = new THREE.GLTFLoader();
  
  // Load health power-up model
  loader.load('assets/Models/pumping_heart_model.glb', (gltf) => {
    const model = gltf.scene;
    model.scale.set(0.1, 0.1, 0.1); // Adjust scale as needed
    
    // Add glow effect
    const healthLight = new THREE.PointLight(0xff0000, 1, 10);
    model.add(healthLight);
    
    
    powerUpSettings.healthModel = model;
  }, undefined, (error) => {
    // Create fallback model
    powerUpSettings.healthModel = createFallbackHealthModel();
  });
  
  // Load shield power-up model
  loader.load('assets/Models/shield3.glb', (gltf) => {
    const model = gltf.scene;

    model.scale.set(1, 1, 1); // Adjust scale as needed
    // model.scale.set(0.07, 0.07, 0.07); // Adjust scale as needed
    // model.scale.set(0.01, 0.01, 0.01); // Adjust scale as needed
    
    // Add glow effect
    const shieldLight = new THREE.PointLight(0x00aaff, 1, 10);
    model.add(shieldLight);
  
    
    powerUpSettings.shieldModel = model;
  }, undefined, (error) => {
    // console.error("Error loading shield model:", error);
    // Create fallback model
    powerUpSettings.shieldModel = createFallbackShieldModel();
  });
}

// Create fallback models in case 3D models fail to load
function createFallbackHealthModel() {
  const group = new THREE.Group();
  
  // Red sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(2, 16, 16),
    new THREE.MeshPhongMaterial({
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.5
    })
  );
  group.add(sphere);
  
  // Red cross (vertical)
  const vertical = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 2, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  group.add(vertical);
  
  // Red cross (horizontal)
  const horizontal = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.5, 0.5),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );
  group.add(horizontal);
  
  return group;
}

function createFallbackShieldModel() {
  const group = new THREE.Group();
  
  // Blue sphere
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.5, 16, 16),
    new THREE.MeshPhongMaterial({
      color: 0x00aaff,
      emissive: 0x0088ff,
      emissiveIntensity: 0.5
    })
  );
  group.add(sphere);
  
  // Shield rings
  const ring1 = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.2, 16, 32),
    new THREE.MeshBasicMaterial({ color: 0x00aaff })
  );
  ring1.rotation.x = Math.PI / 2;
  group.add(ring1);
  
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(2, 0.2, 16, 32),
    new THREE.MeshBasicMaterial({ color: 0x00aaff })
  );
  ring2.rotation.y = Math.PI / 2;
  group.add(ring2);
  
  return group;
}

// Spawn a power-up
function spawnPowerUp(currentTime) {

  if (!shuttle) return;
  
  // Check if we should attempt to spawn
  if (currentTime - powerUpSettings.lastSpawnTime < powerUpSettings.spawnRate) return;
  powerUpSettings.lastSpawnTime = currentTime;
  
  // Check if we're at the maximum number of power-ups
  if (powerUps.length >= powerUpSettings.maxPowerUps) return;
  
  // Random chance to spawn
  if (Math.random() > powerUpSettings.spawnChance) return;
  
  // Choose a power-up type
  const type = Math.random() > 0.8 ? powerUpTypes.HEALTH : powerUpTypes.SHIELD;
  
  // Get the appropriate model
  let powerUpModel;
  if (type === powerUpTypes.HEALTH) {
    if (!powerUpSettings.healthModel) {
      // console.warn("Health model not loaded yet, skipping spawn");
      return;
    }
    powerUpModel = powerUpSettings.healthModel.clone();
    powerUpModel.userData = {
      type: type,
      rotationSpeed: 0.01 + Math.random() * 0.02,
      bobSpeed: 0.5 + Math.random() * 0.5,
      bobHeight: 0.2 + Math.random() * 0.3,
      originalY: powerUpModel.position.y,
      spawnTime: currentTime
    };
  } else {
    if (!powerUpSettings.shieldModel) {
      // console.warn("Shield model not loaded yet, skipping spawn");
      return;
    }
    powerUpModel = powerUpSettings.shieldModel.clone();
    powerUpModel.userData = {
      type: type,
      rotationSpeed: 0.01 + Math.random() * 0.02,
      bobSpeed: 0.5 + Math.random() * 0.5,
      bobHeight: 0.2 + Math.random() * 0.3,
      originalY: powerUpModel.position.y,
      spawnTime: currentTime
    };
  }
  
  // Position in front of the shuttle but off to the side
  const offsetX = (Math.random() - 0.5) * 100;
  const offsetY = (Math.random() - 0.5) * 100;
  const offsetZ = -500// Always ahead
  
  powerUpModel.position.copy(shuttle.position)
    .add(new THREE.Vector3(offsetX, offsetY, offsetZ));
  
  // Add metadata
  
  // Add target indicator rings
  addTargetIndicator(powerUpModel, type);
  
  // Add to scene and array
  scene.add(powerUpModel);
  powerUps.push(powerUpModel);
  
}

// Add target indicator to make it clear the power-up should be shot
function addTargetIndicator(powerUp, type) {
  const color = type === powerUpTypes.HEALTH ? 0xff0000 : 0x00aaff;
  
  // Create three rings at different orientations
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(3, 3.5, 32),
      new THREE.MeshBasicMaterial({
        color: color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7
      })
    );
    
    if (i === 0) ring.rotation.x = Math.PI / 2;
    else if (i === 1) ring.rotation.y = Math.PI / 2;
    
    powerUp.add(ring);
    
    // Store reference for animation
    if (!powerUp.userData.rings) powerUp.userData.rings = [];
    powerUp.userData.rings.push(ring);
  }
}


// Update power-ups (movement, animation, etc.)
function updatePowerUps(deltaTime, currentTime) {
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const powerUp = powerUps[i];
    
    // Rotate the power-up
    powerUp.rotation.y += powerUp.userData.rotationSpeed;
    
    // Bob up and down
    const bobOffset = Math.sin(currentTime * 0.001 * powerUp.userData.bobSpeed) * powerUp.userData.bobHeight;
    powerUp.position.y = powerUp.userData.originalY + bobOffset;
    
    // Animate target rings
    if (powerUp.userData.rings) {
      const ringScale = 1 + 0.2 * Math.sin(currentTime * 0.002);
      powerUp.userData.rings.forEach(ring => {
        ring.scale.set(ringScale, ringScale, ringScale);
      });
    }
    
    // Move power-up at the same speed as the shuttle moves forward
    // This makes it appear stationary in the world
    if (shuttle) {
      powerUp.position.z += shuttleSpeed * deltaTime;
    }
    
    // Remove if too far behind the shuttle
    if (shuttle && powerUp.position.z > shuttle.position.z + 50) {
      scene.remove(powerUp);
      powerUps.splice(i, 1);
    }
  }
}

// Create and initialize the inventory UI
function createInventoryUI() {
  // Create the main inventory container
  inventoryDisplay = document.createElement('div');
  inventoryDisplay.id = 'inventory-display';
  inventoryDisplay.style.position = 'absolute';
  inventoryDisplay.style.bottom = '20px';
  inventoryDisplay.style.right = '20px';
  inventoryDisplay.style.display = 'flex';
  inventoryDisplay.style.gap = '15px';
  inventoryDisplay.style.padding = '10px';
  // inventoryDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  inventoryDisplay.style.borderRadius = '10px';
  inventoryDisplay.style.zIndex = '1000';
  
  // Create health item
  const healthItem = createInventoryItem(
    'health-item',
    '❤️',
    '#ff5555',
    () => useHealthBooster()
  );
  inventoryDisplay.appendChild(healthItem);
  
  // Create shield item
  const shieldItem = createInventoryItem(
    'shield-item',
    '🛡️',
    '#55aaff',
    () => useShieldBooster()
  );
  inventoryDisplay.appendChild(shieldItem);
  
  // Add to document
  document.body.appendChild(inventoryDisplay);
  
  // Add keyboard hint
  const keyboardHint = document.createElement('div');
  keyboardHint.style.position = 'absolute';
  keyboardHint.style.bottom = '5px';
  keyboardHint.style.right = '20px';
  keyboardHint.style.fontSize = '12px';
  keyboardHint.style.color = 'rgba(255, 255, 255, 0.7)';
  inventoryDisplay.appendChild(keyboardHint);
  
  // Update the display
  updateInventoryDisplay();
}

// Create an individual inventory item UI
function createInventoryItem(id, icon, color, useFunction) {
  const itemContainer = document.createElement('div');
  itemContainer.id = id;
  itemContainer.className = 'inventory-item';
  itemContainer.style.position = 'relative';
  itemContainer.style.width = '50px';
  itemContainer.style.height = '50px';
  itemContainer.style.borderRadius = '10px';
  itemContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
  itemContainer.style.display = 'flex';
  itemContainer.style.justifyContent = 'center';
  itemContainer.style.alignItems = 'center';
  itemContainer.style.fontSize = '24px';
  itemContainer.style.cursor = 'pointer';
  itemContainer.style.transition = 'all 0.2s ease';
  itemContainer.style.boxShadow = `0 0 10px ${color}40`;
  
  // Icon
  const itemIcon = document.createElement('div');
  itemIcon.textContent = icon;
  itemContainer.appendChild(itemIcon);
  
  // Count bubble
  const countBubble = document.createElement('div');
  countBubble.className = 'item-count';
  countBubble.style.position = 'absolute';
  countBubble.style.top = '-10px';
  countBubble.style.right = '-10px';
  countBubble.style.width = '25px';
  countBubble.style.height = '25px';
  countBubble.style.borderRadius = '50%';
  countBubble.style.backgroundColor = color;
  countBubble.style.color = 'white';
  countBubble.style.display = 'flex';
  countBubble.style.justifyContent = 'center';
  countBubble.style.alignItems = 'center';
  countBubble.style.fontSize = '14px';
  countBubble.style.fontWeight = 'bold';
  countBubble.textContent = '0';
  itemContainer.appendChild(countBubble);
  
  // Add hover effect
  itemContainer.addEventListener('mouseenter', () => {
    itemContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
    itemContainer.style.transform = 'scale(1.1)';
  });
  
  itemContainer.addEventListener('mouseleave', () => {
    itemContainer.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
    itemContainer.style.transform = 'scale(1)';
  });
  
  // Add active effect
  itemContainer.addEventListener('mousedown', () => {
    itemContainer.style.transform = 'scale(0.95)';
  });
  
  itemContainer.addEventListener('mouseup', () => {
    itemContainer.style.transform = 'scale(1.1)';
  });
  
  // Add click handler
  itemContainer.addEventListener('click', useFunction);
  
  return itemContainer;
}

// Update the inventory display
function updateInventoryDisplay() {
  if (!inventoryDisplay) return;
  
  // Update health count
  const healthCount = inventoryDisplay.querySelector('#health-item .item-count');
  if (healthCount) {
    healthCount.textContent = inventory.health;
    
    // Show/hide count bubble based on inventory
    if (inventory.health <= 0) {
      healthCount.style.opacity = '0.3';
    } else {
      healthCount.style.opacity = '1';
    }
  }
  
  // Update shield count
  const shieldCount = inventoryDisplay.querySelector('#shield-item .item-count');
  if (shieldCount) {
    shieldCount.textContent = inventory.shield;
    
    // Show/hide count bubble based on inventory
    if (inventory.shield <= 0) {
      shieldCount.style.opacity = '0.3';
    } else {
      shieldCount.style.opacity = '1';
    }
  }
  
  // Update item availability visual feedback
  const healthItem = inventoryDisplay.querySelector('#health-item');
  if (healthItem) {
    if (inventory.health <= 0) {
      healthItem.style.opacity = '0.5';
    } else {
      healthItem.style.opacity = '1';
    }
  }
  
  const shieldItem = inventoryDisplay.querySelector('#shield-item');
  if (shieldItem) {
    if (inventory.shield <= 0) {
      shieldItem.style.opacity = '0.5';
    } else {
      shieldItem.style.opacity = '1';
    }
  }
}

// Add visual feedback when using items
function useHealthBooster() {
  // Check if we have any health boosters
  if (inventory.health <= 0) {
    showMessage('No Health Boosters Available!', '#ff5555');
    shakeInventoryItem('health-item');
    return;
  }
  
  // Check if health is already full
  if (shuttleHealth >= 100) {
    showMessage('Health Already Full!', '#ff5555');
    shakeInventoryItem('health-item');
    return;
  }
  
  // Use the health booster
  inventory.health--;
  
  // Apply health boost
  shuttleHealth = Math.min(shuttleHealth + powerUpSettings.healthBoost, 100);
  updateHealthDisplay();
  
  // Play sound and show message
  if (window.healthUseSound) healthUseSound.play();
  showMessage('Health Booster Used!', '#ff5555');
  
  // Create visual effect around the shuttle
  createHealthUseEffect();
  
  // Flash the inventory item
  flashInventoryItem('health-item', '#ff5555');
  
  // Update inventory display
  updateInventoryDisplay();
}

function useShieldBooster() {
  // Check if we have any shield boosters
  if (inventory.shield <= 0) {
    showMessage('No Shields Available!', '#55aaff');
    shakeInventoryItem('shield-item');
    return;
  }
  
  // Check if shield is already active
  if (shieldActive) {
    showMessage('Shield Already Active!', '#55aaff');
    shakeInventoryItem('shield-item');
    return;
  }
  
  // Use the shield booster
  inventory.shield--;
  
  // Activate shield
  activateShield();
  
  // Play sound and show message
  if (window.shieldUseSound) shieldUseSound.play();
  showMessage('Radiation Shield Activated!', '#55aaff');
  
  // Flash the inventory item
  flashInventoryItem('shield-item', '#55aaff');
  
  // Update inventory display
  updateInventoryDisplay();
}

// Add visual feedback when collecting items
function collectPowerUp(powerUp) {
  // Safety check
  if (!powerUp || !powerUp.userData) {
    console.error("Invalid power-up object passed to collectPowerUp");
    return;
  }
  
  const type = powerUp.userData.type;
  
  // Create collection effect
  createPowerUpCollectionEffect(powerUp.position.clone(), type);
  
  // Add to inventory based on type
  if (type === powerUpTypes.HEALTH) {
    // Only add if we're not at max capacity
    if (inventory.health < inventory.maxItems) {
      inventory.health++;
      if (window.healthPickupSound) healthPickupSound.play();
      showMessage('Health Booster Collected', '#ff5555');
      flashInventoryItem('health-item', '#ff5555');
    } else {
      showMessage('Health Inventory Full!', '#ff5555');
      shakeInventoryItem('health-item');
    }
  } else {
    // Only add if we're not at max capacity
    if (inventory.shield < inventory.maxItems) {
      inventory.shield++;
      if (window.shieldPickupSound) shieldPickupSound.play();
      showMessage('Shield Collected', '#55aaff');
      flashInventoryItem('shield-item', '#55aaff');
    } else {
      showMessage('Shield Inventory Full!', '#55aaff');
      shakeInventoryItem('shield-item');
    }
  }
  
  // Update the inventory display
  updateInventoryDisplay();
}

// Flash effect for inventory item when used/collected
function flashInventoryItem(itemId, color) {
  const item = document.getElementById(itemId);
  if (!item) return;
  
  // Create a flash overlay
  const flash = document.createElement('div');
  flash.style.position = 'absolute';
  flash.style.top = '0';
  flash.style.left = '0';
  flash.style.width = '100%';
  flash.style.height = '100%';
  flash.style.borderRadius = '10px';
  flash.style.backgroundColor = color;
  flash.style.opacity = '0.7';
  flash.style.pointerEvents = 'none';
  
  item.appendChild(flash);
  
  // Animate the flash
  let opacity = 0.7;
  const fadeInterval = setInterval(() => {
    opacity -= 0.1;
    flash.style.opacity = opacity.toString();
    
    if (opacity <= 0) {
      clearInterval(fadeInterval);
      item.removeChild(flash);
    }
  }, 50);
}

// Shake effect for inventory item when action fails
function shakeInventoryItem(itemId) {
  const item = document.getElementById(itemId);
  if (!item) return;
  
  // Add shake animation
  item.style.animation = 'shake 0.5s';
  
  // Remove animation after it completes
  setTimeout(() => {
    item.style.animation = '';
  }, 500);
  
  // Add CSS for shake animation if it doesn't exist
  if (!document.getElementById('shake-animation')) {
    const style = document.createElement('style');
    style.id = 'shake-animation';
    style.textContent = `
      @keyframes shake {
        0% { transform: translateX(0); }
        10% { transform: translateX(-5px); }
        20% { transform: translateX(5px); }
        30% { transform: translateX(-5px); }
        40% { transform: translateX(5px); }
        50% { transform: translateX(-5px); }
        60% { transform: translateX(5px); }
        70% { transform: translateX(-5px); }
        80% { transform: translateX(5px); }
        90% { transform: translateX(-5px); }
        100% { transform: translateX(0); }
      }
    `;
    document.head.appendChild(style);
  }
}


// Create visual effect when collecting a power-up
function createPowerUpCollectionEffect(position, type) {
  // Set color based on power-up type
  const color = type === powerUpTypes.HEALTH ? 0xff5555 : 0x55aaff;
  
  // Create particles
  const particleCount = 30;
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  
  for (let i = 0; i < particleCount; i++) {
    vertices.push(
      (Math.random() - 0.5) * 2, // x
      (Math.random() - 0.5) * 2, // y
      (Math.random() - 0.5) * 2  // z
    );
  }
  
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  const material = new THREE.PointsMaterial({
    color: color,
    size: 0.5,
    transparent: true,
    opacity: 1
  });
  
  const particles = new THREE.Points(geometry, material);
  particles.position.copy(position);
  scene.add(particles);
  
  // Add a flash light
  const flash = new THREE.PointLight(color, 5, 30);
  flash.position.copy(position);
  scene.add(flash);
  
  // Animate particles outward
  const startTime = performance.now();
  const duration = 1000; // 1 second
  
  function animateParticles() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Scale particles outward
    particles.scale.set(1 + progress * 8, 1 + progress * 8, 1 + progress * 8);
    
    // Fade out
    particles.material.opacity = 1 - progress;
    
    // Fade out the light
    if (progress > 0.3) {
      flash.intensity = 5 * (1 - (progress - 0.3) / 0.7);
    }
    
    if (progress < 1) {
      requestAnimationFrame(animateParticles);
    } else {
      scene.remove(particles);
      scene.remove(flash);
      geometry.dispose();
      material.dispose();
    }
  }
  
  requestAnimationFrame(animateParticles);
}


// Activate the shield
function activateShield() {
  shieldActive = true;
  shieldEndTime = performance.now() + powerUpSettings.shieldDuration;
  
  // Create shield mesh if it doesn't exist
  if (!shieldMesh) {
    const geometry = new THREE.SphereGeometry(4, 25, 25);
    const material = new THREE.MeshPhongMaterial({
      color: 0x00aaff,
      transparent: true,
      opacity: 0.1,
      emissive: 0x0088ff,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide
    });
    
    shieldMesh = new THREE.Mesh(geometry, material);
    shuttle.add(shieldMesh);
  }
  
  // Make shield visible
  shieldMesh.visible = true;
  
  // Update health display to show shield status
  updateHealthDisplay();
}


// Update shield status
function updateShield(currentTime) {
  if (!shieldActive) return;
  
  // Check if shield has expired
  if (currentTime > shieldEndTime) {
    shieldActive = false;
    
    // Hide shield mesh
    if (shieldMesh) {
      shieldMesh.visible = false;
    }
    
    // Update health display to remove shield indicator
    updateHealthDisplay();
    
    // Show message
    showMessage('Shield Deactivated', '#ffffff');
    return;
  }
  
  // Animate shield
  if (shieldMesh) {
    // Pulse effect
    const pulseIntensity = 0.3 + 0.2 * Math.sin(currentTime * 0.003);
    shieldMesh.material.emissiveIntensity = pulseIntensity;
    
    // Rotation effect
    shieldMesh.rotation.y += 0.01;
    shieldMesh.rotation.z += 0.005;
  }
  
  // Show countdown if shield is about to expire (last 3 seconds)
  const timeLeft = Math.ceil((shieldEndTime - currentTime) / 1000);
  if (timeLeft <= 3 && timeLeft > 0 && Math.floor(currentTime / 1000) !== Math.floor((currentTime - 16) / 1000)) {
    showMessage(`Shield: ${timeLeft}s`, '#00aaff');
  }
}



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
  const missile1 = createMissile();
  const missile2 = createMissile();
  const missile3 = createMissile();
  const missile4 = createMissile();

  missile.position.copy(shuttle.position);
  missile1.position.copy(shuttle.position);
  missile2.position.copy(shuttle.position);
  missile3.position.copy(shuttle.position);
  missile4.position.copy(shuttle.position);
  
  // Calculate direction toward aim point
  const direction = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, 0, 0)).normalize();
  const direction1 = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, 0, -40)).normalize();
  const direction2 = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, 0, 40)).normalize();
  const direction3 = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, -20, 0)).normalize();
  const direction4 = aimPoint.clone().sub(shuttle.position).add(new THREE.Vector3(0, 20, 0)).normalize();
  
  // Set missile orientation
  const targetQuaternion = new THREE.Quaternion();
  targetQuaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 10), direction);
  missile.quaternion.copy(targetQuaternion);
  missile1.quaternion.copy(targetQuaternion);
  missile2.quaternion.copy(targetQuaternion);
  missile3.quaternion.copy(targetQuaternion);
  missile4.quaternion.copy(targetQuaternion);
  
  // Move missile slightly ahead of shuttle to avoid collision
  missile.position.add(direction.clone().multiplyScalar(3));
  missile1.position.add(direction1.clone().multiplyScalar(3));
  missile2.position.add(direction2.clone().multiplyScalar(3));
  missile3.position.add(direction3.clone().multiplyScalar(3));
  missile4.position.add(direction4.clone().multiplyScalar(3));
  
  // Set a fixed, larger velocity value for debugging
  const speed = 500; // Increased speed for visibility
  
  missile.userData = {
    velocity: direction.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile.position.clone() // Store initial position for debugging
  };
  missile1.userData = {
    velocity: direction1.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile1.position.clone() // Store initial position for debugging
  };
  missile2.userData = {
    velocity: direction2.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile2.position.clone() // Store initial position for debugging
  };
  missile3.userData = {
    velocity: direction3.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile3.position.clone() // Store initial position for debugging
  };
  missile4.userData = {
    velocity: direction4.clone().multiplyScalar(speed),
    lifetime: 0,
    initialPosition: missile4.position.clone() // Store initial position for debugging
  };

  scene.add(missile);
  scene.add(missile1);
  scene.add(missile2);
  scene.add(missile3);
  scene.add(missile4);

  missiles.push(missile);
  missiles.push(missile1);
  missiles.push(missile2);
  missiles.push(missile3);
  missiles.push(missile4);

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
  if (!shuttle || !gameActive) return;

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
  const powerUpsToCollect = [];
  let scoreChanged = false;

  // Check all missile-asteroid collisions using center-to-center distance
  for (let m = 0; m < missiles.length; m++) {
    const missile = missiles[m];
    
    // Skip if this missile is already marked for removal
    if (missilesToRemove.includes(m)) continue;

    // Check missile-powerup collisions FIRST
    for (let p = 0; p < powerUps.length; p++) {
      const powerUp = powerUps[p];
      
      // Use a generous collision radius for power-ups
      const collisionRadius = 5; // Adjust as needed
      const distance = missile.position.distanceTo(powerUp.position);
      
      if (distance < collisionRadius) {
        // Mark missile for removal and power-up for collection
        missilesToRemove.push(m);
        // powerUpsToCollect.push(p);
        collectPowerUp(powerUp);
        scene.remove(powerUp);
        powerUps.splice(p, 1);  
        
        // Break inner loop - one missile hits one power-up
        break;
      }
    }
    
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

        if (asteroidExplosionSound.isPlaying) asteroidExplosionSound.stop();
        asteroidExplosionSound.play();
        
        // Increment score
        score++;
        scoreChanged = true;
        
        // Create explosion effect at asteroid position
        createExplosion(asteroid.position.clone());
        
        // Break inner loop - one missile hits one asteroid
        break;
      }
    }

    // Check missile-UFO collisions
    for (let j = ufos.length - 1; j >= 0; j--) {
      const ufo = ufos[j];
      
      if (missile.position.distanceTo(ufo.position) < 5) {
        // Damage UFO
        ufo.userData.health -= 10;
        
        // Remove missile
        scene.remove(missile);
        missiles.splice(m, 1);
        
        if (ufoExplosionSound.isPlaying) ufoExplosionSound.stop();
        ufoExplosionSound.play();

        // Create explosion effect
        createExplosion(missile.position.clone(), 0xffaa00, 3);
        
        // If UFO is destroyed
        if (ufo.userData.health <= 0) {
          // Create larger explosion
          createExplosion(ufo.position.clone(), 0x00ff00, 10);
          
          // Remove UFO
          scene.remove(ufo);
          ufos.splice(j, 1);
          
          // Increase score
          score += 5; // UFOs are worth more points
          updateScoreDisplay();
        }
        break; // Break inner loop after collision
      }
    }
  }

  
  // Process power-ups that were hit (in reverse order to maintain correct indices)
  for (let i = powerUpsToCollect.length - 1; i >= 0; i--) {

    const index = powerUpsToCollect[i];
    const powerUp = powerUps[index];
    // Apply power-up effect
    collectPowerUp(powerUp);
    
    // Remove from scene and array
    scene.remove(powerUp);
    powerUps.splice(index, 1);
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

// Modify the gameOver function to show a restart button
function gameOver(success) {
  gamePaused = true;
  
  // Create game over screen
  const gameOverScreen = document.createElement('div');
  gameOverScreen.className = 'game-screen';
  gameOverScreen.id = 'game-over-screen';
  
  const content = document.createElement('div');
  content.className = 'screen-content';
  
  // Set message based on success/failure
  const title = document.createElement('h1');
  title.textContent = success ? 'Mission Complete!' : 'Mission Failed';
  title.style.color = success ? '#88ff88' : '#ff6666';
  
  const scoreText = document.createElement('h2');
  scoreText.textContent = `Score: ${score}`;
  
  // Create buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.flexDirection = 'column';
  buttonContainer.style.gap = '15px';
  buttonContainer.style.marginTop = '30px';
  
  // Restart button (same difficulty)
  const restartButton = document.createElement('button');
  restartButton.className = 'restart-btn';
  restartButton.innerHTML = '<span class="difficulty-name">Restart</span><span class="difficulty-desc">Same difficulty</span>';
  restartButton.addEventListener('click', () => {
    document.body.removeChild(gameOverScreen);
    resetGame();
  });
  
  // Change difficulty button
  const changeDifficultyButton = document.createElement('button');
  changeDifficultyButton.className = 'change-diff-btn';
  changeDifficultyButton.innerHTML = '<span class="difficulty-name">Change Difficulty</span><span class="difficulty-desc">Select a new difficulty level</span>';
  changeDifficultyButton.addEventListener('click', () => {
    document.body.removeChild(gameOverScreen);
    showDifficultyScreen();
  });
  
  // Add elements to the screen
  buttonContainer.appendChild(restartButton);
  buttonContainer.appendChild(changeDifficultyButton);
  
  content.appendChild(title);
  content.appendChild(scoreText);
  content.appendChild(buttonContainer);
  
  gameOverScreen.appendChild(content);
  document.body.appendChild(gameOverScreen);
}


// Add these functions for pause functionality
function togglePause() {
  if (!gameActive) return; // Don't pause if game is over
  
  const pauseButton = document.querySelector('.pause-btn');
  pauseButton.classList.toggle('paused', gamePaused);
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

// Add a pause menu
function showPauseMenu() {
  if (document.getElementById('pause-menu')) return;
  
  gamePaused = true;

  // Pause all looping sounds
  if (audioSystem.playing['heartbeat']) {
    audioSystem.fadeOut('heartbeat', 300);
  }
  
  // Create pause menu
  const pauseMenu = document.createElement('div');
  pauseMenu.className = 'game-screen';
  pauseMenu.id = 'pause-menu';
  
  const content = document.createElement('div');
  content.className = 'screen-content';
  
  // Title
  const title = document.createElement('h1');
  title.textContent = 'Game Paused';
  
  // Create buttons
  const buttonContainer = document.createElement('div');
  buttonContainer.style.display = 'flex';
  buttonContainer.style.flexDirection = 'column';
  buttonContainer.style.gap = '15px';
  buttonContainer.style.marginTop = '30px';
  
  // Resume button
  const resumeButton = document.createElement('button');
  resumeButton.className = 'pause-resume-btn';
  resumeButton.innerHTML = '<span class="difficulty-name">Resume Game</span>';
  resumeButton.addEventListener('click', () => {
    document.body.removeChild(pauseMenu);
    gamePaused = false;
    const pauseButton = document.querySelector('.pause-btn');
    pauseButton.classList.toggle('paused', gamePaused);
  });
  
  // Change difficulty button
  const changeDifficultyButton = document.createElement('button');
  changeDifficultyButton.className = 'pause-diff-btn';
  changeDifficultyButton.innerHTML = '<span class="difficulty-name">Change Difficulty</span>';
  changeDifficultyButton.addEventListener('click', () => {
    document.body.removeChild(pauseMenu);
    showDifficultyScreen();
  });
  
  // Restart button
  const restartButton = document.createElement('button');
  restartButton.className = 'pause-restart-btn';
  restartButton.innerHTML = '<span class="difficulty-name">Restart Game</span>';
  restartButton.addEventListener('click', () => {
    document.body.removeChild(pauseMenu);
    resetGame();
    const pauseButton = document.querySelector('.pause-btn');
    pauseButton.classList.toggle('paused', gamePaused);
  });
  
  // Add elements to the screen
  buttonContainer.appendChild(resumeButton);
  buttonContainer.appendChild(changeDifficultyButton);
  buttonContainer.appendChild(restartButton);
  
  content.appendChild(title);
  content.appendChild(buttonContainer);
  
  pauseMenu.appendChild(content);
  document.body.appendChild(pauseMenu);
}




// Create a difficulty indicator for the HUD
function createDifficultyIndicator() {
  const difficultyIndicator = document.createElement('div');
  difficultyIndicator.id = 'difficulty-indicator';
  difficultyIndicator.style.position = 'absolute';
  difficultyIndicator.style.top = '20px';
  difficultyIndicator.style.left = '20px';
  difficultyIndicator.style.padding = '5px 10px';
  difficultyIndicator.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
  difficultyIndicator.style.color = 'white';
  difficultyIndicator.style.borderRadius = '5px';
  difficultyIndicator.style.fontSize = '14px';
  difficultyIndicator.style.fontFamily = 'Arial, sans-serif';
  
  // updateDifficultyIndicator();
  
  document.body.appendChild(difficultyIndicator);
}

// Update the difficulty indicator text and color
// function updateDifficultyIndicator() {
//   const indicator = document.getElementById('difficulty-indicator');
//   if (!indicator) return;
  
//   let color, text;
//   switch(difficultySettings.current) {
//     case 'easy':
//       color = '#88ff88';
//       text = 'EASY';
//       break;
//     case 'medium':
//       color = '#ffcc66';
//       text = 'MEDIUM';
//       break;
//     case 'hard':
//       color = '#ff6666';
//       text = 'HARD';
//       break;
//   }
  
//   indicator.textContent = `Difficulty: ${text}`;
//   indicator.style.borderLeft = `4px solid ${color}`;
// }




function resetGame() {
  // Reset score
  score = 0;
  shuttleHealth = 100;
  shieldActive = false;
  shieldEndTime = 0;
  if (shieldMesh) {
    shieldMesh.visible = false;
  }

  gameActive = true;
  gamePaused = false;
  updateScoreDisplay();
  updateHealthDisplay();

  inventory.health = 0;
  inventory.shield = 0;
  updateInventoryDisplay();
  
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

  // Clear all UFOs
  ufos.forEach(u => scene.remove(u));
  ufos.length = 0;

  // Reset power-ups
  powerUps.forEach(p => scene.remove(p));
  powerUps.length=0;
  
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





// document.addEventListener('', (e) => {
//   shootMissile();
// });

let isFiring = false;
let fireInterval;


window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === MAIN LOOP ===


function animate() {
  const deltaTime = clock.getDelta();
  const currentTime = performance.now();

  if (animationRunning) {
    requestAnimationFrame(animate);
  }

  if(!gamePaused) {
    updateShuttle();
    updateAsteroids(deltaTime);
    updateMissiles(deltaTime);

    updatePowerUps(deltaTime, currentTime); // Update power-ups
    
    updateShield(currentTime); // Update shield
    spawnPowerUp(currentTime);

    updateHeartbeatSound();
  
    updateAiming();

    updateUfos(deltaTime, currentTime); // Add this line
    // updateUfoProjectiles(deltaTime); // Add this line too

    // Reset power-up spawn timer

    detectCollisions();
  }
  renderer.render(scene, camera);
  if(shuttle)
    updateDistanceProgress(shuttle.position.z*-1);
}

// === INITIALIZE GAME ===
function initGame() {
  loadAsteroids();
  loadGoal();
  loadShuttle();
  loadUfoModel();
  loadPowerUpModels();
  createHealthDisplay();
  createInventoryUI();
  createDifficultyIndicator();
  addStyles();
  
  gameInitialized = true;
  animate();
}


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
const shootSound = new THREE.Audio(listener);
const asteroidExplosionSound = new THREE.Audio(listener);
const ufoExplosionSound = new THREE.Audio(listener);
const healthDamageSound = new THREE.Audio(listener);
const heartBeatSound = new THREE.Audio(listener);

// Load background music
// audioLoader.load('assets/Sounds/spaceSound1.mp3', function(buffer) {
//   backgroundMusic.setBuffer(buffer);
//   backgroundMusic.setLoop(true);
//   backgroundMusic.setVolume(0.3);
//   backgroundMusic.play();

//   // fadeAudio(musicGainNode.gain, 0, 1, 2);
// });


// Load shooting sound
audioLoader.load('assets/Sounds/shootMissile.mp3', function(buffer) {
  shootSound.setBuffer(buffer);
  shootSound.setVolume(0.05);
});

// Load asteroid explosion sound
audioLoader.load('assets/Sounds/asteroidExplosion.mp3', function(buffer) {
  asteroidExplosionSound.setBuffer(buffer);
  asteroidExplosionSound.setVolume(0.1);
});

// Load UFO explosion sound
audioLoader.load('assets/Sounds/ufoExplosion.mp3', function(buffer) {
  ufoExplosionSound.setBuffer(buffer);
  ufoExplosionSound.setVolume(0.5);
});

// Load health damage sound
audioLoader.load('assets/Sounds/healthDamageSound.mp3', function(buffer) {
  healthDamageSound.setBuffer(buffer);
  healthDamageSound.setVolume(0.3);
});

// Load Heart Beat sound
audioLoader.load('assets/Sounds/heartbeatSound.mp3', function(buffer) {
  heartBeatSound.setBuffer(buffer);
  heartBeatSound.setVolume(0.3);
});


// Load UFO model
function loadUfoModel() {
  const loader = new THREE.GLTFLoader();
  loader.load('assets/Models/ufo1.glb', 
    // Success callback
    (gltf) => {
      ufoModel = gltf.scene;
      ufoModel.scale.set(5,5,5); // Adjust scale as needed
    },
    // Progress callback
    undefined,
    // Error callback
    (error) => {
      // console.error('Error loading UFO model:', error);
    }
  );
}

function spawnUfo() {
  if (!ufoModel || !shuttle) return;
  
  // Clone the UFO model
  const ufo = ufoModel.clone();
  
  // Calculate a position relative to the shuttle's forward direction
  const shuttleForward = new THREE.Vector3(0, 0, -1).applyQuaternion(shuttle.quaternion);
  
  // Random offset from shuttle, but always in front of the player's view
  const offsetX = (Math.random() - 0.5) * 50; // Left/right offset
  const offsetY = (Math.random() - 0.5) * 50; // Up/down offset, slightly above eye level
  const offsetZ = -100 - Math.random() * 100; // Always ahead of shuttle
  
  // Position relative to shuttle
  ufo.position.copy(shuttle.position)
     .add(new THREE.Vector3(offsetX, offsetY, offsetZ));

  const currentTime = performance.now();
  
  // Store the relative position offset for maintaining position
  ufo.userData = {
    health: 10,
    lastRadiationTime: currentTime - 1500, // Changed from lastFireTime
    // Store relative offsets to maintain position
    relativeOffset: new THREE.Vector3(offsetX, offsetY, offsetZ),
    // Add some small random movement to make it less static
    wobble: {
      x: Math.random() * 0.2 - 0.1,
      y: Math.random() * 0.2 - 0.1,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random()
    }
  };
  
  // Apply green glow material to UFO parts
  ufo.traverse(child => {
    if (child.isMesh) {
      // Clone the material to avoid affecting other instances
      if (Array.isArray(child.material)) {
        child.material = child.material.map(m => m.clone());
      } else {
        child.material = child.material.clone();
      }
      
    }
  });
  
  scene.add(ufo);
  ufos.push(ufo);
  
  // Add a spotlight under the UFO for dramatic effect
  const ufoLight = new THREE.SpotLight(0x00ff00, 1, 100, Math.PI / 6, 0.5, 1);
  ufoLight.position.set(0, -2, 0);
  ufoLight.target.position.set(0, -10, 0);
  ufo.add(ufoLight);
  ufo.add(ufoLight.target);
}

// Create radiation emission effect
function emitRadiation(ufo) {
  if (!shuttle) return;
  
  // Create radiation visual effect
  createRadiationWave(ufo.position.clone(), 0, radiationRange);
  
  // Check if shuttle is within radiation range
  const distanceToShuttle = ufo.position.distanceTo(shuttle.position);
}

// Create expanding radiation wave effect that damages the shuttle when it hits
function createRadiationWave(position, currentRadius, maxRadius) {
  // Create ring geometry for the radiation wave
  const ringGeometry = new THREE.RingGeometry(
    currentRadius, 
    currentRadius + 0.5, 
    32
  );
  
  // Rotate to face camera
  ringGeometry.rotateX(-Math.PI / 2);
  
  // Create material with glow effect
  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide
  });
  
  // Create mesh
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.position.copy(position);
  
  // Add to scene
  scene.add(ring);
  
  // Track whether this wave has already damaged the shuttle
  let hasDamagedShuttle = false;
  
  // Animate the radiation wave
  const expandSpeed = 40; // Units per second
  let lastTime = performance.now();
  
  function animateWave() {
    const now = performance.now();
    const deltaTime = (now - lastTime) / 1000; // Convert to seconds
    lastTime = now;
    
    // Expand the ring
    currentRadius += expandSpeed * deltaTime;
    
    // Update ring geometry
    scene.remove(ring);
    ring.geometry.dispose();
    
    // Create new geometry with updated radius
    ring.geometry = new THREE.RingGeometry(
      currentRadius, 
      currentRadius + 0.5 + (currentRadius / maxRadius) * 2, // Thicker as it expands
      32
    );
    ring.geometry.rotateX(-Math.PI / 2);
    
    // Fade out as it expands
    ring.material.opacity = 0.7 * (1 - currentRadius / maxRadius);
    
    // Add back to scene
    scene.add(ring);
    
    // Check if the radiation wave has reached the shuttle
    if (shuttle && !shieldActive && !hasDamagedShuttle) {
      const distanceToShuttle = position.distanceTo(shuttle.position);
      
      // If the radiation wave's current radius has reached the shuttle
      if (Math.abs(distanceToShuttle - currentRadius) < 5) { // 5 unit tolerance for collision
        // Calculate damage based on proximity to the source
        const distanceFactor = 1 - (distanceToShuttle / maxRadius);
        const damage = Math.max(5, 10 * distanceFactor); // Minimum 5 damage, maximum 10
        
        // Apply damage to shuttle
        // shuttleHealth -= damage;
        shuttleHealth = Math.max(shuttleHealth-damage, 0);
        if (healthDamageSound.isPlaying) healthDamageSound.stop();
        healthDamageSound.play();
        
        // Make shuttle invulnerable briefly
        shuttleInvulnerable = true;
        
        // Visual feedback for radiation damage
        shuttle.traverse(child => {
          if (child.isMesh) {
            child.userData.originalMaterial = child.material;
            child.material = new THREE.MeshBasicMaterial({
              color: 0x00ff00, // Green for radiation
              transparent: true,
              opacity: 0.7
            });
          }
        });
        
        // Create a flash effect
        const flash = new THREE.PointLight(0x00ff00, 5, 50);
        flash.position.copy(shuttle.position);
        scene.add(flash);
        
        // Remove flash after a short time
        setTimeout(() => {
          scene.remove(flash);
        }, 200);
        
        // Reset invulnerability after delay
        setTimeout(() => {
          shuttleInvulnerable = false;
          shuttle.traverse(child => {
            if (child.isMesh && child.userData.originalMaterial) {
              child.material = child.userData.originalMaterial;
            }
          });
        }, shuttleInvulnerabilityTime);
        
        // Check if shuttle is destroyed
        if (shuttleHealth <= 0) {
          gameOver(false);
        }
        
        // Update health display
        updateHealthDisplay();
        
        // Mark as damaged so we don't apply damage multiple times
        hasDamagedShuttle = true;
      }
    }
    
    // Continue animation until max radius
    if (currentRadius < maxRadius) {
      requestAnimationFrame(animateWave);
    } else {
      // Remove the ring when animation is complete
      scene.remove(ring);
      ring.geometry.dispose();
      ring.material.dispose();
    }
  }
  
  // Start animation
  animateWave();
  
  // Add a point light that fades with the radiation
  const radiationLight = new THREE.PointLight(0x00ff00, 2, maxRadius);
  radiationLight.position.copy(position);
  scene.add(radiationLight);
  
  // Animate the light
  const lightDuration = maxRadius / expandSpeed; // Time to reach max radius
  const startIntensity = radiationLight.intensity;
  const startTime = performance.now();
  
  function animateLight() {
    const elapsed = (performance.now() - startTime) / 1000; // seconds
    const progress = Math.min(elapsed / lightDuration, 1);
    
    radiationLight.intensity = startIntensity * (1 - progress);
    
    if (progress < 1) {
      requestAnimationFrame(animateLight);
    } else {
      scene.remove(radiationLight);
    }
  }
  
  requestAnimationFrame(animateLight);
}


// Update UFOs
function updateUfos(deltaTime, currentTime) {
  // Spawn new UFOs at interval
  if (currentTime - lastUfoSpawnTime > ufoSpawnInterval) {
    spawnUfo();
    lastUfoSpawnTime = currentTime;
  }
  
  // Update existing UFOs
  for (let i = ufos.length - 1; i >= 0; i--) {
    const ufo = ufos[i];
    
    if (shuttle) {
      // Calculate the target position based on shuttle's current position and the stored offset
      const targetPosition = shuttle.position.clone().add(ufo.userData.relativeOffset);
      
      // Add some wobble movement to make it less static
      const wobble = ufo.userData.wobble;
      const time = currentTime * 0.001; // Convert to seconds
      
      targetPosition.x += Math.sin(time * wobble.speed + wobble.phase) * wobble.x * 10;
      targetPosition.y += Math.cos(time * wobble.speed + wobble.phase) * wobble.y * 10;
      
      // Smoothly interpolate current position toward target position (easing)
      ufo.position.lerp(targetPosition, deltaTime * 2);
      
      // Make UFO rotate slowly for visual interest
      ufo.rotateY(deltaTime * 0.5);
      
      // Radiation emission logic
      if (currentTime - ufo.userData.lastRadiationTime > ufoRadiationRate) {
        emitRadiation(ufo);
        ufo.userData.lastRadiationTime = currentTime;
        
        // Pulse the UFO when emitting radiation
        pulseUfo(ufo);
      }
      
    }
    
    // Remove UFOs if their health is depleted
    if (ufo.userData.health <= 0) {
      // Create large radiation burst on destruction
      createRadiationWave(ufo.position.clone(), 0, radiationRange * 1.5);
      
      // Create explosion effect
      createExplosion(ufo.position.clone(), 0x00ff00, 10);
      
      // Remove UFO
      if (ufo.userData.radiationGlow) {
        scene.remove(ufo.userData.radiationGlow);
      }
      scene.remove(ufo);
      ufos.splice(i, 1);
      
      // Increase score
      score += 5;
      updateScoreDisplay();
    }
  }
}

function pulseUfo(ufo) {
  // Store original scale
  const originalScale = ufo.scale.clone();
  const maxScale = originalScale.clone().multiplyScalar(1.2);
  const pulseDuration = 0.3; // seconds
  const returnDuration = 0.5; // seconds
  let startTime = performance.now();
  let expanding = true;
  
  function animatePulse() {
    const now = performance.now();
    const elapsed = (now - startTime) / 1000; // seconds
    
    if (expanding) {
      // Expanding phase
      const progress = Math.min(elapsed / pulseDuration, 1);
      // Power2 ease out
      const easedProgress = 1 - Math.pow(1 - progress, 2);
      
      ufo.scale.set(
        originalScale.x + (maxScale.x - originalScale.x) * easedProgress,
        originalScale.y + (maxScale.y - originalScale.y) * easedProgress,
        originalScale.z + (maxScale.z - originalScale.z) * easedProgress
      );
      
      if (progress >= 1) {
        expanding = false;
        startTime = now;
      }
      
      requestAnimationFrame(animatePulse);
    } else {
      // Contracting phase
      const progress = Math.min(elapsed / returnDuration, 1);
      // Elastic ease out approximation
      const easedProgress = progress === 1 ? 1 : 
        1 - Math.pow(2, -10 * progress) * Math.sin((progress * 10 - 0.75) * (2 * Math.PI) / 3);
      
      ufo.scale.set(
        maxScale.x + (originalScale.x - maxScale.x) * easedProgress,
        maxScale.y + (originalScale.y - maxScale.y) * easedProgress,
        maxScale.z + (originalScale.z - maxScale.z) * easedProgress
      );
      
      if (progress < 1) {
        requestAnimationFrame(animatePulse);
      }
    }
  }
  
  requestAnimationFrame(animatePulse);
}


// Create health display
function createHealthDisplay() {
  const healthContainer = document.createElement('div');
  healthContainer.id = 'health-container';
  healthContainer.innerHTML = `
    <div class="health-label">HEALTH</div>
    <div class="health-bar">
      <div class="health-fill"></div>
    </div>
    <div class="health-value">100%</div>
  `;
  document.body.appendChild(healthContainer);
  updateHealthDisplay();
}

// Update health display
function updateHealthDisplay() {
  const healthFill = document.querySelector('.health-fill');
  const healthValue = document.querySelector('.health-value');
  
  if (healthFill && healthValue) {
    const healthPercent = (shuttleHealth / shuttleMaxHealth) * 100;
    healthFill.style.width = `${healthPercent}%`;
    healthValue.textContent = `${Math.round(healthPercent)}%`;
    
    // Change color based on health
    if (healthPercent > 60) {
      healthFill.style.backgroundColor = '#4caf50'; // Green
    } else if (healthPercent > 30) {
      healthFill.style.backgroundColor = '#ff9800'; // Orange
    } else {
      healthFill.style.backgroundColor = '#f44336'; // Red
    }
  }
}


// Show a temporary message on screen
function showMessage(text, color = '#ffffff', duration = 1500) {
  // Create message element if it doesn't exist
  let messageElement = document.getElementById('game-message');
  if (!messageElement) {
    messageElement = document.createElement('div');
    messageElement.id = 'game-message';
    messageElement.style.position = 'absolute';
    messageElement.style.top = '20%';
    messageElement.style.left = '50%';
    messageElement.style.transform = 'translate(-50%, -50%)';
    messageElement.style.fontSize = '24px';
    messageElement.style.fontWeight = 'bold';
    messageElement.style.textAlign = 'center';
    messageElement.style.textShadow = '0 0 5px #000';
    messageElement.style.zIndex = '1000';
    messageElement.style.opacity = '0';
    messageElement.style.transition = 'opacity 0.3s';
    document.body.appendChild(messageElement);
  }
  
  // Clear any existing timeout
  if (messageElement.timeoutId) {
    clearTimeout(messageElement.timeoutId);
  }
  
  // Set message content
  messageElement.textContent = text;
  messageElement.style.color = color;
  
  // Show message with fade in
  messageElement.style.opacity = '1';
  
  // Hide message after duration
  messageElement.timeoutId = setTimeout(() => {
    messageElement.style.opacity = '0';
  }, duration);
}


// Manage heartbeat sound based on health
function updateHeartbeatSound() {
  if (!shuttle) return;
  
  const healthPercentage = shuttleHealth
  
  if (healthPercentage <= 30) {
    // Start or adjust heartbeat sound
    if (!heartBeatSound.isPlaying) heartBeatSound.play();
    // shootSound.play();
    
    // Adjust volume and rate based on health percentage
    // Lower health = louder and faster heartbeat
    if (heartBeatSound.isPlaying) {
      // Volume increases as health decreases (0.3 to 0.8)
      const volume = 0.3 + ((30 - healthPercentage) / 30) * 0.5;
      heartBeatSound.volume = volume;
      
      // Playback rate increases as health decreases (0.8 to 1.5)
      const playbackRate = 0.8 + ((30 - healthPercentage) / 30) * 0.7;
      heartBeatSound.playbackRate = playbackRate;
    }
  } else {
    // Stop heartbeat if health is above 30%
    if (heartBeatSound.isPlaying) heartBeatSound.stop();
  }
}
